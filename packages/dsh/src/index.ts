import {
	checkDiff,
	composeSystemPrompt,
	redactSecrets,
	summarizeTurn,
	validateCommand
} from '../../core/src/index.ts';

export default function crocodilePlugin(ctx: any) {
	const strict = ctx.config?.strict !== false;

	// Tool: diff_check
	ctx.effect(() => {
		ctx.tools.register({
			name: 'crocodile_diff_check',
			description: 'Check changed files for missing tests and diff size',
			schema: {
				type: 'object',
				properties: {
					files: { type: 'array', items: { type: 'string' } },
					maxDiffLines: { type: 'number' }
				}
			},
			async run(args: any) {
				const files = Array.isArray(args?.files) ? args.files.filter(Boolean) : [];
				const result = checkDiff(files, { maxDiffLines: args?.maxDiffLines ?? 400 });
				const lines = [
					result.summary,
					`tracked: ${result.trackedFiles}, hasTests: ${result.hasTests}`,
					...result.warnings.map(w => `- ${w}`)
				];
				return lines.join('\n');
			}
		});
	}, 'crocodile-diff-check-tool');

	// Tool guard: block dangerous shell
	ctx.on('tools/pre-execute', async (event: any, next: any) => {
		const command = event?.input?.command ?? event?.call?.input?.command ?? '';
		if (command && typeof command === 'string') {
			const check = validateCommand(command, { strict });
			if (check.blocked) {
				return { reject: check.reason ?? 'dangerous command blocked' };
			}
		}
		return next();
	});

	// System prompt injection
	ctx.on('agent/pre-step', async (event: any, next: any) => {
		if (event && typeof event === 'object') {
			event.systemMessages = [
				...(event.systemMessages ?? []),
				{ type: 'text', text: composeSystemPrompt() }
			];
		}
		return next();
	});

	// Redact secrets from tool output
	ctx.on('tools/post-execute', async (event: any) => {
		const result = event?.result ?? event?.output ?? '';
		if (typeof result === 'string' && result) {
			const redacted = redactSecrets(result);
			if (redacted !== result) {
				event.result = redacted;
				event.output = redacted;
			}
			if (result.includes('DEPRECATED')) {
				event.additionalContext = 'DEPRECATED flagged';
			}
		}
	});

	// Command: /review equivalent via ctx.commands
	ctx.effect(() => {
		ctx.commands?.register?.({
			name: 'review',
			description: 'Review git changes for safety and test coverage',
			async run(args: any) {
				const files = Array.isArray(args?.files) ? args.files : [];
				const check = checkDiff(files);
				return {
					message: [
						`changed: ${files.length}`,
						...check.warnings,
						'Review: keamanan, correctness, missing tests.'
					].join('\n')
				};
			}
		});
	}, 'crocodile-review-command');

	// Observe turn end
	ctx.on('turn/end', () => {
		try {
			ctx.telemetry?.event?.('crocodile.turn_end', { ts: Date.now(), summary: summarizeTurn(0, false) });
		} catch {
			// telemetry optional
		}
	});
}
