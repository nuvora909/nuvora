// HTML templating for the static site build. Every interpolated value is escaped unless it is wrapped in raw()
// or produced by another html`` template. null, undefined and false render as nothing, so conditional parts can
// be written as ${cond && html`...`}. Arrays are joined.
export class Raw {
  constructor(s) { this.s = String(s); }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(s);

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

const part = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return new Raw(out);
}

// JSON for <script type="application/ld+json"> and other data blocks: "<" is escaped so the text can never
// close the script element.
export const jsonBlock = (value) => raw(JSON.stringify(value).replace(/</g, '\\u003c'));

// Plain text with *emphasis* markers turned into the italic editorial accent used in headings.
export const accent = (text) => raw(esc(text).replace(/\*([^*]+)\*/g, '<span class="serif">$1</span>'));
