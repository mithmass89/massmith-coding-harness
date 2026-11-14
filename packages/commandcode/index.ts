import type { ModApi } from '@commandcode/harness';
import { readFileSync } from 'node:fs';
import {
	checkDiff,
	composeSystemPrompt,
	redactSecrets,
	summarizeTurn,
	validateCommand
} from '../core/src/index.ts';

const skillDirs = ['massmith-review', 'code-review', 'deployment', 'docs-bilingual', 'ui-ux-pro-max', '3dviz-pro-max', 'frontend-design', 'using-superpowers', 'unit-test', 'code-review-and-quality', 'context-engineering'];
const skillsBase = new URL('../../skills/', import.meta.url);

function stripQuotes(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length >= 2) {
		const first = trimmed[0];
		const last = trimmed[trimmed.length - 1];
		if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
			return trimmed.slice(1, -1).trim();
		}
	}
	return trimmed;
}

function parseSkillMeta(raw: string): { name: string; description: string } {
	const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	const meta: Record<string, string> = {};
	if (frontmatter) {
		for (const line of frontmatter[1].split(/\r?\n/)) {
			const match = line.match(/^([\w-]+)\s*:\s*(.+)$/);
			if (match) meta[match[1]] = stripQuotes(match[2]);
		}
	}
	return { name: meta.name || '', description: meta.description || '' };
}

function loadSkillBody(dir: string): string | undefined {
	// Allowlist-only: cegah path traversal, nama harus persis di skillDirs.
	if (!skillDirs.includes(dir)) return undefined;
	try {
		return readFileSync(new URL(`${dir}/SKILL.md`, skillsBase), 'utf8');
	} catch {
		return undefined;
	}
}

/** Katalog ringan untuk prompt — AI memilih skill, isi penuh di-load via massmith_skill_load. */
function skillCatalog(): string {
	const lines = ['Available massmith skills (load the full SKILL.md via massmith_skill_load when relevant):'];
	for (const dir of skillDirs) {
		const body = loadSkillBody(dir);
		if (body === undefined) continue;
		const meta = parseSkillMeta(body);
		lines.push(`- ${meta.name || dir}: ${meta.description || dir}`);
	}
	return lines.join('\n');
}

const skillText = skillCatalog();

