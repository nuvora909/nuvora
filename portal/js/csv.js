// CSV export for the admin area, safe to open in Excel, Google Sheets or Numbers.
// Spreadsheets run a cell that starts with = + - @ (or a tab or carriage return) as a formula, so a student
// who names themselves "=HYPERLINK(...)" could plant a link or worse. Such text cells get a leading apostrophe,
// which spreadsheets show as plain text. Numbers stay numbers.
const FORMULA = /^[\s　]*[=+\-@\t\r＝＋－＠]/;

export function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  let s = String(v);
  if (FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows: arrays of values; the first row is the header. Lines end with CRLF, as RFC 4180 asks. */
export const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

/** Saves the CSV as a file. The byte-order mark makes Excel read accents and symbols as UTF-8. */
export function downloadCsv(filename, rows) {
  const url = URL.createObjectURL(new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
