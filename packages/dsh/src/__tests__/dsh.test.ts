import { apply, parseConfig } from '../index.ts';

function assert(cond: boolean, msg: string) {
	if (!cond) throw new Error(msg);
}

interface FakeOptions {
	withGuard?: boolean;
	withSystemPrompt?: boolean;
	shell?: any;
}

function createFakeCtx(options: FakeOptions = {}) {
	const tools: any[] = [];
	const guards: any[] = [];
	const commands: any[] = [];
	const events = new Map<string, Function[]>();
	const sections: any[] = [];
	const ctx: any = {
		tools: {
			register(tool: any) {
				tools.push(tool);
				return () => {};
			},
			...(options.withGuard === false
				? {}
				: {
						guard(guard: any) {
							guards.push(guard);
							return () => {};
						}
					})
		},
		commands: {
			register(command: any) {
				commands.push(command);
				return () => {};
			}
		},
		on(event: string, handler: Function) {
			const handlers = events.get(event) ?? [];
			handlers.push(handler);
			events.set(event, handlers);
			return () => {};
		},
		effect(fn: () => unknown) {
			const dispose = fn();
			return typeof dispose === 'function' ? dispose : undefined;
		},
		get(name: string) {
			if (name === 'shell' && options.shell) return options.shell;
			if (name === 'systemPrompt' && options.withSystemPrompt !== false) {
				return {
					section(section: any) {
						sections.push(section);
						return () => {};
					}
				};
			}
			return undefined;
		}
	};
	return { ctx, tools, guards, commands, events, sections };
}

const defaults = parseConfig(undefined);
assert(defaults.strict === false, 'strict should default to false');
assert(defaults.verbose === false, 'verbose should default to false');
assert(defaults.maxDiffLines === 400, 'maxDiffLines should default to 400');
assert(defaults.checkTimeoutMs === 120000, 'checkTimeoutMs should default to 120000');
assert(parseConfig({ strict: false }).strict === false, 'strict false should be preserved');
assert(parseConfig({ maxDiffLines: -1 }).maxDiffLines === 400, 'invalid maxDiffLines should fall back');
assert(
	parseConfig({ checks: { test: 'pnpm test', empty: ' ' } }).checks.test === 'pnpm test',
	'checks should be parsed'
);
assert(
	parseConfig({ checks: { empty: ' ' } }).checks.empty === undefined,
	'empty checks should be dropped'
);

const main = createFakeCtx();
const mainResult = apply(main.ctx, {
	strict: true,
	maxDiffLines: 10,
	checks: { test: 'pnpm test' }
});
assert(mainResult === undefined, 'apply should register immediately, not return a disposer');
assert(main.tools.length === 3, 'three tools should be registered synchronously');
assert(main.commands.length === 3, 'three commands should be registered');
assert(main.guards.length === 1, 'monotonic tool guard should be registered');
assert(main.events.has('tools/post-execute'), 'post-execute listener missing');
assert(main.events.has('turn/end'), 'turn/end listener missing');
assert(main.sections.length === 1, 'system prompt section missing');
assert(
	main.sections[0].text.includes('small, reviewable'),
	'system prompt section missing base policy'
);
assert(
	main.sections[0].text.includes('Massmith Review'),
	'system prompt section missing loaded skills'
);

const guard = main.guards[0];
assert(
	typeof guard({ name: 'bash', arguments: { command: 'git commit --no-verify' } }) === 'string',
	'guard should block --no-verify'
);
assert(
	guard({ name: 'bash', arguments: { command: 'ls -la' } }) === undefined,
	'guard should allow safe command'
);
assert(
	guard({ name: 'read', arguments: { path: 'src/a.ts' } }) === undefined,
	'guard should ignore non-shell tools'
);

const diffTool = main.tools.find(tool => tool.name === 'massmith_diff_check');
assert(!!diffTool, 'diff tool missing');
const diffText = await diffTool.execute(
	{ files: ['src/a.ts'] },
	{ signal: new AbortController().signal }
);
assert(
	typeof diffText === 'string' && diffText.includes('no test file'),
	'diff tool should warn about missing tests'
);

