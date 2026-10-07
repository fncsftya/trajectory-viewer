import { $ } from './dom.js';
import { isContainer } from './util.js';
import { state } from './state.js';
import { shapeOf } from './schema.js';
import { resetGlobalCache, loopItems, passes, isEmptyVal, valueAt, outputOf } from './engine.js';
import { currentCfg } from './view-config.js';

function trimSample(v, depth = 0) {
  if (typeof v === 'string') return v.length > 80 ? v.slice(0, 80) + `…(${v.length} chars)` : v;
  if (!isContainer(v)) return v;
  if (depth > 6) return '…';
  if (Array.isArray(v)) {
    const r = v.slice(0, 3).map(x => trimSample(x, depth + 1));
    if (v.length > 3) r.push(`…(${v.length - 3} more)`);
    return r;
  }
  return Object.fromEntries(Object.entries(v).slice(0, 30).map(([k, x]) => [k, trimSample(x, depth + 1)]));
}
function diagnostics() {
  const { pair } = state.draft;
  const cfg = currentCfg();
  const rep = { note: 'json-viewer diagnostics (loop format)', config: cfg };
  try {
    const data = JSON.parse(pair.src.value.trim());
    rep.shape = shapeOf(state.draft.schema);
    rep.sample = trimSample(data);
    const items = loopItems(data, cfg.loop), kept = items.filter(it => passes(it, cfg.filters));
    resetGlobalCache();
    const outputs = kept.map(it => outputOf(cfg, { [cfg.as]: it }, data));
    rep.results = {
      items: items.length,
      itemsAfterConditions: kept.length,
      conditions: cfg.filters.map(p => ({ path: p.join('.'), notEmptyIn: items.filter(it => !isEmptyVal(valueAt(it, p))).length })),
      droppedByRequiredElements: outputs.filter(o => o === null).length,
      firstItems: kept.slice(0, 2).map(it => trimSample(it)),
      firstOutputs: outputs.filter(o => o !== null).slice(0, 3).map(o => o.slice(0, 2000)),
    };
  } catch (e) { rep.error = String(e && e.stack || e); }
  return JSON.stringify(rep, null, 2);
}
export function initDiagnostics() {
  $('#vc-diag-btn').onclick = async () => {
    const text = diagnostics(), box = $('#vc-diag');
    try { await navigator.clipboard.writeText(text); box.hidden = true; $('#vc-err').textContent = 'Diagnostics copied (' + text.length.toLocaleString() + ' chars). Review before sharing: it includes trimmed sample data.'; }
    catch { box.value = text; box.hidden = false; box.select(); $('#vc-err').textContent = 'Could not copy automatically. Select all in the box and copy.'; }
  };
}
