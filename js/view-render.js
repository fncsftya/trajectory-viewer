import { el } from './dom.js';
import { PAGE, PAGE_CHARS, SHOW_CHARS } from './config.js';
import { setAll } from './tree.js';
import { xmlTree } from './xml-tree.js';
import { resetGlobalCache, loopItems, passes, fill, xmlName, xmlLines, hasRequiredXml } from './engine.js';
import { save } from './persistence.js';

export function renderView(pair, v) {
  const body = v.body;
  body.replaceChildren();
  v.allOuts = () => [];
  const cfg = v.config;
  if (!cfg) { body.append(el('div', 'err', 'Not configured yet. Click Configure.')); return; }
  const text = pair.src.value.trim();
  let data;
  try { data = JSON.parse(text); }
  catch (e) { body.append(el('div', 'err', text ? 'Invalid JSON: ' + e.message : 'Nothing to show. Paste some JSON on the Input tab.')); return; }
  if (!cfg.loop) { body.append(el('div', 'err', 'This view uses an older configuration format. Click Configure and set the loop and conditions again.')); return; }
  const xml = cfg.mode === 'xml';
  resetGlobalCache();
  // One scope per item that passes the conditions; the item is available under the loop's name (default `item`).
  const as = (cfg.as || '').trim() || 'item';
  const recs = loopItems(data, cfg.loop).filter(it => passes(it, cfg.filters || [])).map(it => ({ [as]: it }));
  // XML is built lazily, only for outputs actually shown (or exported); text is cheap and may drop outputs, so it is built up front.
  let outs;
  if (xml && cfg.wrap?.on) {
    // One combined document: every output becomes a child of the root element.
    const name = xmlName(cfg.wrap.tag || 'root');
    const inner = recs.flatMap(rec => xmlLines(cfg.xml || [], rec, data, 1, !!cfg.pruneEmpty) || []);
    const text = inner.length ? [`<${name}>`, ...inner, `</${name}>`].join('\n') : `<${name}/>`;
    outs = { length: 1, at: () => text };
    v.allOuts = () => [text];
  } else if (xml && hasRequiredXml(cfg.xml || [])) {
    // Required elements can drop outputs, so the count isn't known until each one is built.
    const built = recs.map(rec => xmlLines(cfg.xml || [], rec, data, 0, !!cfg.pruneEmpty)?.join('\n')).filter(o => o !== undefined);
    outs = { length: built.length, at: i => built[i] };
    v.allOuts = () => built;
  } else if (xml) {
    const cache = new Array(recs.length);
    outs = { length: recs.length, at: i => cache[i] ??= xmlLines(cfg.xml || [], recs[i], data, 0, !!cfg.pruneEmpty).join('\n') };
    v.allOuts = () => recs.map((_, i) => outs.at(i));
  } else {
    const built = recs.map(rec => fill(cfg.template, rec, data));
    outs = { length: built.length, at: i => built[i] };
    v.allOuts = () => built;
  }
  body.append(el('div', 'meta view-count', outs.length + (outs.length === 1 ? ' output' : ' outputs')));
  // Render in pages so a huge result set doesn't build thousands of DOM nodes at once.
  // A page stops early once it has produced enough text, and yields to the browser between slices.
  let shown = 0, busy = false;
  const more = el('button', 'btn plain');
  const label = () => {
    more.hidden = shown >= outs.length;
    more.textContent = `Show more (${outs.length - shown} remaining)`;
  };
  const page = () => {
    if (busy) return;
    busy = true;
    more.hidden = true;
    let n = 0, chars = 0;
    const run = () => {
      if (!more.isConnected) return; // view was re-rendered meanwhile
      const t0 = performance.now();
      while (shown < outs.length && n < PAGE && chars < PAGE_CHARS) {
        const o = outs.at(shown++);
        chars += o.length; n++;
        more.before(outputItem(pair, v, o, xml));
        if (performance.now() - t0 > 25) { setTimeout(run); return; }
      }
      busy = false;
      label();
    };
    run();
  };
  more.onclick = page;
  body.append(more);
  more.hidden = true;
  page();
}

