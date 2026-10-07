import { $, el } from './dom.js';
import { state } from './state.js';
import { buildSchema, describe, slug, schemaAt, validPath, newSchema } from './schema.js';
import { fmt, isEmptyVal, loopItems, passes, valueAt } from './engine.js';
import { asName, itemSchema } from './draft.js';
import { newXmlNode, renderXmlEditor } from './xml-editor.js';
import { show } from './tabs.js';


function renderPreview() {
  const box = $('#vc-preview');
  box.replaceChildren(el('h4', null, 'Preview'));
  if (state.draft.data === undefined) { box.append(el('div', null, 'No valid JSON in the input to preview.')); return; }
  const items = loopItems(state.draft.data, state.draft.loop), conds = state.draft.filters.filter(p => p.length);
  const kept = items.filter(it => passes(it, conds));
  const what = state.draft.loop.length ? state.draft.loop.join('.') + '[]' : 'the whole document';
  box.append(el('div', null, `Looping over ${what}: ${items.length} item${items.length === 1 ? '' : 's'}`
    + (conds.length ? `, ${kept.length} after conditions` : '') + `. ${kept.length} output${kept.length === 1 ? '' : 's'}.`));
  for (const p of conds) {
    const n = items.filter(it => !isEmptyVal(valueAt(it, p))).length;
    box.append(el('div', 'val', `${p.join('.')} is not empty in ${n} of ${items.length} items`));
  }
  const node = itemSchema();
  const lines = [];
  const walkShape = (nd, indent) => {
    for (const [k, c] of Object.entries(nd.kids)) {
      if (lines.length >= 40) return;
      lines.push('  '.repeat(indent) + k + '  ' + describe(c));
      if (indent < 2) walkShape(c, indent + 1);
    }
  };
  walkShape(node, 0);
  if (lines.length) {
    box.append(el('div', 'sel', 'Each item (' + '$' + asName() + ') has:'));
    box.append(el('div', 'val', lines.join('\n') + (lines.length >= 40 ? '\n…' : '')));
  }
  if (kept[0] !== undefined) {
    const t = fmt(kept[0]).replace(/\s+/g, ' ');
    box.append(el('div', 'sel', 'First item:'), el('div', 'val', t.length > 200 ? t.slice(0, 200) + '…' : t));
  }
}

let insertTarget = null; // last focused text field in the Transform section

function setMode(mode) {
  state.draft.mode = mode;
  for (const t of document.querySelectorAll('.mtab')) t.classList.toggle('active', t.dataset.mode === mode);
  $('#vc-pane-text').hidden = mode !== 'text';
  $('#vc-pane-xml').hidden = mode !== 'xml';
  $('#vc-export').hidden = mode === 'xml'; // header/footer apply to text views only
}
for (const t of document.querySelectorAll('.mtab')) t.onclick = () => setMode(t.dataset.mode);
$('#vc-xml-add').onclick = () => { state.draft.xml.push(newXmlNode()); renderXmlEditor(); };
$('#view-modal').addEventListener('focusin', e => { if (e.target.matches('#vc-tpl, #vc-xml input')) insertTarget = e.target; });

function insertRef(text) {
  const t = insertTarget?.isConnected && !insertTarget.closest('[hidden]') ? insertTarget : state.draft.mode === 'text' ? $('#vc-tpl') : null;
  if (!t) { $('#vc-err').textContent = 'Click into an XML field first.'; return; }
  $('#vc-err').textContent = '';
  t.setRangeText(text, t.selectionStart, t.selectionEnd, 'end');
  t.dispatchEvent(new Event('input'));
  t.focus();
}

// A chain of dropdowns that picks a path down the schema; edits `path` in place.
function pathSelects(row, root, path, firstLabel, onChange) {
  let node = root;
  for (let i = 0; i <= path.length; i++) {
    const keys = Object.keys(node.kids);
    if (!keys.length) break;
    const sel = el('select');
    sel.append(new Option(i === 0 ? firstLabel : '(this value)', ''));
    for (const k of keys) sel.append(new Option(k + '   ' + describe(node.kids[k]), k));
    sel.value = path[i] ?? '';
    sel.onchange = () => { path.splice(i); if (sel.value) path.push(sel.value); onChange(); };
    sel.style.marginLeft = i * 20 + 'px';
    row.append(sel);
    if (path[i] === undefined) break;
    node = node.kids[path[i]];
  }
}

