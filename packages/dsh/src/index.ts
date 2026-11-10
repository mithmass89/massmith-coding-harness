import { readFileSync } from 'node:fs';

import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import {
	checkDiff,
	composeSystemPrompt,
	parseGitNumstat,
	redactSecrets,
	validateCommand
} from '../../core/src/index.ts';
import type { DiffStat } from '../../core/src/index.ts';

export const name = 'massmith-dsh';
export const inject = ['tools', 'commands'];

const skillDirs = [
	'massmith-review',
	'code-review',
	'deployment',
	'docs-bilingual',
	'ui-ux-pro-max',
	'3dviz-pro-max',
	'frontend-design',
	'using-superpowers',
	'unit-test',
	'code-review-and-quality',
	'context-engineering'
];

interface LocalSkill {
	name: string;
	description: string;
	content: string;
	userInvocable: boolean;
	modelInvocable: boolean;
}

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

function parseSkillFile(dir: string, raw: string): LocalSkill {
	const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	const body = frontmatter ? raw.slice(frontmatter[0].length) : raw;
	const meta: Record<string, string> = {};
	if (frontmatter) {
		for (const line of frontmatter[1].split(/\r?\n/)) {
			const match = line.match(/^([\w-]+)\s*:\s*(.+)$/);
			if (match) meta[match[1]] = match[2].trim();
		}
	}
	return {
		name: stripQuotes(meta.name) || dir,
		description: stripQuotes(meta.description) || dir,
		content: raw,
		userInvocable: meta.userInvocable !== 'false',
		modelInvocable: meta['disable-model-invocation'] !== 'true'
	};
}

function loadLocalSkills(): LocalSkill[] {
	const skills: LocalSkill[] = [];
	for (const dir of skillDirs) {
		try {
			const raw = readFileSync(
				new URL(`../../../skills/${dir}/SKILL.md`, import.meta.url),
				'utf8'
			);
			skills.push(parseSkillFile(dir, raw));
		} catch {
			// A missing skill must not break plugin boot.
		}
	}
	return skills;
}

function loadOptionalSkills(): string {
	return loadLocalSkills()
		.map(skill => skill.content)
		.join('\n\n');
}

export interface MassmithConfig {
	strict?: boolean;
	verbose?: boolean;
	maxDiffLines?: number;
	checkTimeoutMs?: number;
	checks?: Record<string, string>;
	shellTools?: string[];
}

export interface ResolvedMassmithConfig {
	strict: boolean;
	verbose: boolean;
	maxDiffLines: number;
	checkTimeoutMs: number;
	checks: Record<string, string>;
	shellTools: string[];
}

export function parseConfig(raw: unknown): ResolvedMassmithConfig {
	const cfg =
		raw && typeof raw === 'object' ? (raw as MassmithConfig) : ({} as MassmithConfig);
	const checks: Record<string, string> = {};
	if (cfg.checks && typeof cfg.checks === 'object') {
		for (const [name, command] of Object.entries(cfg.checks)) {
			if (typeof command === 'string' && command.trim()) checks[name] = command.trim();
		}
	}
	const shellTools = Array.isArray(cfg.shellTools)
		? cfg.shellTools
				.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
				.map(item => item.trim())
		: ['bash', 'pwsh'];
	return {
		strict: cfg.strict === true,
		verbose: cfg.verbose === true,
		maxDiffLines:
			typeof cfg.maxDiffLines === 'number' &&
			Number.isFinite(cfg.maxDiffLines) &&
			cfg.maxDiffLines > 0
				? Math.floor(cfg.maxDiffLines)
				: 400,
		checkTimeoutMs:
			typeof cfg.checkTimeoutMs === 'number' &&
			Number.isFinite(cfg.checkTimeoutMs) &&
			cfg.checkTimeoutMs > 0
				? Math.floor(cfg.checkTimeoutMs)
				: 120000,
		checks,
		shellTools
	};
}

interface ShellResult {
	exitCode: number | null;
	signal: string | null;
	timedOut: boolean;
	aborted?: boolean;
	stdout?: { text?: string };
	stderr?: { text?: string };
}

interface ShellService {
	resolve(request: Record<string, unknown>): unknown;
	execute(spec: unknown): Promise<{ result(): Promise<ShellResult> }>;
}

interface GitDiffStats {
	files: string[];
	stats: DiffStat[];
}

interface CheckResult {
	name: string;
	exitCode: number | null;
	timedOut: boolean;
	aborted: boolean;
	output: string;
	ok: boolean;
}