// Large outputs are hashed by length plus head and tail, to keep this cheap.
const hashText = t => {
  const k = t.length > 4000 ? t.length + t.slice(0, 2000) + t.slice(-2000) : t;
  let h = 5381;
  for (let i = 0; i < k.length; i++) h = (h * 33 + k.charCodeAt(i)) | 0;
  return String(h >>> 0);
};

// One rendered output entity: text plus a bottom toolbar (copy, minimise, tags). State is keyed by a hash of the text.
function outputItem(pair, v, text, xml) {
  const st = v.state[hashText(text)] ||= { min: false, tags: [] };
  const item = el('div', 'view-item');
  const body = el('div', 'view-text');
  const bar = el('div', 'item-bar');
  const fold = el('button', 'btn plain', '');
  let all = false;
  const big = text.length > SHOW_CHARS;
  const rest = el('button', 'btn plain', `Show all (${text.length.toLocaleString()} chars)`);
  rest.onclick = () => { all = true; apply(); };
  // XML outputs have two modes: raw text, or a foldable tree preview (built on first use).
  let tree = null;
  const modes = el('div', 'strtabs'), mbtn = {};
  const expand = el('button', 'btn plain', 'Expand all'), collapse = el('button', 'btn plain', 'Collapse all');
  expand.onclick = () => setAll(tree, true);
  collapse.onclick = () => setAll(tree, false);
  if (xml) for (const [k, label] of [['raw', 'Raw'], ['preview', 'Preview']]) {
    mbtn[k] = el('button', '', label);
    mbtn[k].onclick = () => { st.tab = k; apply(); save(); };
    modes.append(mbtn[k]);
  }
  const apply = () => {
    item.classList.toggle('min', st.min);
    const pv = xml && st.tab !== 'raw';
    for (const k in mbtn) mbtn[k].classList.toggle('active', (k === 'preview') === pv);
    if (pv && !tree) { tree = xmlTree(text); item.append(tree); }
    if (tree) tree.hidden = !pv || st.min;
    body.hidden = pv && !st.min;
    expand.hidden = collapse.hidden = !pv || st.min || !!tree.querySelector(':scope > .err');
    body.textContent = st.min ? text.slice(0, 400).replace(/\s+/g, ' ').trim()
      : big && !all ? text.slice(0, SHOW_CHARS) + '\n…' : text;
    rest.hidden = !big || all || st.min;
    fold.textContent = st.min ? 'Expand' : 'Minimise';
  };
  fold.onclick = () => { st.min = !st.min; apply(); save(); };

  const copy = el('button', 'btn plain', 'Copy');
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; }
    catch { copy.textContent = 'Failed'; }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
  };

  const tags = el('span', 'item-tags');
  const drawTags = () => {
    tags.replaceChildren();
    st.tags.forEach((t, i) => {
      const chip = el('span', 'chip', t);
      const x = el('button', 'chip-x', '×');
      x.title = 'Remove tag';
      x.onclick = () => { st.tags.splice(i, 1); drawTags(); save(); };
      chip.append(x);
      tags.append(chip);
    });
  };
  const addTag = el('button', 'btn plain', '+ Tag');
  addTag.onclick = () => {
    const input = el('input', 'tag-input');
    input.placeholder = 'tag…';
    let done = false;
    const finish = commit => {
      if (done) return;
      done = true;
      const t = input.value.trim();
      if (commit && t && !st.tags.includes(t)) { st.tags.push(t); drawTags(); save(); }
      input.replaceWith(addTag);
    };
    input.onkeydown = e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); };
    input.onblur = () => finish(true);
    addTag.replaceWith(input);
    input.focus();
  };

  bar.append(...(xml ? [modes] : []), copy, fold, rest, expand, collapse, addTag, tags);
  drawTags();
  item.append(bar, body);
  apply(); // after the bar/body so the lazily-built tree lands below the toolbar
  return item;
}
