import { $ } from './dom.js';
import { state, pairs } from './state.js';
import { saveNow, loadState } from './persistence.js';
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
// Clicking the backdrop (the dialog element itself, outside its content box) closes it; Esc is built in.
$('#settings-modal').addEventListener('mousedown', e => {
  if (e.target !== e.currentTarget) return;
  const r = e.currentTarget.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.currentTarget.close();
});
const stored = loadState();
if (stored && Array.isArray(stored.pairs)) restore(stored); else { addPair(); initEvaluate(); }
