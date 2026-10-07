import { $, el } from './dom.js';
import { pairs, evaluate } from './state.js';
import { save } from './persistence.js';
import { show } from './tabs.js';

let activeTarget = null;
const newId = () => Math.random().toString(36).slice(2, 10);
const pairOf = target => pairs.find(p => p.num === parseInt(target, 10));

function renderGroups() {
  const bar = $('#eval-groups');
  bar.replaceChildren();
  const groups = evaluate.groups.filter(g => pairOf(g.target));
  if (!groups.some(g => g.target === activeTarget)) activeTarget = groups[0] && groups[0].target;
  for (const g of groups) {
    const pair = pairOf(g.target);
    const b = el('button', 'mtab' + (g.target === activeTarget ? ' active' : ''), pair.tabOut.textContent);
    b.onclick = () => { activeTarget = g.target; render(); show(pair, 'out'); };
    bar.append(b);
  }
}

function renderSections() {
  const box = $('#eval-sections');
  box.replaceChildren();
  const g = evaluate.groups.find(g => g.target === activeTarget);
  $('#eval-add').hidden = !g;
  if (!g) {
    box.append(el('div', 'meta', evaluate.groups.length ? 'The tabs set up for evaluation no longer exist.' : 'Click Setup to choose output tabs and sections.'));
    return;
  }
  for (const sec of g.sections) {
    const wrap = el('div', 'ev-sec');
    const ta = el('textarea');
    ta.spellcheck = false;
    ta.placeholder = 'Write-up…';
    ta.value = sec.text;
    ta.oninput = () => { sec.text = ta.value; save(); };
    if (sec.own) { // added from the sidebar: belongs to this tab only, so title is editable and it can be removed
      const head = el('div', 'es-row');
      const title = el('input');
      title.placeholder = 'Section title';
      title.value = sec.title;
      title.oninput = () => { sec.title = title.value; save(); };
      const del = el('button', 'btn plain', '✕');
      del.title = 'Delete this section';
      del.onclick = () => {
        if (sec.text.trim() && !confirm('Delete this section?')) return;
        g.sections.splice(g.sections.indexOf(sec), 1);
        renderSections();
        save();
      };
      head.append(title, del);
      wrap.append(head, ta);
    } else wrap.append(el('h4', '', sec.title), ta);
    box.append(wrap);
  }
}

function addOwnSection() {
  const g = evaluate.groups.find(g => g.target === activeTarget);
  if (!g) return;
  g.sections.push({ id: newId(), title: '', text: '', own: true });
  renderSections();
  const inputs = $('#eval-sections').querySelectorAll('.es-row input');
  inputs[inputs.length - 1].focus();
  save();
}

function render() { renderGroups(); renderSections(); }

function setOpen(open) {
  evaluate.open = open;
  $('#eval-side').hidden = !open;
  $('#evaluate').classList.toggle('on', open);
  $('#evaluate').setAttribute('aria-pressed', open);
  save();
}

// ---- setup dialog ----
const secRows = []; // { id, input }

function addRow(id, title) {
  const row = el('div', 'es-row');
  const input = el('input');
  input.placeholder = 'Section title';
  input.value = title;
  const del = el('button', 'btn plain', '✕');
  del.title = 'Remove this section';
  const entry = { id, input };
  del.onclick = () => { secRows.splice(secRows.indexOf(entry), 1); row.remove(); };
  row.append(input, del);
  secRows.push(entry);
  $('#es-secs').append(row);
  return input;
}

function openSetup() {
  const chosen = new Set(evaluate.groups.map(g => g.target));
  const list = $('#es-tabs');
  list.replaceChildren();
  for (const p of pairs) {
    const label = el('label');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.value = p.num + ':out';
    cb.checked = chosen.has(cb.value);
    label.append(cb, p.tabOut.textContent);
    list.append(label);
  }
  if (!pairs.length) list.append(el('div', 'meta', 'No output tabs yet.'));
  $('#es-secs').replaceChildren();
  secRows.length = 0;
  const first = evaluate.groups[0];
  for (const s of first ? first.sections.filter(s => !s.own) : []) addRow(s.id, s.title);
  if (!first) addRow(newId(), 'Notes');
  if (!secRows.length) addRow(newId(), '');
  $('#eval-modal').showModal();
}

function applySetup() {
  const targets = [...$('#es-tabs').querySelectorAll('input:checked')].map(cb => cb.value);
  const defs = secRows.map(r => ({ id: r.id, title: r.input.value.trim() })).filter(d => d.title);
  const old = new Map(evaluate.groups.map(g => [g.target, g]));
  evaluate.groups = targets.map(target => {
    const prev = old.get(target);
    const text = id => { const s = prev && prev.sections.find(s => s.id === id); return s ? s.text : ''; };
    const own = prev ? prev.sections.filter(s => s.own) : [];
    return { target, sections: [...defs.map(d => ({ id: d.id, title: d.title, text: text(d.id) })), ...own] };
  });
  $('#eval-modal').close();
  render();
  save();
}

export function initEvaluate(saved) {
  if (saved && Array.isArray(saved.groups)) {
    evaluate.groups = saved.groups.map(g => ({
      target: String(g.target),
      sections: (g.sections || []).map(s => ({ id: String(s.id || newId()), title: String(s.title || ''), text: String(s.text || ''), own: !!s.own })),
    }));
  }
  // Tabs are added, renamed and removed elsewhere: keep the group labels in step.
  new MutationObserver(renderGroups).observe($('nav'), { childList: true, subtree: true, characterData: true });
  $('#evaluate').onclick = () => setOpen(!evaluate.open);
  $('#eval-setup').onclick = openSetup;
  $('#eval-add').onclick = addOwnSection;
  $('#es-add').onclick = () => addRow(newId(), '').focus();
  $('#es-cancel').onclick = () => $('#eval-modal').close();
  $('#es-ok').onclick = applySetup;
  render();
  setOpen(!!(saved && saved.open));
}
