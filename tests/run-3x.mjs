// Runs a test folder three times in a row and fails if any run fails, to catch flaky or order-dependent tests.
import { spawnSync } from 'node:child_process';

const target = process.argv[2] ?? 'tests/db/*.test.mjs';
const runs = Number(process.env.RUNS ?? 3);
let failed = 0;
for (let i = 1; i <= runs; i++) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', target], { encoding: 'utf8' });
  const summary = (r.stdout.match(/^ℹ (tests|pass|fail) \d+$/gm) ?? []).map((l) => l.slice(2)).join(', ');
  console.log(`Run ${i}/${runs}: ${r.status === 0 ? 'PASS' : 'FAIL'} (${summary || 'no summary'}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (r.status !== 0) { failed++; process.stdout.write(r.stdout.slice(-4000)); process.stderr.write(r.stderr.slice(-2000)); }
}
console.log(failed ? `\n${failed} of ${runs} runs failed.` : `\nAll ${runs} runs passed.`);
process.exit(failed ? 1 : 0);
