import { Plugin } from '@opencode/plugin';

export const RpcSchema = {
	getStatus: {
		input: {},
		output: { strict: 'boolean', verbose: 'boolean', version: 'string' }
	}
} as const;

export default Plugin.define({
	id: 'massmith-rpc',
	async setup(ctx) {
		void ctx;
		// RPC contract is exported for TUI/GUI parts; server exposes it via ./rpc entry.
	}
});
