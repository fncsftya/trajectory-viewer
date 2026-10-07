import { STORE_KEY, STATE_VERSION, STATE_FORMAT } from './config.js';
import { state, pairs, evaluate } from './state.js';

let saveTimer = null;

// Migrations[n] upgrades a version-n snapshot to version n+1. Append one whenever the shape changes
// and bump STATE_VERSION. Unversioned snapshots (saved before versioning existed) are version 0.
const migrations = [
  s => s, // 0 -> 1: the shape is unchanged; versioning was just added
];

export function migrate(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.pairs)) throw new Error('Not a valid state file.');
  let v = Number.isInteger(data.version) ? data.version : 0;
  if (v > STATE_VERSION) throw new Error(`State version ${v} is newer than this app supports (${STATE_VERSION}).`);
  if (v < 0) throw new Error('Invalid state version.');
  while (v < STATE_VERSION) data = { ...migrations[v](data), version: ++v };
  return data;
}

function snapshot() {
  return {
    version: STATE_VERSION,
    pairs: pairs.map(p => ({
      hue: p.hue, num: p.num, name: p.name, text: p.src.value, patch: p.patch,
      full: p.out.classList.contains('full'),
      views: p.views.map(v => ({ num: v.num, config: v.config, state: v.state, preamble: v.preamble })),
    })),
    evaluate: { open: evaluate.open, groups: evaluate.groups },
    current: state.current && {
      pair: pairs.indexOf(state.current.pair),
      kind: typeof state.current.kind === 'string' ? state.current.kind : state.current.kind.num,
    },
  };
}

export function saveNow() {
  clearTimeout(saveTimer);
  if (state.restoring) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(snapshot())); } catch {}
}
export const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); };
addEventListener('pagehide', saveNow);

export function loadState() {
  try { return migrate(JSON.parse(localStorage.getItem(STORE_KEY))); } catch { return null; }
}

export function dumpState() {
  return JSON.stringify({ format: STATE_FORMAT, ...snapshot() }, null, 2);
}

// Validates and migrates file text, then makes it the stored state. Throws on bad input.
export function parseStateFile(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('File is not valid JSON.'); }
  if (data?.format !== STATE_FORMAT) throw new Error('Not a JSON Viewer state file.');
  return migrate(data);
}

export function replaceState(data) {
  state.restoring = true; // stop the pagehide save from overwriting what we store here
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
  catch { state.restoring = false; throw new Error('Could not store the state (browser storage full or blocked).'); }
  location.reload();
}

// Clears the stored state and reloads into a clean app.
export function resetState() {
  state.restoring = true; // stop the pagehide save from writing the current state back
  try { localStorage.removeItem(STORE_KEY); }
  catch { state.restoring = false; throw new Error('Could not clear the stored state (browser storage blocked).'); }
  location.reload();
}