export default function (cmd: ModApi): void | Promise<void> {
	cmd.addFlag('strict', { type: 'boolean', default: false, description: 'Block dangerous commands' });
	cmd.addFlag('verbose', { type: 'boolean', default: false });

	cmd.hooks({
		appendSystemPrompt: () => composeSystemPrompt(skillText),

		beforeToolCall: async ({ toolName, input }) => {
			const command = typeof input?.command === 'string' ? input.command : '';
			if (!command) return undefined;
			const check = validateCommand(command, { strict: cmd.getFlag('strict') === true });
			if (check.blocked) {
				return {
					block: true,
					additionalContext: `Blocked by massmith-coding-harness: ${check.reason ?? 'dangerous command'}`
				};
			}
			void toolName;
			return undefined;
		},

		afterToolCall: async ({ result }) => {
			if (typeof result !== 'string' || !result) return undefined;
			if (result.includes('DEPRECATED')) {
				return {
					additionalContext: 'Tool result mentioned DEPRECATED — flag it to the user.'
				};
			}
			const redacted = redactSecrets(result);
			if (redacted !== result) {
				return {
					additionalContext: 'A secret was redacted from tool output.'
				};
			}
			return undefined;
		},

		transformInput: ({ text }) => {
			if (text.trim() === '#note') return { action: 'handled', message: 'noted.' };
			const trimmed = text.trim();
			if (trimmed.startsWith('/review ')) {
				return {
					action: 'transform',
					text: `Review perubahan ini untuk keamanan dan kelengkapan test:\n${trimmed.slice('/review '.length)}`
				};
			}
			return { action: 'continue' };
		},

		onStop: async ({ turnNumber }) => {
			if (cmd.getFlag('verbose') === true && turnNumber > 0) {
				return undefined;
			}
			return undefined;
		},

		onRunEnd: async () => {
			cmd.showEntry('massmith-summary', { ts: Date.now() });
		}
	});

	cmd.addTool({
		schema: {
			name: 'massmith_diff_check',
			description:
				'Check changed files for missing tests and diff size. Read-only, safe in plan mode.',
			input_schema: {
				type: 'object',
				properties: {
					files: { type: 'array', items: { type: 'string' } },
					maxDiffLines: { type: 'number' }
				},
				required: [],
				additionalProperties: false
			}
		},
		readOnly: true,
		run: async ({ input }) => {
			const files = Array.isArray(input?.files) ? input.files.filter(Boolean) : [];
			const result = checkDiff(files, {
				maxDiffLines: typeof input?.maxDiffLines === 'number' ? input.maxDiffLines : 400
			});
			const lines = [
				result.summary,
				`tracked: ${result.trackedFiles}, hasTests: ${result.hasTests}`,
				...result.warnings.map(w => `- ${w}`)
			];
			return { ok: true, content: [{ type: 'text', text: lines.join('\n') }] };
		}
	});

	cmd.addTool({
		schema: {
			name: 'massmith_skill_load',
			description:
				'Load the full body of one massmith skill (SKILL.md) on demand. Pick the name from the skill catalog in the system prompt; call only when the skill is relevant to the task.',
			input_schema: {
				type: 'object',
				properties: {
					name: { type: 'string', description: 'Skill name, e.g. unit-test' }
				},
				required: ['name'],
				additionalProperties: false
			}
		},
		readOnly: true,
		run: async ({ input }) => {
			const name = typeof input?.name === 'string' ? input.name.trim() : '';
			const body = name ? loadSkillBody(name) : undefined;
			if (body === undefined) {
				return {
					ok: true,
					content: [
						{
							type: 'text',
							text: `unknown skill: ${name || '(empty)'}. Available: ${skillDirs.join(', ')}`
						}
					]
				};
			}
			return { ok: true, content: [{ type: 'text', text: body }] };
		}
	});

	cmd.addTool({
		schema: {
			name: 'massmith_repo_size',
			description: 'Report the number of tracked files in the workspace.',
			input_schema: { type: 'object', properties: {}, required: [] }
		},
		readOnly: true,
		run: async () => {
			try {
				const { stdout } = await cmd.exec({ command: 'git', args: ['ls-files'] });
				const count = stdout.split('\n').filter(Boolean).length;
				return { ok: true, content: [{ type: 'text', text: `${count} tracked files` }] };
			} catch {
				return { ok: true, content: [{ type: 'text', text: 'not a git repository' }] };
			}
		}
	});

	cmd.addCommand({
		name: 'review',
		description: 'Review perubahan git untuk keamanan dan test coverage',
		argumentHint: '[--staged] [path]',
		handler: async ({ args, exec }) => {
			const staged = args.includes('--staged');
			const { stdout } = await exec({
				command: 'git',
				args: ['diff', '--name-only', ...(staged ? ['--cached'] : [])]
			});
			const files = stdout.split('\n').filter(Boolean);
			const check = checkDiff(files);
			const detail = [
				`changed files: ${files.length}`,
				...check.warnings.map(w => `- ${w}`),
				files.length ? files.slice(0, 20).join(', ') : 'no files changed'
			].join('\n');
			return {
				message: `Review:\n${detail}\n\nPrompt: Review perubahan ini untuk keamanan, correctness, dan missing tests.`
			};
		}
	});

	cmd.addCommand({
		name: 'massmith-status',
		description: 'Tampilkan status mod massmith-coding-harness',
		handler: () => ({
			message: `strict=${cmd.getFlag('strict')} verbose=${cmd.getFlag('verbose')} cwd=${cmd.cwd}`
		})
	});

	cmd.addRenderer('massmith-summary', data => {
		const summary = summarizeTurn(0, false);
		return [`◆ massmith: ${summary} :: ${JSON.stringify(data)}`];
	});

	cmd.on('tool_errored', () => cmd.ui.notify('tool errored — check feed', 'warning'));
	cmd.on('run_start', () => {
		cmd.ui.notify('massmith-coding-harness active', 'info');
	});
}
