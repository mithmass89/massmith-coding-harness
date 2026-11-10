import {
	checkDiff,
	composeSystemPrompt,
	isDangerousCommand,
	parseGitNumstat,
	redactSecrets,
	summarizeTurn,
	validateCommand
} from '../index.ts';

function assert(cond: boolean, msg: string) {
	if (!cond) throw new Error(msg);
}

assert(validateCommand('git commit --no-verify', { strict: true }).blocked, 'should block --no-verify in strict');
assert(!validateCommand('ls -la', { strict: true }).blocked, 'should allow safe command');
assert(composeSystemPrompt().includes('small, reviewable'), 'prompt missing base');
assert(redactSecrets('api_key=abcd1234efgh5678').includes('[REDACTED]'), 'redact failed');
assert(isDangerousCommand('git push --force origin main'), 'force push should be dangerous');
assert(checkDiff(['a.ts']).warnings.length > 0, 'should warn missing test');
assert(summarizeTurn(3, false).includes('3'), 'summary wrong');

const stats = parseGitNumstat('3\t1\tsrc/a.ts\n-\t-\tassets/logo.png\nmalformed line\n');
assert(stats.length === 2, 'numstat should parse two entries');
assert(stats[0].file === 'src/a.ts', 'numstat path wrong');
assert(stats[0].additions === 3 && stats[0].deletions === 1, 'numstat counts wrong');
assert(stats[1].binary && stats[1].additions === 0, 'binary numstat wrong');

const exceeded = checkDiff(['src/a.ts'], { maxDiffLines: 2, diffStats: stats });
assert(exceeded.exceededMaxDiffLines, 'maxDiffLines should be enforced');
assert(exceeded.totalDiffLines === 4, 'totalDiffLines should count additions and deletions');
assert(exceeded.warnings.some(warning => warning.includes('exceeds maxDiffLines')), 'maxDiffLines warning missing');

const within = checkDiff(['src/a.ts'], { maxDiffLines: 100, diffStats: stats });
assert(!within.exceededMaxDiffLines, 'diff within maxDiffLines should pass');
assert(within.diffStatsAvailable, 'diff stats should be marked available');

const unavailable = checkDiff(['src/a.ts']);
assert(!unavailable.diffStatsAvailable, 'diff stats should be marked unavailable without numstat');
assert(!unavailable.exceededMaxDiffLines, 'maxDiffLines cannot be enforced without stats');

const windowsPath = checkDiff(['src\\a.ts']);
assert(windowsPath.warnings.some(warning => warning.includes('a.test.ts')), 'windows path test warning missing');

const withTest = checkDiff(['src/a.ts', 'src/a.test.ts']);
assert(!withTest.warnings.some(warning => warning.includes('no test file')), 'test file should satisfy warning');

const testDir = checkDiff(['src/a.ts', 'src/__tests__/a.test.ts']);
assert(
	!testDir.warnings.some(warning => warning.includes('no test file')),
	'test in __tests__ should satisfy warning'
);

const packageTest = checkDiff(['src/a.ts', 'src/__tests__/other.test.ts']);
assert(
	!packageTest.warnings.some(warning => warning.includes('no test file')),
	'package-level test should satisfy warning'
);

console.log('core.test.ts: all assertions passed');
