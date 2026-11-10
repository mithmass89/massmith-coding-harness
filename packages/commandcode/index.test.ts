import type { ModApi } from '@commandcode/harness';
import mod from './index.ts';

function assert(cond: boolean, msg: string) {
	if (!cond) throw new Error(msg);
}

const flags: Record<string, { type?: string; default?: unknown }> = {};
let beforeToolCall:
	| ((event: { toolName: string; input: unknown }) => Promise<unknown>)
	| undefined;

const cmd = {
	addFlag(name: string, options: { type?: string; default?: unknown }) {
		flags[name] = options;
	},
	getFlag(name: string) {
		return flags[name]?.default;
	},
	addTool() {
		return { dispose() {} };
	},
	addCommand() {
		return { dispose() {} };
	},
	addRenderer() {
		return { dispose() {} };
	},
	hooks(hooks: { beforeToolCall?: typeof beforeToolCall }) {
		beforeToolCall = hooks.beforeToolCall;
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

console.log('commandcode.test.ts: all assertions passed');