const verifyTool = main.tools.find(tool => tool.name === 'massmith_verify');
assert(!!verifyTool, 'verify tool missing');
let verifyFailed = false;
try {
	await verifyTool.execute({}, { signal: new AbortController().signal });
} catch (error) {
	verifyFailed = error instanceof Error && error.message.includes('shell');
}
assert(verifyFailed, 'verify should fail when shell is unavailable and checks are configured');

const fallback = createFakeCtx({ withGuard: false, withSystemPrompt: false });
apply(fallback.ctx, { strict: true });
assert(fallback.guards.length === 0, 'guard should not be registered without the service');
assert(fallback.tools.length === 3, 'tools should still register without optional services');
assert(fallback.sections.length === 0, 'prompt section should be skipped without systemPrompt');
const preExecute = fallback.events.get('tools/pre-execute')?.[0];
assert(typeof preExecute === 'function', 'pre-execute fallback missing');

let nextCalled = false;
const denied = await preExecute(
	{ name: 'bash', arguments: { command: 'git push --force' } },
	async () => {
		nextCalled = true;
		return { kind: 'allow' };
	}
);
assert(denied.kind === 'deny', 'fallback should deny dangerous command');
assert(!nextCalled, 'fallback must not call next after denial');

const allowed = await preExecute(
	{ name: 'bash', arguments: { command: 'git status' } },
	async () => {
		nextCalled = true;
		return { kind: 'allow' };
	}
);
assert(allowed.kind === 'allow' && nextCalled, 'fallback should delegate safe command');

const defaultGuard = createFakeCtx();
apply(defaultGuard.ctx, {});
assert(
	defaultGuard.guards[0]({ name: 'bash', arguments: { command: 'git push --force' } }) ===
		undefined,
	'default guard should bypass dangerous command when strict is omitted'
);

const postExecute = main.events.get('tools/post-execute')?.[0];
assert(typeof postExecute === 'function', 'post-execute handler missing');
const redactedDecision = await postExecute(
	{ name: 'read', arguments: {} },
	{ content: [{ type: 'text', text: 'api_key=abcdefghijklmnop' }] },
	async () => ({ kind: 'accept' })
);
assert(
	redactedDecision.content?.[0]?.text.includes('[REDACTED]'),
	'post-execute should redact secrets'
);
const deprecatedDecision = await postExecute(
	{ name: 'read', arguments: {} },
	{ content: [{ type: 'text', text: 'DEPRECATED: use another tool' }] },
	async () => ({ kind: 'accept' })
);
assert(
	deprecatedDecision.content.some((block: any) => block.text === '[flagged: DEPRECATED]'),
	'post-execute should flag DEPRECATED'
);

const fakeShell = {
	resolve(request: any) {
		return request;
	},
	async execute(spec: any) {
		const command = String(spec.command);
		const stdout = command.startsWith('git diff HEAD')
			? '5\t5\tsrc/a.ts\n'
			: command === 'git ls-files'
				? 'a.ts\nb.ts\n'
				: 'ok\n';
		return {
			async result() {
				return {
					exitCode: 0,
					signal: null,
					timedOut: false,
					aborted: false,
					stdout: { text: stdout },
					stderr: { text: '' }
				};
			}
		};
	}
};

const withShell = createFakeCtx({ shell: fakeShell });
apply(withShell.ctx, { strict: true, maxDiffLines: 2, checks: { test: 'pnpm test' } });
const shellDiffTool = withShell.tools.find(tool => tool.name === 'massmith_diff_check');
const shellDiffText = await shellDiffTool.execute(
	{ files: ['src/a.ts', 'src/a.test.ts'] },
	{ signal: new AbortController().signal }
);
assert(
	shellDiffText.includes('diff size 10 exceeds maxDiffLines 2'),
	'adapter should enforce maxDiffLines from git numstat'
);
const repoSizeTool = withShell.tools.find(tool => tool.name === 'massmith_repo_size');
const repoSizeText = await repoSizeTool.execute(
	{},
	{ signal: new AbortController().signal }
);
assert(repoSizeText === '2 tracked files', 'repo size should count git ls-files');
const shellVerifyTool = withShell.tools.find(tool => tool.name === 'massmith_verify');
const shellVerifyText = await shellVerifyTool.execute(
	{},
	{ signal: new AbortController().signal }
);
assert(shellVerifyText.includes('- test: ok'), 'verify should run configured checks');

console.log('dsh.test.ts: all assertions passed');
