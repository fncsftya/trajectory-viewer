import { $, el } from './dom.js';
import { state } from './state.js';
import { kidByTok } from './schema.js';
import { baseScope } from './draft.js';
import { innerScope, field } from './autocomplete.js';

export const newXmlNode = () => ({ tag: '', each: '', as: '', attrs: [], text: '', kids: [], required: false });

export function renderXmlEditor() {
  const box = $('#vc-xml');
  box.replaceChildren();
  const draw = (list, into, outer) => list.forEach((n, i) => {
    const inner = () => innerScope(n, outer());
    const b = el('div', 'xn');
    const head = el('div', 'xn-row');
    head.append(el('span', 'lbl', '<'), field(n, 'tag', 'f-tag', 'tag', inner), el('span', 'lbl', '>'),
      el('span', 'lbl', 'repeat'), field(n, 'each', 'f-each', '$item__tool_calls', outer),
      el('span', 'lbl', 'as'), field(n, 'as', 'f-as', 'child'));
    // A repeat over a document-root path (e.g. $steps) is the same for every output, so it multiplies them.
    const warn = el('div', 'xn-warn');
    const lint = () => {
      const ref = (n.each || '').trim().replace(/^\$/, ''), head = ref.split('__')[0];
      const global = ref && !Object.hasOwn(outer(), head) && kidByTok(state.draft.schema, head);
      warn.hidden = !global;
      warn.textContent = global ? `$${ref} is a document-root path, so it repeats the whole array in every output. To repeat inside the current item, repeat over one of its fields instead (e.g. $item__field).` : '';
    };
    lint();
    head.addEventListener('input', lint);
    const text = el('div', 'xn-row');
    const req = el('input');
    req.type = 'checkbox';
    req.checked = !!n.required;
    req.onchange = () => { n.required = req.checked; };
    const reqLabel = el('label', 'lbl');
    reqLabel.title = 'If this element has no content, no output is produced (for a repeated element: instances without content are skipped)';
    reqLabel.append(req, ' required');
    text.append(el('span', 'lbl', 'text'), field(n, 'text', 'f-text', 'text, may use $refs', inner), reqLabel);
    b.append(head, warn, text);
    (n.attrs ||= []).forEach((a, ai) => {
      const r = el('div', 'xn-row');
      const x = el('button', 'btn plain', '×');
      x.title = 'Remove attribute';
      x.onclick = () => { n.attrs.splice(ai, 1); renderXmlEditor(); };
      r.append(el('span', 'lbl', 'attr'), field(a, 'name', 'f-an', 'name'), el('span', 'lbl', '='), field(a, 'value', 'f-av', 'value', inner), x);
      b.append(r);
    });
    const bar = el('div', 'xn-row');
    const btn = (label, title, fn) => { const x = el('button', 'btn plain', label); x.title = title; x.onclick = () => { fn(); renderXmlEditor(); }; bar.append(x); };
    btn('+ Attr', 'Add attribute', () => n.attrs.push({ name: '', value: '' }));
    btn('+ Child', 'Add child element', () => (n.kids ||= []).push(newXmlNode()));
    btn('↑', 'Move up', () => { if (i) [list[i - 1], list[i]] = [list[i], list[i - 1]]; });
    btn('↓', 'Move down', () => { if (i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]]; });
    if (n.kids?.length) btn('Unwrap', 'Remove this element but keep its children in its place', () => list.splice(i, 1, ...n.kids));
    btn('Remove', 'Remove element', () => list.splice(i, 1));
    b.append(bar);
    into.append(b);
    if (n.kids?.length) {
      const sub = el('div');
      sub.style.marginLeft = '16px';
      b.append(sub);
      draw(n.kids, sub, inner);
    }
  });
  draw(state.draft.xml, box, baseScope);
  if (!state.draft.xml.length) box.append(el('div', 'meta', 'No elements yet.'));
}
