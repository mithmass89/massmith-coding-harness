import { Plugin } from '@opencode/plugin';
import {
	checkDiff,
	composeSystemPrompt,
	redactSecrets,
	summarizeTurn,
	validateCommand
} from '../../core/src/index.ts';

export default Plugin.define({
	id: 'crocodile-coding-harness',
	async setup(ctx) {
		await ctx.storage.set('loaded', true);
		await ctx.storage.set('version', '0.1.0');

		const strict = ctx.options.strict !== false;
		const verbose = ctx.options.verbose === true;

		await ctx.tool.namespace({
			name: 'crocodile',
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
				options: { namespace: 'crocodile', codemode: true },
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
				options: { namespace: 'crocodile', codemode: true },
				execute: async () => {
					return { content: summarizeTurn(0, false) };
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
				name: 'crocodile-status',
				description: 'Tampilkan status plugin crocodile',
				execute: async ({ sessionID, prompt, delivery }) => {
					await ctx.session.prompt({
						...prompt,
						sessionID,
						text: `Status crocodile: strict=${strict} verbose=${verbose} location=${ctx.location.directory}`,
						delivery
					});
				}
			});
		});

		await ctx.session.hook('context', event => {
			event.system.push({ type: 'text', text: composeSystemPrompt() });
			if (verbose) {
				event.options.temperature = 0.2;
			}
			for (const tool of Object.keys(event.tools)) {
				if (tool.startsWith('crocodile_') && !tool.includes('diff_check') && !tool.includes('repo_size')) {
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
					event.message = 'crocodile: dangerous command blocked';
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