function getService<T>(ctx: unknown, name: string): T | undefined {
	const record = ctx as Record<string, unknown> | undefined;
	if (!record) return undefined;
	try {
		const get = (record as { get?: (key: string, strict?: boolean) => unknown }).get;
		if (typeof get === 'function') {
			// Non-strict first: inactive services also resolve without throwing.
			// Never fall back to record[name]: on Cordis that property read
			// throws "cannot get property ... without inject" when undeclared.
			try {
				const loose = get.call(record, name, false);
				if (loose !== undefined) return loose as T;
			} catch {
				// Fall through to the strict lookup below.
			}
			const value = get.call(record, name);
			if (value !== undefined) return value as T;
		}
	} catch {
		// Optional services may throw on lookup when absent.
	}
	return undefined;
}

function registerEffect(ctx: Context, register: () => unknown): void {
	let effect: unknown;
	try {
		effect = (ctx as unknown as { effect?: unknown }).effect;
	} catch {
		effect = undefined;
	}
	if (typeof effect === 'function') {
		(effect as (fn: () => unknown) => unknown).call(ctx, () => {
			const dispose = register();
			return typeof dispose === 'function' ? dispose : undefined;
		});
		return;
	}
	register();
}

async function runShell(
	ctx: unknown,
	command: string,
	timeoutMs: number,
	signal?: AbortSignal
): Promise<ShellResult> {
	const shell = getService<ShellService>(ctx, 'shell');
	if (!shell || typeof shell.resolve !== 'function' || typeof shell.execute !== 'function') {
		throw new Error('shell service unavailable');
	}
	const execution = await shell.execute(
		shell.resolve({
			command,
			timeoutMs,
			stdoutMaxBytes: 4 * 1024 * 1024,
			signal
		})
	);
	return execution.result();
}

async function readUntrackedFiles(ctx: unknown, signal: AbortSignal): Promise<string[]> {
	try {
		const result = await runShell(
			ctx,
			'git ls-files --others --exclude-standard',
			30000,
			signal
		);
		if (result.exitCode !== 0) return [];
		return (result.stdout?.text ?? '').split(/\r?\n/).filter(Boolean);
	} catch {
		return [];
	}
}

async function readGitDiffStats(
	ctx: unknown,
	signal: AbortSignal
): Promise<GitDiffStats | undefined> {
	const commands = [
		'git diff HEAD --numstat --no-ext-diff',
		'git diff --numstat --no-ext-diff'
	];
	for (const command of commands) {
		try {
			const result = await runShell(ctx, command, 30000, signal);
			if (result.exitCode === 0) {
				const stats = parseGitNumstat(result.stdout?.text ?? '');
				const known = new Set(stats.map(stat => stat.file));
				for (const file of await readUntrackedFiles(ctx, signal)) {
					if (!known.has(file)) {
						stats.push({ file, additions: 0, deletions: 0, binary: false });
					}
				}
				return { files: stats.map(stat => stat.file), stats };
			}
		} catch {
			return undefined;
		}
	}
	return undefined;
}

