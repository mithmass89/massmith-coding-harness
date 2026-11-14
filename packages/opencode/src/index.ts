import { Plugin } from '@opencode/plugin';
import { readFileSync } from 'node:fs';
import {
	checkDiff,
	composeSystemPrompt,
	redactSecrets,
	summarizeTurn,
	validateCommand
} from '../../core/src/index.ts';

const skillDirs = ['massmith-review', 'code-review', 'deployment', 'docs-bilingual', 'ui-ux-pro-max', '3dviz-pro-max', 'frontend-design', 'using-superpowers', 'unit-test', 'code-review-and-quality', 'context-engineering'];
const skillsBase = new URL('../../../skills/', import.meta.url);

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

/** Katalog ringan untuk prompt — AI memilih skill, isi penuh di-load via massmith/skill. */
function skillCatalog(): string {
	const lines = ['Available massmith skills (load the full SKILL.md via massmith/skill when relevant):'];
	for (const dir of skillDirs) {
		const body = loadSkillBody(dir);
		if (body === undefined) continue;
		const meta = parseSkillMeta(body);
		lines.push(`- ${meta.name || dir}: ${meta.description || dir}`);
	}
	return lines.join('\n');
}

const skillText = skillCatalog();

export default Plugin.define({
	id: 'massmith-coding-harness',
	async setup(ctx) {
		await ctx.storage.set('loaded', true);
		await ctx.storage.set('version', '0.1.0');

		const strict = ctx.options.strict === true;
		const verbose = ctx.options.verbose === true;

		await ctx.tool.namespace({
			name: 'massmith',
			description: 'Coding guardrails and diff checks'
		});

		await ctx.tool.transform(editor => {
			editor.add({
				name: 'diff_check',
				description: 'Check changed files for missing tests and diff size',
				input: {
					type: 'object',
					properties: {
						files: { type: 'array', items: { type: 'string' } },
						maxDiffLines: { type: 'number' }
					},
					required: [],
					additionalProperties: false
				},
				options: { namespace: 'massmith', codemode: true },
				execute: async (input, context) => {
					await context.progress({ status: 'checking diff' });
					const files = Array.isArray(input?.files) ? input.files.filter(Boolean) : [];
					const result = checkDiff(files, {
						maxDiffLines: input?.maxDiffLines ?? 400
					});
					const lines = [
						result.summary,
						`tracked: ${result.trackedFiles}, hasTests: ${result.hasTests}`,
						...result.warnings.map(w => `- ${w}`)
					];
					return { content: lines.join('\n') };
				}
			});

			editor.add({
				name: 'repo_size',
				description: 'Report number of tracked files',
				input: { type: 'object', properties: {}, required: [], additionalProperties: false },
				options: { namespace: 'massmith', codemode: true },
				execute: async () => {
					return { content: summarizeTurn(0, false) };
				}
			});

			editor.add({
				name: 'skill',
				description:
					'Load the full body of one massmith skill (SKILL.md) on demand. Pick the name from the skill catalog in the system prompt; call only when the skill is relevant to the task.',
				input: {
					type: 'object',
					properties: {
						name: { type: 'string', description: 'Skill name, e.g. unit-test' }
					},
					required: ['name'],
					additionalProperties: false
				},
				options: { namespace: 'massmith', codemode: true },
				execute: async input => {
					const name = typeof input?.name === 'string' ? input.name.trim() : '';
					const body = name ? loadSkillBody(name) : undefined;
					if (body === undefined) {
						return { content: `unknown skill: ${name || '(empty)'}. Available: ${skillDirs.join(', ')}` };
					}
					return { content: body };
				}
			});
		});

		await ctx.command.transform(editor => {
			editor.add({
				name: 'review',
				description: 'Review perubahan git untuk keamanan dan test coverage',
				execute: async ({ sessionID, prompt, delivery }) => {
					const info = await ctx.vcs.get();
					const changes = info ? await ctx.vcs.status() : undefined;
					const files =
						changes?.files?.map((f: { path: string }) => f.path) ?? [];
					const check = checkDiff(files);
					const text = [
						`Review changes (${files.length} files)`,
						check.warnings.length ? check.warnings.join('\n') : 'no warnings',
						'Review: keamanan, correctness, missing tests.'
					].join('\n');
					await ctx.session.prompt({
						...prompt,
						sessionID,
						text: `${text}\n\n${prompt.text}`,
						delivery
					});
				}
			});

			editor.add({
				name: 'massmith-status',
				description: 'Tampilkan status plugin massmith',
				execute: async ({ sessionID, prompt, delivery }) => {
					await ctx.session.prompt({
						...prompt,
						sessionID,
						text: `Status massmith: strict=${strict} verbose=${verbose} location=${ctx.location.directory}`,
						delivery
					});
				}
			});
		});

		await ctx.session.hook('context', event => {
			event.system.push({ type: 'text', text: composeSystemPrompt(skillText) });
			if (verbose) {
				event.options.temperature = 0.2;
			}
			for (const tool of Object.keys(event.tools)) {
				if (tool.startsWith('massmith_') && !tool.includes('diff_check') && !tool.includes('repo_size')) {
					delete event.tools[tool];
				}
			}
		});

		await ctx.tool.hook('execute.before', event => {
			if (event.status === 'error') return;
			if (event.tool !== 'shell') return;
			const command = (event.input as { command?: string })?.command ?? '';
			if (!command) return;
			const check = validateCommand(command, { strict });
			if (check.blocked) {
				event.input = {
					...(event.input as object),
					command: `echo "blocked: ${check.reason ?? 'dangerous command'}" && exit 1`
				} as typeof event.input;
			}
		});

		await ctx.tool.hook('execute.after', event => {
			if (event.status === 'completed' && typeof event.result?.content === 'string') {
				const content = event.result.content as string;
				if (content.includes('DEPRECATED')) {
					event.result = {
						...event.result,
						metadata: { ...(event.result.metadata ?? {}), deprecation: true },
						content: `${content}\n[flagged: DEPRECATED]`
					};
				} else {
					const redacted = redactSecrets(content);
					if (redacted !== content) {
						event.result = { ...event.result, content: redacted };
					}
				}
			}
		});

		await ctx.permission.hook('evaluate', event => {
			if (event.action === 'shell' || event.action === 'execute') {
				const resources = event.resources.join(' ');
				if (resources.includes('--no-verify') || resources.includes('rm -rf')) {
					event.effect = 'deny';
					event.message = 'massmith: dangerous command blocked';
				}
			}
		});

		await ctx.session.hook('prompt', event => {
			if (event.prompt.text.trim() === '#note') {
				event.prompt.text = 'noted.';
			}
			if (event.prompt.text.trim().startsWith('/review ')) {
				event.prompt.text = `Review perubahan ini:\n${event.prompt.text.slice('/review '.length)}`;
			}
			event.prompt.text = redactSecrets(event.prompt.text);
		});

		const controller = new AbortController();
		void (async () => {
			for await (const ev of ctx.event.subscribe({ signal: controller.signal })) {
				if (ev.type === 'session.created' || ev.type === 'session.updated') {
					// no-op placeholder for session telemetry
				}
			}
		})();

		return () => {
			controller.abort();
		};
	}
});
