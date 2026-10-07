import { $, el } from './dom.js';
import { state, pairs } from './state.js';
import { save } from './persistence.js';
import { render, ensure } from './output.js';
import { setAll } from './tree.js';
import { addView } from './views.js';

export const viewLabel = (pair, v) => pair.name ? `[view ${v.num}] ${pair.name}` : `${pair.defaultOut} · view ${v.num}`;

const randomPastel = () => {
  const used = pairs.map(p => p.hue);
  let h;
  for (let i = 0; i < 20; i++) {
    h = Math.floor(Math.random() * 360);
    if (used.every(u => Math.min(Math.abs(u - h), 360 - Math.abs(u - h)) >= 30)) break;
  }
  return h;
};

export function applyColour(node, hue) {
  node.style.setProperty('--accent', `hsl(${hue} 70% 75%)`);
  node.style.setProperty('--accent-bg', `hsl(${hue} 80% 94%)`);
}

export function show(pair, kind) {
  state.current = { pair, kind };
  save();
  for (const p of pairs) {
    p.tabIn.classList.toggle('active', p === pair && kind === 'in');
    p.tabOut.classList.toggle('active', p === pair && kind === 'out');
    p.secIn.classList.toggle('active', p === pair && kind === 'in');
    p.secOut.classList.toggle('active', p === pair && kind === 'out');
    for (const v of p.views) {
      v.tab.classList.toggle('active', p === pair && kind === v);
      v.sec.classList.toggle('active', p === pair && kind === v);
    }
  }
  ensure(pair, kind);
}

export function setName(pair, name) {
  save();
  pair.name = name.trim();
  pair.tabIn.textContent = pair.name ? '[in] ' + pair.name : pair.defaultIn;
  pair.tabOut.textContent = pair.name ? '[out] ' + pair.name : pair.defaultOut;
  for (const v of pair.views) v.tab.textContent = viewLabel(pair, v);
}

export function openSettings() {
  const list = $('#pair-list');
  list.replaceChildren();
  pairs.forEach((pair, i) => {
    const row = el('div', 'pair-row');
    applyColour(row, pair.hue);
    const input = el('input');
    input.value = pair.name || '';
    input.placeholder = 'Pair ' + (i + 1);
    input.oninput = () => setName(pair, input.value);
    const del = el('button', 'btn plain del', 'Delete');
    del.title = 'Delete this tab pair';
    del.onclick = () => {
      const label = pair.name || 'Pair ' + (i + 1);
      if (!confirm('Delete "' + label + '" and its input/output tabs? This cannot be undone.')) return;
      deletePair(pair);
      openSettings();
    };
    row.append(el('span', 'swatch'), input, del);
    list.append(row);
  });
  if (!pairs.length) list.append(el('div', 'meta', 'No tab pairs.'));
  if (!$('#settings-modal').open) $('#settings-modal').showModal();
}

export function deletePair(pair) {
  const i = pairs.indexOf(pair);
  pairs.splice(i, 1);
  for (const node of [pair.tabIn, pair.tabOut, pair.secIn, pair.secOut]) node.remove();
  for (const v of pair.views) { v.tab.remove(); v.sec.remove(); }
  if (state.current && state.current.pair === pair) {
    const next = pairs[Math.min(i, pairs.length - 1)];
    state.current = null;
    if (next) show(next, 'in');
  }
  $('#empty').hidden = pairs.length > 0;
  save();
}

export function addPair(saved) {
  let n = 1; // smallest number not used by an existing pair, so default names stay unique
  while (pairs.some(p => p.num === n)) n++;
  if (saved) n = saved.num;
  const hue = saved ? saved.hue : pairs.length === 0 ? 222 : randomPastel(); // first pair keeps the default blue
  const pair = { hue, num: n, views: [], treeDirty: true };
  const sfx = n === 1 ? '' : ' ' + n;
  pair.tabIn = el('button', 'tab', 'Input' + sfx);
  pair.tabOut = el('button', 'tab', 'Output' + sfx);
  pair.defaultIn = pair.tabIn.textContent;
  pair.defaultOut = pair.tabOut.textContent;
  pair.name = '';
  $('nav').insertBefore(pair.tabIn, $('#add'));
  $('nav').insertBefore(pair.tabOut, $('#add'));

  const frag = $('#pair-tpl').content.cloneNode(true);
  pair.secIn = frag.querySelector('.in');
  pair.secOut = frag.querySelector('.outsec');
  pair.src = frag.querySelector('textarea');
  pair.tree = frag.querySelector('.tree');
  const out = pair.out = frag.querySelector('.out');
  const widthBtn = frag.querySelector('.width');
  frag.querySelector('.view').onclick = () => { render(pair); show(pair, 'out'); };
  frag.querySelector('.create-view').onclick = () => addView(pair);
  frag.querySelector('.expand').onclick = () => setAll(pair.tree, true);
  frag.querySelector('.collapse').onclick = () => setAll(pair.tree, false);
  const attachBtn = frag.querySelector('.attach-patch');
  const detachBtn = frag.querySelector('.detach-patch');
  const patchFile = frag.querySelector('.patch-file');
  pair.patch = null; // { name, text }: the output patch linked to this pair
  pair.setPatch = patch => {
    pair.patch = patch;
    attachBtn.textContent = patch ? 'Patch: ' + patch.name : 'Attach patch';
    attachBtn.title = patch ? 'Replace the attached patch' : 'Attach an output .patch or .diff file to this tab pair';
    detachBtn.hidden = !patch;
    save();
  };
  attachBtn.onclick = async () => {
    if (!window.showOpenFilePicker) { patchFile.click(); return; }
    try {
      const [h] = await showOpenFilePicker({ types: [{ description: 'Patch/diff files', accept: { 'text/plain': ['.patch', '.diff'] } }] });
      takePatch(await h.getFile());
    } catch (e) {
      if (e.name !== 'AbortError') patchFile.click(); // picker unavailable here: fall back to the input
    }
  };
  detachBtn.onclick = () => pair.setPatch(null);
  const takePatch = async f => {
    if (!/\.(patch|diff)$/i.test(f.name)) { alert('Please choose a .patch or .diff file.'); return; }
    try { pair.setPatch({ name: f.name, text: await f.text() }); }
    catch { alert('Could not read that file.'); }
  };
  patchFile.onchange = () => {
    const f = patchFile.files[0];
    patchFile.value = ''; // so picking the same file again still fires change
    if (f) takePatch(f);
  };
  widthBtn.onclick = () => {
    const full = out.classList.toggle('full');
    widthBtn.textContent = 'Width: ' + (full ? '100%' : '60%');
    save();
  };
  if (saved && saved.full) widthBtn.onclick();
  for (const node of [pair.tabIn, pair.tabOut, pair.secIn, pair.secOut]) applyColour(node, hue);
  $('main').append(frag);

  // Paste refreshes the output view in the background; the value isn't updated until after the event.
  pair.src.addEventListener('input', save);
  pair.src.addEventListener('paste', () => setTimeout(() => render(pair)));
  pair.tabIn.onclick = () => show(pair, 'in');
  pair.tabOut.onclick = () => show(pair, 'out');
  pairs.push(pair);
  $('#empty').hidden = true;
  if (saved) pair.src.value = saved.text || '';
  if (saved && saved.patch) pair.setPatch(saved.patch);
  if (saved && saved.name) setName(pair, saved.name);
  if (!saved) { show(pair, 'in'); pair.src.focus(); }
  return pair;
}
