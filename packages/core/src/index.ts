export interface DiffStat {
	file: string;
	additions: number;
	deletions: number;
	binary: boolean;
}

export interface DiffCheckOptions {
	allowNoVerify?: boolean;
	maxDiffLines?: number;
	runTests?: boolean;
	diffStats?: DiffStat[];
}

export interface DiffCheckResult {
	ok: boolean;
	summary: string;
	trackedFiles: number;
	changedFiles: number;
	totalDiffLines: number;
	maxDiffLines: number;
	exceededMaxDiffLines: boolean;
	diffStatsAvailable: boolean;
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

export function parseGitNumstat(output: string): DiffStat[] {
	const stats: DiffStat[] = [];
	for (const rawLine of output.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (!line) continue;
		const parts = line.split('\t');
		if (parts.length < 3) continue;
		const [additionsRaw, deletionsRaw, ...pathParts] = parts;
		const file = pathParts.join('\t');
		if (!file) continue;
		const binary = additionsRaw === '-' && deletionsRaw === '-';
		const additions = binary ? 0 : Number.parseInt(additionsRaw, 10);
		const deletions = binary ? 0 : Number.parseInt(deletionsRaw, 10);
		if (!binary && (!Number.isFinite(additions) || !Number.isFinite(deletions))) continue;
		stats.push({ file, additions, deletions, binary });
	}
	return stats;
}

export function checkDiff(files: string[], options: DiffCheckOptions = {}): DiffCheckResult {
	const warnings: string[] = [];
	const max = options.maxDiffLines ?? 400;
	const stats = options.diffStats;
	const diffStatsAvailable = stats !== undefined;
	const statList = stats ?? [];
	const changedFiles = files.length > 0 ? files : statList.map(stat => stat.file);
	const totalDiffLines = statList.reduce((sum, stat) => sum + stat.additions + stat.deletions, 0);
	const exceededMaxDiffLines = diffStatsAvailable && totalDiffLines > max;

	if (changedFiles.length === 0) warnings.push('no changed files detected');
	const normalizedChanged = changedFiles.map(file => file.replace(/\\/g, '/'));
	for (const file of changedFiles) {
		if (!/\.(ts|tsx|js|jsx|py)$/.test(file)) continue;
		const normalized = file.replace(/\\/g, '/');
		const pathParts = normalized.split('/');
		const basename = pathParts.pop() ?? '';
		if (/\.test\.|\.spec\.|test_.*\.py$/.test(basename)) continue;
		const base = basename.replace(/\.(ts|tsx|js|jsx|py)$/, '');
		const ext = basename.slice(base.length);
		const dir = pathParts.join('/');
		const prefix = dir ? `${dir}/` : '';
		const testDir = dir ? `${dir}/__tests__/` : '__tests__/';
		const alongside = [`${prefix}${base}.test${ext}`, `${prefix}${base}.spec${ext}`];
		const hasTest = normalizedChanged.some(
			candidate =>
				alongside.includes(candidate) ||
				(candidate.startsWith(testDir) && /(\.test\.|\.spec\.|test_.*\.py$)/.test(candidate))
		);
		if (!hasTest) {
			warnings.push(`no test file found alongside ${file} (consider ${alongside[0]})`);
		}
	}
	if (exceededMaxDiffLines) {
		warnings.push(`diff size ${totalDiffLines} exceeds maxDiffLines ${max}`);
	}
	if (options.allowNoVerify === false) {
		warnings.push('strict mode: --no-verify is forbidden');
	}
	if (options.runTests === true) {
		warnings.push('runTests requested: run pnpm test before push');
	}

	const summary = diffStatsAvailable
		? `changed files: ${changedFiles.length}, totalDiffLines: ${totalDiffLines}, maxDiffLines=${max}`
		: `changed files: ${changedFiles.length}, maxDiffLines=${max} (diff stats unavailable)`;

	return {
		ok: !exceededMaxDiffLines,
		summary,
		trackedFiles: changedFiles.length,
		changedFiles: changedFiles.length,
		totalDiffLines,
		maxDiffLines: max,
		exceededMaxDiffLines,
		diffStatsAvailable,
		hasTests:
			changedFiles.length > 0 &&
			!warnings.some(warning => warning.startsWith('no test file found')),
		warnings
	};
}
