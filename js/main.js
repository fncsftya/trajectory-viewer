import { $ } from './dom.js';
import { state, pairs } from './state.js';
import { saveNow, loadState, dumpState, parseStateFile, replaceState } from './persistence.js';
import { show, addPair, openSettings } from './tabs.js';
import { addView } from './views.js';
import { initEvaluate } from './evaluate.js';
import { initDiagnostics } from './diagnostics.js';

export function restore(saved) {
  state.restoring = true;
  for (const sp of saved.pairs) {
    const pair = addPair(sp);
    for (const sv of sp.views || []) addView(pair, sv);
  }
  state.restoring = false;
  $('#empty').hidden = pairs.length > 0;
  const c = saved.current, pair = c && pairs[c.pair];
  if (pair) show(pair, c.kind === 'in' || c.kind === 'out' ? c.kind : pair.views.find(v => v.num === c.kind) || 'out');
  else if (pairs.length) show(pairs[0], 'in');
  initEvaluate(saved.evaluate);
  saveNow();
}

initDiagnostics();
$('#add').onclick = () => addPair();
$('#settings').onclick = openSettings;
$('#state-save').onclick = () => {
  const a = document.createElement('a');
  const url = a.href = URL.createObjectURL(new Blob([dumpState()], { type: 'application/json' }));
  a.download = `json-viewer-state-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('#state-load').onclick = () => $('#state-file').click();
$('#state-file').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = parseStateFile(await file.text());
    if (!confirm('Replace all current tabs, views and evaluation notes with the contents of this file?')) return;
    replaceState(data);
  } catch (err) { alert(err.message); }
};
// Clicking the backdrop (the dialog element itself, outside its content box) closes it; Esc is built in.
$('#settings-modal').addEventListener('mousedown', e => {
  if (e.target !== e.currentTarget) return;
  const r = e.currentTarget.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.currentTarget.close();
});
const stored = loadState();
if (stored && Array.isArray(stored.pairs)) restore(stored); else { addPair(); initEvaluate(); }
