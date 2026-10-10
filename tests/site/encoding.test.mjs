// Safety net for file encoding. On 8 and 9 October another tool re-saved files with a byte-order mark and with
// UTF-8 text decoded as Windows-1252 ("mojibake": ’ became the three characters a-circumflex, euro, trade mark).
// Every tracked text file (and every new one git would track) must be plain UTF-8 without a BOM and without
// mojibake of any character: quotes and dashes, but also arrows, check marks, accented letters, symbols and emoji.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

// Binary files are skipped by extension (and, for anything else, by a NUL byte near the start, as git does).
// Everything else is text: source, styles, SQL, Markdown, JSON, YAML, SVG, dotfiles such as .gitignore...
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|mp4|webm|mov|m4v|mp3|wav|ogg|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|br|zst|7z|wasm|psd)$/i;
// Untracked scratch that agents leave while they work (screenshot scripts, worktrees) is not part of the project.
const SCRATCH = /^(\.tmp-|\.claude\/|epoch\/)/;

const BOM = [0xef, 0xbb, 0xbf];

// Windows-1252 reads the bytes 0x80-0x9F as these characters (five bytes it leaves undefined map to themselves);
// every other byte from 0xA0 to 0xFF reads as the Latin-1 character with the same number. Written as escapes, so
// this file never contains the characters it looks for.
const CP1252_80_9F = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F'
  + '\u0090‘’“”•–—˜™š›œ\u009DžŸ';
const BYTE = new Map();
for (let b = 0x80; b <= 0xff; b++) BYTE.set(String.fromCharCode(b), b);              // Latin-1 readings
for (let i = 0; i < 32; i++) BYTE.set(CP1252_80_9F[i], 0x80 + i);                    // Windows-1252 readings
const esc = (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`;
// A UTF-8 continuation byte (0x80-0xBF) as Windows-1252 shows it.
const CONT = `[${[...BYTE].filter(([, b]) => b >= 0x80 && b <= 0xbf).map(([c]) => esc(c)).join('')}]`;
// A UTF-8 lead byte as Windows-1252 shows it (0xC2-0xDF, 0xE0-0xEF, 0xF0-0xF4), followed by its continuation bytes.
const GARBLED = new RegExp(`[\\u00C2-\\u00DF]${CONT}|[\\u00E0-\\u00EF]${CONT}{2}|[\\u00F0-\\u00F4]${CONT}{3}`, 'g');
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

/** The character a run of mojibake stood for, or null when the run's bytes are not one valid UTF-8 character. */
function original(run) {
  try {
    const s = strictUtf8.decode(Uint8Array.from([...run].map((c) => BYTE.get(c))));
    return [...s].length === 1 ? s : null;
  } catch { return null; }
}

/** Problems in one file's bytes, as readable strings (empty when the file is clean). */
export function encodingProblems(buf) {
  const problems = [];
  if (BOM.every((b, i) => buf[i] === b)) problems.push('starts with a UTF-8 byte-order mark');
  const lines = buf.toString('utf8').split('\n');
  for (let n = 0; n < lines.length; n++) {
    for (const [run] of lines[n].matchAll(GARBLED)) {
      const was = original(run);
      if (!was) continue;
      const code = `U+${was.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
      problems.push(`line ${n + 1} has UTF-8 text read as Windows-1252 (${JSON.stringify(run)} was ${code} ${JSON.stringify(was)}): ${JSON.stringify(lines[n].trim().slice(0, 80))}`);
      break;   // one report per line is enough
    }
  }
  return problems;
}

const git = (...args) => execFileSync('git', ['ls-files', '-z', ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
const textFiles = () => [...git('--cached'), ...git('--others', '--exclude-standard').filter((f) => !SCRATCH.test(f))].filter((f) => !BINARY.test(f));

/** The bytes a UTF-8 string would have if it had been read as Windows-1252 and saved again as UTF-8. */
const garble = (s) => Buffer.from(new TextDecoder('windows-1252').decode(Buffer.from(s, 'utf8')), 'utf8');

test('the checks themselves catch a BOM and mojibake of any character, and pass clean text', () => {
  const clean = 'const a = "it’s · 5 °C → ✓ 3 × 4, café, naïve, Ñandú, Ålesund, € 5, ≈ 7, ★, ₹ 9, ▸, 😀, a b";\n';
  assert.deepEqual(encodingProblems(Buffer.from(clean, 'utf8')), []);
  assert.equal(encodingProblems(Buffer.concat([Buffer.from(BOM), Buffer.from('x\n')])).length, 1);
  for (const c of ['’', '·', '–', '—', '…', '•', '°', ' ', '→', '✓', '×', 'é', '€', '≈', '★', '₹', '▸', '😀']) {
    const bytes = garble(`a ${c} b\n`);
    assert.ok(!bytes.equals(Buffer.from(`a ${c} b\n`, 'utf8')), `${c} changes when garbled`);
    const found = encodingProblems(bytes);
    assert.equal(found.length, 1, `garbled ${c} is caught`);
    assert.match(found[0], new RegExp(`was U\\+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`), `garbled ${c} is named`);
  }
});

test('the file list covers every text file, dotfiles and YAML included, and skips binaries and scratch files', () => {
  const files = textFiles();
  for (const f of ['.gitignore', 'package.json', 'CLAUDE.md']) assert.ok(files.includes(f), `${f} is checked`);
  assert.ok(files.some((f) => /\.ya?ml$/.test(f)), 'YAML files are checked');
  assert.ok(!files.some((f) => BINARY.test(f)), 'no binary files');
  assert.ok(!files.some((f) => SCRATCH.test(f) && !git('--cached', '--', f).length), 'no untracked scratch files');
});

test('no tracked text file starts with a byte-order mark or contains Windows-1252 mojibake', () => {
  const files = textFiles();
  assert.ok(files.length > 50, `git ls-files found the text files (${files.length})`);
  const bad = [];
  for (const f of files) {
    let buf;
    try { buf = readFileSync(join(ROOT, f)); } catch { continue; }   // deleted in the working tree, not yet committed
    if (buf.subarray(0, 8000).includes(0)) continue;                  // binary after all
    for (const p of encodingProblems(buf)) bad.push(`${f}: ${p}`);
  }
  assert.deepEqual(bad, []);
});
