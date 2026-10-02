// Runs every test suite three times in a row and fails if any run fails, to catch flaky or order-dependent
// tests. Usage: node tests/run-3x.mjs [db|server|e2e ...]   (default: all suites)
import { spawnSync } from 'node:child_process';

const SUITES = {
  db: { label: 'database', args: ['--test', '--test-reporter=spec', 'tests/db/*.test.mjs'], count: /^ℹ (tests|pass|fail) (\d+)$/gm },
  server: { label: 'server', args: ['--test', '--test-reporter=spec', 'tests/server/*.test.mjs'], count: /^ℹ (tests|pass|fail) (\d+)$/gm },
  e2e: { label: 'browser', args: ['node_modules/@playwright/test/cli.js', 'test', '--reporter=line'], count: /^\s+(\d+) (passed|failed|flaky)/gm },
};

const picked = process.argv.slice(2).filter((a) => SUITES[a]);
const suites = picked.length ? picked : Object.keys(SUITES);
const runs = Number(process.env.RUNS ?? 3);
let failed = 0;

for (let i = 1; i <= runs; i++) {
  for (const key of suites) {
    const s = SUITES[key];
    const t0 = Date.now();
    const r = spawnSync(process.execPath, s.args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout}\n${r.stderr}`;
    const summary = [...out.matchAll(s.count)].map((m) => (key === 'e2e' ? `${m[2]} ${m[1]}` : `${m[1]} ${m[2]}`)).join(', ');
    const ok = r.status === 0;
    console.log(`Run ${i}/${runs} ${s.label.padEnd(8)} ${ok ? 'PASS' : 'FAIL'} (${summary || 'no summary'}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (!ok) { failed++; process.stdout.write(out.slice(-6000)); }
  }
}
console.log(failed ? `\n${failed} suite run(s) failed.` : `\nAll ${runs} runs of ${suites.length} suite(s) passed.`);
process.exit(failed ? 1 : 0);
