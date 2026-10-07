import { isContainer } from './util.js';
import { slug } from './schema.js';

// One key/value pair of an object, produced by repeating over an object. Prints as its key; `__value` and `__key` pick the parts.
export class Entry { constructor(key, value) { this.key = key; this.value = value; } }
export const entriesOf = o => Object.entries(o).map(([k, x]) => new Entry(k, x));

export function fmt(v) {
  if (v === undefined) return '';
  if (v instanceof Entry) return v.key;
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}

export const missing = v => v === undefined || v === null;
// "Required" means present with content: not null/undefined, a blank string, an empty array/object, or an array of only such values.
export const isEmptyVal = v => missing(v) || (typeof v === 'string' && !v.trim())
  || (Array.isArray(v) ? v.every(isEmptyVal) : isContainer(v) && !(v instanceof Entry) && !Object.keys(v).length);

// Child lookup that maps over arrays, so a path through an array yields an array of values.
const pick = (v, k) => Array.isArray(v) ? v.map(x => pick(x, k)) : isContainer(v) ? v[k] : undefined;
const step = (v, tok) => {
  if (Array.isArray(v)) return v.map(x => step(x, tok));
  if (v instanceof Entry) return tok === 'key' ? v.key : tok === 'value' ? v.value : undefined;
  if (!isContainer(v)) return undefined;
  const k = Object.keys(v).find(k => slug(k) === tok);
  if (k === undefined) return tok === 'items' ? entriesOf(v) : undefined; // `items` of an object: its entries
  return v[k];
};
const dive = (v, toks) => toks.reduce(step, v);

// Resolve `name__sub__path` (no $). A scope entry (match id or loop variable) wins; otherwise it's a path from the document root.
let globalCache = new Map();
export const resetGlobalCache = () => { globalCache = new Map(); };
export function lookup(ref, scope, root) {
  const [head, ...rest] = ref.split('__');
  if (Object.hasOwn(scope, head)) return { found: true, value: dive(scope[head], rest) };
  if (/^match\d+$/.test(head)) return { found: true, value: undefined }; // a selection with nothing for this output
  // Global (document-root) references are the same for every output, so resolve and format each once per render.
  if (globalCache.has(ref)) return globalCache.get(ref);
  const has = x => Array.isArray(x) ? x.some(has) : isContainer(x) && Object.keys(x).some(k => slug(k) === head);
  const r = has(root) ? { found: true, value: dive(root, [head, ...rest]) } : { found: false };
  if (r.found) r.text = fmt(r.value);
  globalCache.set(ref, r);
  return r;
}

// Replace $refs; ones that resolve to nothing known are left as typed.
// `info.hasValue` is set when the result has literal text or a reference that resolved to something non-empty.
export function fill(tpl, scope, root, esc = s => s, info = null) {
  return tpl.split(/(\$[A-Za-z_][A-Za-z0-9_]*)/).map((part, i) => {
    if (i % 2) {
      const r = lookup(part.slice(1), scope, root);
      if (r.found) { if (info && !isEmptyVal(r.value)) info.hasValue = true; return esc(r.text ?? fmt(r.value)); }
    }
    if (info && part.trim()) info.hasValue = true;
    return esc(part);
  }).join('');
}

// ---- Loop: one output per item of the chosen array ----
const flatDeep = v => Array.isArray(v) ? v.flatMap(flatDeep) : [v];
export const valueAt = (v, path) => path.reduce((acc, k) => pick(acc, k), v);
// The items to loop over: elements of the array at `path` (arrays along the way are flattened); no path = the document itself.
export const loopItems = (data, path) => flatDeep(valueAt(data, path)).filter(x => !missing(x));
// Conditions: every listed field (a path inside the item) must be non-empty.
export const passes = (item, filters) => filters.every(p => !isEmptyVal(valueAt(item, p)));

// XML mode: nodes are { tag, each, as, attrs: [{name, value}], text, kids }. `each` repeats the element per array item.
const escText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => escText(s).replace(/"/g, '&quot;');

// One output for a scope, or null if a required XML element is empty.
export const outputOf = (cfg, scope, root) => cfg.mode === 'xml' ? (xmlLines(cfg.xml || [], scope, root)?.join('\n') ?? null) : fill(cfg.template || '', scope, root);

export const hasRequiredXml = nodes => nodes.some(n => n.required || hasRequiredXml(n.kids || []));

// Make a string usable as an XML element name.
export function xmlName(s) {
  let name = s.trim().replace(/[^A-Za-z0-9_.:-]/g, '_');
  if (/^[^A-Za-z_]/.test(name)) name = '_' + name;
  return name || 'item';
}

// Returns the lines, or null when a required element can't be filled (the whole output is then dropped).
// An element marked `required` needs content: text, an attribute or children that resolved to something non-empty.
// A repeated element just skips instances that fail; it only fails the output if none are left and it is required.
export function xmlLines(nodes, scope, root, depth = 0) {
  const pad = '  '.repeat(depth), lines = [];
  for (const n of nodes) {
    let scopes = [scope];
    const repeats = !!(n.each || '').trim();
    if (repeats) {
      const r = lookup(n.each.trim().replace(/^\$/, ''), scope, root);
      const v = r.found ? r.value : undefined;
      const as = (n.as || '').trim() || 'child';
      const list = missing(v) ? [] : Array.isArray(v) ? v : isContainer(v) && !(v instanceof Entry) ? entriesOf(v) : [v];
      scopes = list.map(x => ({ ...scope, [as]: x }));
    }
    let valid = 0;
    for (const sc of scopes) {
      const info = { hasValue: false };
      const name = xmlName(fill(n.tag || '', sc, root));
      const attrs = (n.attrs || []).filter(a => a.name.trim()).map(a => ` ${a.name.trim()}="${fill(a.value, sc, root, escAttr, info)}"`).join('');
      const text = fill(n.text || '', sc, root, escText, info);
      const kids = xmlLines(n.kids || [], sc, root, depth + 1);
      if (kids === null || (n.required && !info.hasValue && !kids.length)) {
        if (!repeats) return null;
        continue;
      }
      valid++;
      if (!kids.length) lines.push(text ? `${pad}<${name}${attrs}>${text}</${name}>` : `${pad}<${name}${attrs}/>`);
      else {
        lines.push(`${pad}<${name}${attrs}>`);
        if (text) lines.push(pad + '  ' + text);
        lines.push(...kids, `${pad}</${name}>`);
      }
    }
    if (n.required && !valid) return null;
  }
  return lines;
}