async function runChecks(
	ctx: unknown,
	config: ResolvedMassmithConfig,
	signal: AbortSignal
): Promise<CheckResult[]> {
	const results: CheckResult[] = [];
	for (const [name, command] of Object.entries(config.checks)) {
		const result = await runShell(ctx, command, config.checkTimeoutMs, signal);
		const output = [result.stdout?.text ?? '', result.stderr?.text ?? '']
			.filter(Boolean)
			.join('\n')
			.trim();
		results.push({
			name,
			exitCode: result.exitCode,
			timedOut: result.timedOut,
			aborted: result.aborted === true,
			output: truncate(redactSecrets(output), 4000),
			ok: result.exitCode === 0 && !result.timedOut && result.aborted !== true
		});
	}
	return results;
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max)}\n… truncated (${text.length - max} chars)`;
}

function formatCheck(check: CheckResult): string {
	const status = check.ok
		? 'ok'
		: check.timedOut
			? 'timeout'
			: check.aborted
				? 'aborted'
				: `failed (exit ${check.exitCode ?? 'signal'})`;
	return check.output ? `- ${check.name}: ${status}\n${check.output}` : `- ${check.name}: ${status}`;
}

type TextBlock = { type: 'text'; text: string } & Record<string, unknown>;

function isTextBlock(block: unknown): block is TextBlock {
	return (
		!!block &&
		typeof block === 'object' &&
		(block as { type?: unknown }).type === 'text' &&
		typeof (block as { text?: unknown }).text === 'string'
	);
}

function redactBlocks(blocks: unknown): unknown {
	if (!Array.isArray(blocks)) return blocks;
	let changed = false;
	const next = blocks.map(block => {
		if (!isTextBlock(block)) return block;
		const text = redactSecrets(block.text);
		if (text === block.text) return block;
		changed = true;
		return { ...block, text };
	});
	return changed ? next : blocks;
}

function flagDeprecated(blocks: unknown): unknown {
	if (!Array.isArray(blocks)) return blocks;
	const hasDeprecated = blocks.some(
		block => isTextBlock(block) && block.text.includes('DEPRECATED')
	);
	const alreadyFlagged = blocks.some(
		block => isTextBlock(block) && block.text === '[flagged: DEPRECATED]'
	);
	if (!hasDeprecated || alreadyFlagged) return blocks;
	return [...blocks, { type: 'text', text: '[flagged: DEPRECATED]' }];
}

function commandFromArguments(args: unknown): string {
	if (!args || typeof args !== 'object') return '';
	const command = (args as { command?: unknown }).command;
	return typeof command === 'string' ? command : '';
}

function policyReason(exec: unknown, config: ResolvedMassmithConfig): string | undefined {
	if (!exec || typeof exec !== 'object') return undefined;
	const name = (exec as { name?: unknown }).name;
	if (typeof name !== 'string' || !config.shellTools.includes(name)) return undefined;
	const command = commandFromArguments((exec as { arguments?: unknown }).arguments);
	if (!command.trim()) return undefined;
	const check = validateCommand(command, { strict: config.strict });
	return check.blocked ? check.reason ?? 'dangerous command blocked' : undefined;
}

function makeDiffTool(ctx: Context, config: ResolvedMassmithConfig) {
	return defineTool({
		name: 'massmith_diff_check',
		description:
			'Check changed files for missing tests and enforce maxDiffLines. Read-only, safe in plan mode.',
		parameters: {
			files: {
				type: 'array',
				items: { type: 'string' },
				description: 'Changed files to check; omit to read git diff'
			},
			maxDiffLines: { type: 'number', description: 'Maximum total changed lines' }
		},
		output: {
			schema: { type: 'string' },
			render: (_args, value) => [{ type: 'text', text: value }]
		},
		async execute(args, exec) {
			const stats = await readGitDiffStats(ctx, exec.signal);
			const files =
				args.files && args.files.length > 0 ? args.files : (stats?.files ?? []);
			const selectedStats =
				stats && files.length > 0
					? stats.stats.filter(stat => files.includes(stat.file))
					: stats?.stats;
			const max =
				typeof args.maxDiffLines === 'number' && args.maxDiffLines > 0
					? args.maxDiffLines
					: config.maxDiffLines;
			const check = checkDiff(files, { maxDiffLines: max, diffStats: selectedStats });
			const lines = [
				check.summary,
				`changed: ${check.changedFiles}, totalDiffLines: ${check.totalDiffLines}, maxDiffLines: ${check.maxDiffLines}`,
				`diff stats: ${stats ? 'available' : 'unavailable'}`,
				...check.warnings.map(warning => `- ${warning}`)
			];
			return redactSecrets(lines.join('\n'));
		}
	});
}

function makeVerifyTool(ctx: Context, config: ResolvedMassmithConfig) {
	return defineTool({
		name: 'massmith_verify',
		description:
			'Run git diff size check plus configured test/typecheck/lint commands through the dsh shell service.',
		parameters: {},
		output: {
			schema: { type: 'string' },
			render: (_args, value) => [{ type: 'text', text: value }]
		},
		async execute(_args, exec) {
			const stats = await readGitDiffStats(ctx, exec.signal);
			const check = checkDiff(stats?.files ?? [], {
				maxDiffLines: config.maxDiffLines,
				diffStats: stats?.stats
			});
			const checks = await runChecks(ctx, config, exec.signal);
			const lines = [
				check.summary,
				`diff stats: ${stats ? 'available' : 'unavailable'}`,
				...check.warnings.map(warning => `- ${warning}`),
				'checks:',
				...(checks.length > 0 ? checks.map(formatCheck) : ['- no checks configured'])
			];
			return redactSecrets(lines.join('\n'));
		}
	});
}

function makeRepoSizeTool(ctx: Context) {
	return defineTool({
		name: 'massmith_repo_size',
		description: 'Report the number of tracked files (git ls-files). Read-only.',
		parameters: {},
		output: {
			schema: { type: 'string' },
			render: (_args, value) => [{ type: 'text', text: value }]
		},
		async execute(_args, exec) {
			const result = await runShell(ctx, 'git ls-files', 30000, exec.signal);
			if (result.exitCode !== 0) {
				throw new Error(
					`git ls-files failed: ${redactSecrets(
						result.stderr?.text?.trim() || `exit ${result.exitCode ?? 'signal'}`
					)}`
				);
			}
			const count = (result.stdout?.text ?? '').split(/\r?\n/).filter(Boolean).length;
			return `${count} tracked files`;
		}
	});
}

function registerTools(ctx: Context, config: ResolvedMassmithConfig): void {
	const tools = (ctx as unknown as { tools: { register(definition: unknown): unknown } }).tools;
	tools.register(makeDiffTool(ctx, config));
	tools.register(makeVerifyTool(ctx, config));
	tools.register(makeRepoSizeTool(ctx));
}

function registerPolicy(ctx: Context, config: ResolvedMassmithConfig): void {
	const tools = (ctx as unknown as {
		tools?: { guard?: (guard: (exec: unknown) => string | undefined) => unknown };
	}).tools;
	if (tools && typeof tools.guard === 'function') {
		tools.guard(exec => policyReason(exec, config));
		return;
	}
	const on = (ctx as unknown as {
		on(event: string, handler: (exec: unknown, next: () => unknown) => unknown): unknown;
	}).on;
	on('tools/pre-execute', async (exec, next) => {
		const reason = policyReason(exec, config);
		if (reason) return { kind: 'deny', reason };
		return next();
	});
}

function registerPostExecute(ctx: Context): void {
	const on = (ctx as unknown as {
		on(
			event: string,
			handler: (exec: unknown, result: unknown, next: () => unknown) => unknown
		): unknown;
	}).on;
	on('tools/post-execute', async (_exec, result, next) => {
		const decision = (await next()) as {
			kind?: string;
			content?: unknown;
			value?: unknown;
			feedback?: unknown;
		};
		if (!decision || typeof decision !== 'object') return decision;
		if (decision.kind === 'block') {
			const feedback = flagDeprecated(redactBlocks(decision.feedback));
			return feedback === decision.feedback ? decision : { ...decision, feedback };
		}
		if (decision.kind !== 'accept' || decision.value !== undefined) return decision;
		const original =
			decision.content ?? (result as { content?: unknown } | undefined)?.content;
		const redacted = flagDeprecated(redactBlocks(original));
		return redacted === original ? decision : { ...decision, content: redacted };
	});
}

function registerNativeSkills(ctx: Context, skills: LocalSkill[]): number {
	const registry = getService<{
		register?: (skill: {
			name: string;
			description: string;
			content: string;
			source: 'bundled';
			invocation: { modelInvocable: boolean; userInvocable: boolean };
		}) => unknown;
	}>(ctx, 'skills');
	if (!registry || typeof registry.register !== 'function') return 0;
	let count = 0;
	for (const skill of skills) {
		try {
			registerEffect(ctx, () =>
				registry.register?.({
					name: skill.name,
					description: skill.description,
					content: skill.content,
					source: 'bundled',
					invocation: {
						modelInvocable: skill.modelInvocable,
						userInvocable: skill.userInvocable
					}
				})
			);
			count++;
		} catch {
			// One bad skill must not break plugin boot.
		}
	}
	return count;
}

function registerSystemPrompt(ctx: Context, skillText: string): void {
	const systemPrompt = getService<{
		section?: (section: { name: string; order: number; text: string }) => unknown;
	}>(ctx, 'systemPrompt');
	if (!systemPrompt || typeof systemPrompt.section !== 'function') return;
	registerEffect(ctx, () =>
		systemPrompt.section?.({
			name: 'massmith:policy',
			order: 500,
			text: composeSystemPrompt(skillText)
		})
	);
}

function registerTurnEnd(ctx: Context, config: ResolvedMassmithConfig): void {
	const on = (ctx as unknown as {
		on(event: string, handler: () => void): unknown;
	}).on;
	on('turn/end', () => {
		if (!config.verbose) return;
		const telemetry = getService<{ event?: (name: string, payload: unknown) => unknown }>(
			ctx,
			'telemetry'
		);
		try {
			telemetry?.event?.('massmith.turn_end', { ts: Date.now() });
		} catch {
			// Telemetry is optional.
		}
	});
}

function registerCommands(ctx: Context, config: ResolvedMassmithConfig): void {
	const commands = (ctx as unknown as {
		commands: { register(command: unknown): unknown };
	}).commands;

	commands.register({
		name: 'review',
		description: 'Review git changes for safety and test coverage',
		input: { hint: '[--staged] [path]' },
		handler: async ({ rawInput, signal }: { rawInput?: string; signal: AbortSignal }) => {
			const tokens = String(rawInput ?? '').trim().split(/\s+/).filter(Boolean);
			const staged = tokens.includes('--staged');
			const path = tokens.find(token => token !== '--staged');
			if (path && !/^[\w./\\-]+$/.test(path)) {
				return { kind: 'error', text: 'review: path contains unsupported characters' };
			}
			const safePath = path?.replace(/\\/g, '/');
			const command = `git diff --name-only${staged ? ' --cached' : ''}${
				safePath ? ` -- ${safePath}` : ''
			}`;
			try {
				const result = await runShell(ctx, command, 30000, signal);
				if (result.exitCode !== 0) {
					return {
						kind: 'error',
						text: `review: git diff failed (exit ${result.exitCode ?? 'signal'})`
					};
				}
				const files = (result.stdout?.text ?? '').split(/\r?\n/).filter(Boolean);
				const check = checkDiff(files);
				const text = [
					`changed files: ${files.length}`,
					...check.warnings.map(warning => `- ${warning}`),
					files.length > 0 ? files.slice(0, 20).join(', ') : 'no files changed',
					'Review: keamanan, correctness, missing tests.'
				].join('\n');
				return { kind: 'success', text };
			} catch (error) {
				return {
					kind: 'error',
					text: `review: ${error instanceof Error ? error.message : 'shell unavailable'}`
				};
			}
		}
	});

	commands.register({
		name: 'verify',
		description: 'Run diff check plus configured test/typecheck/lint',
		input: { hint: '' },
		handler: async ({ signal }: { signal: AbortSignal }) => {
			try {
				const stats = await readGitDiffStats(ctx, signal);
				const check = checkDiff(stats?.files ?? [], {
					maxDiffLines: config.maxDiffLines,
					diffStats: stats?.stats
				});
				const checks = await runChecks(ctx, config, signal);
				const ok = checks.every(item => item.ok) && !check.exceededMaxDiffLines;
				const text = [
					check.summary,
					...check.warnings.map(warning => `- ${warning}`),
					'checks:',
					...(checks.length > 0 ? checks.map(formatCheck) : ['- no checks configured'])
				].join('\n');
				return { kind: ok ? 'success' : 'error', text };
			} catch (error) {
				return {
					kind: 'error',
					text: `verify: ${error instanceof Error ? error.message : 'shell unavailable'}`
				};
			}
		}
	});

	commands.register({
		name: 'massmith-status',
		description: 'Show massmith config and available dsh services',
		input: { hint: '' },
		handler: () => {
			const shell = getService(ctx, 'shell');
			const systemPrompt = getService(ctx, 'systemPrompt');
			const skills = getService(ctx, 'skills');
			const goals = getService(ctx, 'goals');
			const subagents = getService(ctx, 'subagents');
			const text = [
				`strict=${config.strict} verbose=${config.verbose} maxDiffLines=${config.maxDiffLines}`,
				`checks=${Object.keys(config.checks).join(',') || 'none'}`,
				`shellTools=${config.shellTools.join(',')}`,
				`services: shell=${!!shell} systemPrompt=${!!systemPrompt} skills=${!!skills} goals=${!!goals} subagents=${!!subagents}`,
				`skillsLoaded=${skillDirs.length}`
			].join('\n');
			return { kind: 'success', text };
		}
	});
}

export function apply(ctx: Context, rawConfig?: unknown): void {
	// Cordis passes the validated row config as the 2nd arg. Only fall back
	// to the optional `config` service via a throw-safe lookup — never via
	// a direct property read (that throws without an inject declaration).
	const config = parseConfig(rawConfig ?? getService(ctx, 'config'));
	const localSkills = loadLocalSkills();
	const nativeCount = registerNativeSkills(ctx, localSkills);
	// DSH-native path: full bodies live in ctx.skills (lazy-loaded via
	// tool-skill), the prompt section only carries the policy + catalogue.
	// Fallback (no skills service, e.g. old hosts/tests): embed full bodies.
	const skillText =
		nativeCount > 0
			? [
					'Available massmith skills (load via the skill tool when relevant):',
					...localSkills.map(skill => `- ${skill.name}: ${skill.description}`)
				].join('\n')
			: localSkills.map(skill => skill.content).join('\n\n');
	registerTools(ctx, config);
	registerPolicy(ctx, config);
	registerPostExecute(ctx);
	registerSystemPrompt(ctx, skillText);
	registerTurnEnd(ctx, config);
	registerCommands(ctx, config);
}
