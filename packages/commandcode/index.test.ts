import type { ModApi } from '@commandcode/harness';
import mod from './index.ts';

function assert(cond: boolean, msg: string) {
	if (!cond) throw new Error(msg);
}

const flags: Record<string, { type?: string; default?: unknown }> = {};
const tools: Record<string, any> = {};
let beforeToolCall:
	| ((event: { toolName: string; input: unknown }) => Promise<unknown>)
	| undefined;
let appendSystemPrompt: (() => string) | undefined;

const cmd = {
	addFlag(name: string, options: { type?: string; default?: unknown }) {
		flags[name] = options;
	},
	getFlag(name: string) {
		return flags[name]?.default;
	},
	addTool(def: any) {
		tools[def.schema.name] = def;
		return { dispose() {} };
	},
	addCommand() {
		return { dispose() {} };
	},
	addRenderer() {
		return { dispose() {} };
	},
	hooks(hooks: { beforeToolCall?: typeof beforeToolCall; appendSystemPrompt?: () => string }) {
		beforeToolCall = hooks.beforeToolCall;
		appendSystemPrompt = hooks.appendSystemPrompt;
		return { dispose() {} };
	},
	on() {
		return { dispose() {} };
	},
	showEntry() {},
	ui: { notify() {} },
	cwd: process.cwd()
};

mod(cmd as unknown as ModApi);

assert(flags.strict?.default === false, 'strict should default to false');
assert(flags.verbose?.default === false, 'verbose should default to false');

const bypassed = await beforeToolCall?.({
	toolName: 'shell',
	input: { command: 'git commit --no-verify' }
});
assert(bypassed === undefined, 'default should bypass dangerous command');

flags.strict.default = true;
const blocked = (await beforeToolCall?.({
	toolName: 'shell',
	input: { command: 'git commit --no-verify' }
})) as { block?: boolean } | undefined;
assert(blocked?.block === true, 'strict=true should block dangerous command');

// Lazy skills: prompt hanya katalog, isi penuh via massmith_skill_load.
const prompt = appendSystemPrompt?.() ?? '';
assert(prompt.includes('Available massmith skills'), 'prompt should carry the skill catalog');
assert(prompt.includes('unit-test'), 'catalog should list unit-test');
assert(
	!prompt.includes('AUTONOMOUS MODE'),
	'prompt must not embed full skill bodies (lazy-load)'
);

const skillTool = tools['massmith_skill_load'];
assert(!!skillTool, 'massmith_skill_load tool missing');
const loaded = await skillTool.run({ input: { name: 'unit-test' } });
assert(
	loaded?.ok === true && loaded.content[0]?.text.includes('AUTONOMOUS MODE'),
	'skill loader should return the full SKILL.md body'
);
const traversal = await skillTool.run({ input: { name: '../../package' } });
assert(
	traversal?.ok === true && traversal.content[0]?.text.startsWith('unknown skill:'),
	'skill loader must reject path traversal'
);
const empty = await skillTool.run({ input: {} });
assert(
	empty?.ok === true && empty.content[0]?.text.startsWith('unknown skill:'),
	'skill loader must reject empty name'
);

console.log('commandcode.test.ts: all assertions passed');
