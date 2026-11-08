export interface ToolResult {
	ok: boolean;
	text: string;
	code?: number;
}

export interface DiffCheckOptions {
	allowNoVerify?: boolean;
	maxDiffLines?: number;
	runTests?: boolean;
}

export interface DiffCheckResult {
	ok: boolean;
	summary: string;
	trackedFiles: number;
	hasTests: boolean;
	warnings: string[];
}

const DANGER_PATTERNS = [
	'--no-verify',
	'rm -rf /',
	'rm -rf $HOME',
	'drop table',
	'drop database',
	'delete from',
	'mkfs',
	'> /dev/sda',
	'git push --force',
	'git reset --hard'
];

export function isDangerousCommand(command: string): boolean {
	const normalized = command.toLowerCase().replace(/\s+/g, ' ').trim();
	return DANGER_PATTERNS.some(
		pattern => normalized.includes(pattern.toLowerCase()) || normalized.startsWith(pattern.toLowerCase())
	);
}

export function validateCommand(
	command: string,
	options: { strict?: boolean } = {}
): { blocked: boolean; reason?: string } {
	if (!command.trim()) return { blocked: true, reason: 'empty command' };
	if (isDangerousCommand(command)) {
		if (!options.strict) {
			return {
				blocked: false,
				reason: 'dangerous pattern detected but strict mode is off'
			};
		}
		if (command.includes('--no-verify')) {
			return { blocked: true, reason: 'strict mode forbids --no-verify' };
		}
		return { blocked: true, reason: `dangerous command blocked: ${command}` };
	}
	return { blocked: false };
}

export function composeSystemPrompt(extra?: string): string {
	const base = [
		'You are a careful coding assistant.',
		'Prefer small, reviewable diffs. Do not add features beyond the request.',
		'Never use --no-verify, force push, or destructive shell commands without asking.',
		'Run relevant tests/typecheck/lint after code changes and report failures.',
		'Write self-documenting code; only add comments where logic is not obvious.'
	].join(' ');
	return extra ? `${base}\n\n${extra}` : base;
}

export function redactSecrets(text: string): string {
	return text
		.replace(
			/(api[_-]?key\s*[:=]\s*["']?)([A-Za-z0-9._\-]{16,})(["']?)/gi,
			'$1[REDACTED]$3'
		)
		.replace(
			/(authorization:\s*bearer\s+)([A-Za-z0-9._\-]{16,})/gi,
			'$1[REDACTED]'
		)
		.replace(
			/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
			'-----BEGIN PRIVATE KEY-----\n[REDACTED]\n-----END PRIVATE KEY-----'
		);
}

export function summarizeTurn(toolCalls: number, errored: boolean): string {
	if (errored) return `Turn selesai dengan ${toolCalls} tool call(s), ada error — periksa feed.`;
	return `Turn selesai: ${toolCalls} tool call(s), tidak ada error.`;
}

export function checkDiff(files: string[], options: DiffCheckOptions = {}): DiffCheckResult {
	const warnings: string[] = [];
	const max = options.maxDiffLines ?? 400;
	if (files.length === 0) warnings.push('no changed files detected');
	for (const file of files) {
		if (!/\.(ts|tsx|js|jsx|py)$/.test(file)) continue;
		const basename = file.split('/').pop() ?? '';
		if (/\.test\.|\.spec\.|test_.*\.py$/.test(basename)) continue;
		const testFile = file.replace(/\.(ts|tsx|js|jsx)$/, '.test.$1');
		if (!files.includes(testFile)) {
			warnings.push(`no test file found alongside ${file} (consider ${testFile})`);
		}
	}
	if (options.allowNoVerify === false && warnings.length === 0) {
		// strict diff check hook point
	}
	return {
		ok: true,
		summary: `changed files: ${files.length}, maxDiffLines=${max}`,
		trackedFiles: files.length,
		hasTests: warnings.length === 0,
		warnings
	};
}