function tagButton(ref, hint) {
  const tag = el('button', 'tag', ref);
  if (hint) tag.append(el('small', null, '  ' + hint));
  tag.title = 'Insert ' + ref + ' into the output';
  tag.onclick = () => insertRef(ref);
  return tag;
}

function renderLoop() {
  const box = $('#vc-loop');
  box.replaceChildren();
  const r = el('div', 'sel-row');
  pathSelects(r, state.draft.schema, state.draft.loop, 'Whole document (one output)', () => {
    const item = itemSchema();
    state.draft.filters = state.draft.filters.map(p => validPath(item, p)).filter(p => p.length); // drop conditions that no longer fit
    renderLoop();
  });
  const foot = el('div', 'foot');
  foot.style.marginLeft = state.draft.loop.length * 20 + 'px';
  foot.append(tagButton('$' + asName(), 'the current item'));
  r.append(foot);
  box.append(r);
  renderFilters();
}

function renderFilters() {
  const box = $('#vc-filters');
  box.replaceChildren();
  const item = itemSchema();
  state.draft.filters.forEach((path, i) => {
    const r = el('div', 'sel-row');
    pathSelects(r, item, path, 'Select field…', renderFilters);
    const foot = el('div', 'foot');
    foot.style.marginLeft = path.length * 20 + 'px';
    if (path.length) foot.append(tagButton('$' + asName() + '__' + path.map(slug).join('__')));
    const del = el('button', 'btn plain del', 'Remove');
    del.onclick = () => { state.draft.filters.splice(i, 1); renderFilters(); };
    foot.append(del);
    r.append(foot);
    box.append(r);
  });
  if (!state.draft.filters.length) box.append(el('div', 'meta', 'No conditions: every item is included.'));
  renderPreview();
}

export const currentCfg = () => ({
  v: 2, loop: [...state.draft.loop], as: asName(), filters: state.draft.filters.filter(p => p.length).map(p => [...p]),
  template: $('#vc-tpl').value, mode: state.draft.mode, xml: state.draft.xml,
  pruneEmpty: $('#vc-prune').checked,
  wrap: { on: $('#vc-wrap').checked, tag: $('#vc-wrap-tag').value.trim() || 'root' },
  header: $('#vc-header').value, footer: $('#vc-footer').value,
});

export function openConfigure(pair, view) {
  let schema = newSchema(), err = '', data;
  const text = pair.src.value.trim();
  try { const d = JSON.parse(text); schema = buildSchema(d); data = d; if (!text) err = 'No JSON in the input yet.'; }
  catch (e) { err = text ? 'Invalid JSON: ' + e.message : 'No JSON in the input yet.'; }
  const cfg = view.config;
  const loop = validPath(schema, cfg?.loop || []);
  const item = schemaAt(schema, loop) || newSchema();
  if (cfg && !cfg.loop) err = 'This view used the older selection format; set the loop and conditions again.';
  state.draft = { pair, view, loop, filters: (cfg?.filters || []).map(p => validPath(item, p)).filter(p => p.length), schema, data, mode: 'text', xml: [] };
  insertTarget = null;
  $('#vc-diag').hidden = true;
  $('#vc-err').textContent = err;
  $('#vc-as').value = cfg?.as || 'item';
  $('#vc-tpl').value = cfg ? cfg.template || '' : '';
  $('#vc-header').value = cfg?.header || '';
  $('#vc-footer').value = cfg?.footer || '';
  $('#vc-prune').checked = !!cfg?.pruneEmpty;
  $('#vc-wrap').checked = !!cfg?.wrap?.on;
  $('#vc-wrap-tag').value = cfg?.wrap?.tag || 'root';
  state.draft.xml = structuredClone(cfg?.xml || []);
  if (!state.draft.xml.length) state.draft.xml.push(newXmlNode());
  renderLoop();
  renderXmlEditor();
  setMode(cfg?.mode === 'xml' ? 'xml' : 'text');
  $('#view-modal').showModal();
}

$('#vc-as').oninput = renderLoop;
$('#vc-add').onclick = () => { state.draft.filters.push([]); renderFilters(); };

$('#vc-cancel').onclick = () => $('#view-modal').close();
$('#vc-save').onclick = () => {
  const { pair, view } = state.draft;
  view.config = currentCfg();
  $('#view-modal').close();
  view.dirty = true;
  show(pair, view);
};
