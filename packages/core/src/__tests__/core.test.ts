import {
	checkDiff,
	composeSystemPrompt,
	isDangerousCommand,
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

console.log('core.test.ts: all assertions passed');
