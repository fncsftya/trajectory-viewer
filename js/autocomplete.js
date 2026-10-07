import { $, el } from './dom.js';
import { state } from './state.js';
import { newSchema, describe, slug, entrySchema, isObj, kidsOf, kidByTok } from './schema.js';

// Schema node a reference points at, given named scope entries (match ids, loop variables); null if unknown.
export function resolveNode(ref, scope, schema = state.draft.schema) {
  const [head, ...rest] = ref.split('__');
  let node = Object.hasOwn(scope, head) ? scope[head] : kidByTok(schema, head);
  for (const t of rest) node = kidByTok(node, t);
  return node || null;
}

// Scope seen by the contents of an element: its parent's, plus its own loop variable.
export const innerScope = (n, outer) => {
  if (!(n.each || '').trim()) return outer;
  const node = resolveNode(n.each.trim().replace(/^\$/, ''), outer) || newSchema();
  return { ...outer, [(n.as || '').trim() || 'child']: isObj(node) ? entrySchema(node) : node }; // repeating over an object iterates its entries
};

const ac = { box: null, items: [], on: 0, input: null };
function acClose() { if (ac.box) ac.box.hidden = true; ac.input = null; }
function acAccept(i = ac.on) {
  const c = ac.items[i], input = ac.input;
  if (!c) return;
  const end = input.selectionStart, start = end - c.partial.length;
  input.setRangeText(c.name, start, end, 'end');
  acClose();
  input.dispatchEvent(new Event('input'));
}
// Viewport position just below the caret of a textarea, measured with a hidden copy of its text.
function caretPos(ta) {
  const r = ta.getBoundingClientRect(), cs = getComputedStyle(ta), m = el('div'), mark = el('span', '', '.');
  for (const k of ['font', 'padding', 'border', 'letterSpacing', 'tabSize', 'lineHeight', 'whiteSpace', 'overflowWrap'])
    m.style[k] = cs[k];
  Object.assign(m.style, { position: 'fixed', left: '0', top: '0', visibility: 'hidden', boxSizing: 'border-box', width: r.width + 'px' });
  m.textContent = ta.value.slice(0, ta.selectionStart);
  m.append(mark);
  document.body.append(m);
  const x = mark.offsetLeft - ta.scrollLeft, y = mark.offsetTop - ta.scrollTop + mark.offsetHeight;
  m.remove();
  return { left: r.left + Math.min(x, r.width - 160), top: r.top + Math.min(y, r.height) };
}
function acShow(input, scopeFn, schemaFn = () => state.draft.schema) {
  const m = /\$([A-Za-z0-9_]*)$/.exec(input.value.slice(0, input.selectionStart));
  if (!m) return acClose();
  const toks = m[1].split('__'), partial = toks.pop(), scope = scopeFn(), schema = schemaFn();
  let names;
  if (!toks.length) {
    names = [...Object.entries(scope), ...kidsOf(schema).map(([k, v]) => [slug(k), v])];
  } else {
    const node = resolveNode(toks.join('__'), scope, schema);
    names = node ? kidsOf(node).map(([k, v]) => [slug(k), v]) : [];
  }
  const seen = new Set();
  ac.items = names.filter(([n]) => n.startsWith(partial) && !seen.has(n) && seen.add(n))
    .map(([name, node]) => ({ name, partial, node }));
  if (!ac.items.length || (ac.items.length === 1 && ac.items[0].name === partial)) return acClose();
  if (!ac.box) { ac.box = el('div'); ac.box.id = 'ac'; }
  const host = input.closest('dialog') || document.body;
  if (ac.box.parentNode !== host) host.append(ac.box);
  ac.input = input; ac.on = 0;
  ac.box.replaceChildren(...ac.items.map((c, i) => {
    const d = el('div', i === 0 ? 'on' : '', '$' + (toks.length ? toks.join('__') + '__' : '') + c.name);
    d.append(el('small', null, describe(c.node)));
    d.onmousedown = e => { e.preventDefault(); acAccept(i); };
    return d;
  }));
  const r = input.tagName === 'TEXTAREA' ? caretPos(input) : input.getBoundingClientRect();
  ac.box.style.left = r.left + 'px';
  ac.box.style.top = (r.bottom ?? r.top) + 2 + 'px';
  ac.box.hidden = false;
}
function acKey(e) {
  if (!ac.box || ac.box.hidden || ac.input !== e.target) return;
  const move = d => { e.preventDefault(); ac.on = (ac.on + d + ac.items.length) % ac.items.length; [...ac.box.children].forEach((c, i) => c.classList.toggle('on', i === ac.on)); ac.box.children[ac.on].scrollIntoView({ block: 'nearest' }); };
  if (e.key === 'ArrowDown') move(1);
  else if (e.key === 'ArrowUp') move(-1);
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acAccept(); }
  else if (e.key === 'Escape') { e.preventDefault(); acClose(); }
}

export function field(obj, key, cls, ph, scopeFn) {
  const i = el('input', cls);
  i.placeholder = ph;
  i.value = obj[key] || '';
  i.oninput = () => { obj[key] = i.value; if (scopeFn) acShow(i, scopeFn); };
  if (scopeFn) { i.onkeydown = acKey; i.onblur = acClose; }
  return i;
}

// Autocomplete `$refs` in a free-standing text field or textarea. scopeFn: named entries; schemaFn: the document schema.
export function attachAutocomplete(input, scopeFn, schemaFn) {
  input.addEventListener('input', () => acShow(input, scopeFn, schemaFn));
  input.addEventListener('keydown', acKey);
  input.addEventListener('blur', acClose);
}
