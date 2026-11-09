import { createRequire } from 'node:module';

import type { Context } from '@deepseek-ai/cordis';
import type {
	checkDiff as checkDiffType,
	composeSystemPrompt as composeSystemPromptType,
	redactSecrets as redactSecretsType,
	summarizeTurn as summarizeTurnType,
	validateCommand as validateCommandType
} from '../../core/src/index.ts';

const require = createRequire(import.meta.url);
const core = require('../../core/src/index.ts') as {
	checkDiff: typeof checkDiffType;
	composeSystemPrompt: typeof composeSystemPromptType;
	redactSecrets: typeof redactSecretsType;
	summarizeTurn: typeof summarizeTurnType;
	validateCommand: typeof validateCommandType;
};
const { checkDiff, composeSystemPrompt, redactSecrets, summarizeTurn, validateCommand } = core;

declare module '@deepseek-ai/cordis' {
	interface Context {
		tools: {
			register: (tool: unknown) => void | (() => void);
		};
		commands: {
			register: (cmd: unknown) => void | (() => void) | Promise<void | (() => void)>;
		};
		effect: (fn: () => void | (() => void), id?: string) => void;
		on: (
			event: string,
			handler: (event: any, next?: any) => any
		) => void | (() => void);
	}
}

export const inject = ['tools', 'commands', 'config'];

const skillDirs = ['massmith-review', 'code-review', 'deployment', 'docs-bilingual'];
function loadSkills(): string {
  const texts: string[] = [];
  for (const dir of skillDirs) {
    try {
      const text = require('node:fs').readFileSync(
        new URL(`../../skills/${dir}/SKILL.md`, import.meta.url),
        'utf8'
      );
      texts.push(text);
    } catch {
      // Skill files are optional; a missing skill never breaks the plugin boot.
    }
  }
  return texts.join('\n\n');
}

interface MassmithConfig {
	strict?: boolean;
	verbose?: boolean;
	maxDiffLines?: number;
}

function parseConfig(raw: unknown): Required<MassmithConfig> {
	const cfg = (raw ?? {}) as MassmithConfig;
	return {
		strict: cfg.strict !== false,
		verbose: cfg.verbose === true,
		maxDiffLines:
			typeof cfg.maxDiffLines === 'number' && cfg.maxDiffLines > 0 ? cfg.maxDiffLines : 400
	};
}

export default function massmithPlugin(ctx: Context & { config?: unknown }) {
	// `ctx.config` is only populated when this plugin is declared with
	// `inject: ['config', ...]`; without it, Cordis throws
	// `cannot get property "config" without inject`. Read defensively.
	let rawConfig: unknown;
	try {
		rawConfig = (ctx as { config?: unknown }).config;
	} catch {
		rawConfig = undefined;
	}
	const config = parseConfig(rawConfig);
	const disposers: Array<() => void> = [];
	const skillText = loadSkills();

	return () => {
		// Tool: diff_check — reversible via disposer returned from register
		const unregisterTool = ctx.tools.register({
			name: 'massmith_diff_check',
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
				const result = checkDiff(files, {
					maxDiffLines: args?.maxDiffLines ?? config.maxDiffLines
				});
				const lines = [
					result.summary,
					`tracked: ${result.trackedFiles}, hasTests: ${result.hasTests}`,
					...result.warnings.map(w => `- ${w}`)
				];
				return lines.join('\n');
			}
		});
		if (typeof unregisterTool === 'function') disposers.push(unregisterTool as () => void);

		// Command: /review
		const unregisterCommand = ctx.commands.register({
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
		if (typeof unregisterCommand === 'function') {
			disposers.push(unregisterCommand as () => void);
		}

		// Tool guard: block dangerous shell — waterfall must call next() to continue
		const offPre = ctx.on('tools/pre-execute', async (event: any, next: any) => {
			const command = event?.input?.command ?? event?.call?.input?.command ?? '';
			if (typeof command === 'string' && command.trim()) {
				const check = validateCommand(command, { strict: config.strict });
				if (check.blocked) {
					return { reject: check.reason ?? 'dangerous command blocked' };
				}
			}
			return next?.();
		});
		if (typeof offPre === 'function') disposers.push(offPre as () => void);

		// System prompt injection — always delegate, never short-circuit
		const offPreStep = ctx.on('agent/pre-step', async (event: any, next: any) => {
			if (event && typeof event === 'object') {
				event.systemMessages = [
					...(event.systemMessages ?? []),
					{ type: 'text', text: composeSystemPrompt(skillText) }
				];
			}
			return next?.();
		});
		if (typeof offPreStep === 'function') disposers.push(offPreStep as () => void);

		// Redact secrets from tool output — afterToolCall equivalent
		const offPost = ctx.on('tools/post-execute', async (event: any) => {
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
		if (typeof offPost === 'function') disposers.push(offPost as () => void);

		// Observe turn end — emit via telemetry event bus if available, else no-op
		const offTurn = ctx.on('turn/end', () => {
			// Telemetry piggyback: apps wire this to their own telemetry service.
			// No silent failure here — if ctx.telemetry is missing we simply skip.
			if (config.verbose) {
				try {
					(ctx as any).telemetry?.event?.('massmith.turn_end', {
						ts: Date.now(),
						summary: summarizeTurn(0, false)
					});
				} catch {
					// telemetry is optional; do not crash the turn loop
				}
			}
		});
		if (typeof offTurn === 'function') disposers.push(offTurn as () => void);

		// Cleanup: run all disposers in reverse order (LIFO)
		return () => {
			while (disposers.length > 0) {
				const dispose = disposers.pop()!;
				try {
					dispose();
				} catch {
					// swallow cleanup errors; keep draining
				}
			}
		};
	};
}
