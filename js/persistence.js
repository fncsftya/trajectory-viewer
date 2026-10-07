import { STORE_KEY } from './config.js';
import { state, pairs } from './state.js';

let saveTimer = null;

export function saveNow() {
  clearTimeout(saveTimer);
  if (state.restoring) return;
  const snapshot = {
    pairs: pairs.map(p => ({
      hue: p.hue, num: p.num, name: p.name, text: p.src.value, patch: p.patch,
      full: p.out.classList.contains('full'),
      views: p.views.map(v => ({ num: v.num, config: v.config, state: v.state, preamble: v.preamble })),
    })),
    current: state.current && {
      pair: pairs.indexOf(state.current.pair),
      kind: typeof state.current.kind === 'string' ? state.current.kind : state.current.kind.num,
    },
  };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(snapshot)); } catch {}
}
export const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); };
addEventListener('pagehide', saveNow);

export function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; }
}
