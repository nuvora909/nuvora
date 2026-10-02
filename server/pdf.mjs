// Builds a small, valid one-page PDF. Used by the local server to stand in for uploaded course PDFs.
const clean = (s) => String(s).replace(/[^\x20-\x7E]/g, '-').replace(/[\\()]/g, (c) => `\\${c}`);

export function placeholderPdf(title, lines = []) {
  const text = [
    'BT /F1 22 Tf 72 730 Td (Nuvora) Tj ET',
    `BT /F1 16 Tf 72 700 Td (${clean(title).slice(0, 80)}) Tj ET`,
    ...lines.map((l, i) => `BT /F1 11 Tf 72 ${670 - i * 16} Td (${clean(l).slice(0, 95)}) Tj ET`),
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
