import { el } from './dom.js';
import { build } from './tree.js';
import { state } from './state.js';
import { renderView } from './view-render.js';

// Outputs are rendered lazily: render() only marks them stale, and ensure() builds one when its tab is shown.
export function render(pair) {
  pair.treeDirty = true;
  pair.views.forEach(v => { v.dirty = true; });
  if (state.current && state.current.pair === pair) ensure(pair, state.current.kind);
}

// Show a placeholder straight away and do the heavy work on the next tick, so the page can paint first.
export function ensure(pair, kind) {
  if (kind === 'out' && pair.treeDirty) {
    pair.treeDirty = false;
    pair.tree.replaceChildren(el('div', 'meta', 'Loading…'));
    setTimeout(() => renderTree(pair), 20);
  } else if (typeof kind === 'object' && kind.dirty) {
    kind.dirty = false;
    kind.body.replaceChildren(el('div', 'meta', 'Loading…'));
    setTimeout(() => renderView(pair, kind), 20);
  }
}

function renderTree(pair) {
  const tree = pair.tree;
  tree.replaceChildren();
  const text = pair.src.value.trim();
  if (!text) { tree.append(el('div', 'err', 'Nothing to show. Paste some JSON on the Input tab.')); return; }
  let data;
  try { data = JSON.parse(text); }
  catch (e) { tree.append(el('div', 'err', 'Invalid JSON: ' + e.message)); return; }
  const ul = el('ul');
  const root = build(data, null, true);
  ul.append(root);
  tree.append(ul);
  if (root.toggle) root.toggle(); // open the root
}
