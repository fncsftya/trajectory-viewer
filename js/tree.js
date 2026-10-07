import { el } from './dom.js';
import { isContainer } from './util.js';
import { MAX_PREVIEW, LONG_STRING, CHUNK } from './config.js';
import { mdScore, renderMarkdown, MD_THRESHOLD } from './markdown.js';

// One-line summary of a value for use inside a fold preview.
function brief(v) {
  if (Array.isArray(v)) return v.length ? '[…]' : '[]';
  if (isContainer(v)) return Object.keys(v).length ? '{…}' : '{}';
  return JSON.stringify(v);
}

function preview(v) {
  const isArr = Array.isArray(v);
  const parts = [];
  let len = 0, more = false;
  const keys = Object.keys(v), count = keys.length;
  for (const k of keys) {
    const x = v[k];
    let s = (isArr ? '' : JSON.stringify(k) + ': ') + brief(x);
    if (s.length > 30) s = s.slice(0, 29) + '…';
    if (len + s.length > MAX_PREVIEW) { more = true; break; }
    parts.push(s);
    len += s.length + 2;
  }
  const body = parts.join(', ') + (more ? ', …' : '');
  return (isArr ? '[' : '{') + (body ? ' ' + body + ' ' : '') + (isArr ? ']' : '}')
    + '  ' + count + (isArr ? ' item' : ' key') + (count === 1 ? '' : 's');
}

// JSON-escaped string body, but with \n shown as real line breaks and \r dropped.
function multiline(s) {
  return JSON.stringify(s).slice(1, -1).replace(/\\\\|\\n|\\r/g, m => m === '\\n' ? '\n' : m === '\\r' ? '' : m);
}

// Long/multiline string: tabbed Raw / Markdown view, defaulting by markdown detection.
export function stringBlock(v, comma, shown) {
  const box = el('div', 'strbox');
  const raw = el('div', 'str block', shown ?? '"' + multiline(v) + '"');
  raw.append(el('span', 'punc', comma));
  const md = el('div', 'md');
  let rendered = false;
  const tabs = el('div', 'strtabs');
  const btns = {};
  const pick = mode => {
    for (const k in btns) btns[k].classList.toggle('active', k === mode);
    raw.hidden = mode !== 'raw';
    md.hidden = mode !== 'markdown';
    if (mode === 'markdown' && !rendered) { rendered = true; md.innerHTML = renderMarkdown(v); }
  };
  for (const [k, label] of [['raw', 'Raw'], ['markdown', 'Markdown']]) {
    btns[k] = el('button', '', label);
    btns[k].onclick = e => { e.stopPropagation(); pick(k); };
    tabs.append(btns[k]);
  }
  box.append(tabs, raw, md);
  pick(mdScore(v) >= MD_THRESHOLD ? 'markdown' : 'raw');
  return box;
}

function primitive(v) {
  const cls = typeof v === 'string' ? 'str' : (typeof v === 'number' ? 'num' : 'lit');
  return el('span', cls, JSON.stringify(v));
}

export function build(v, key, isLast, alt) {
  const li = el('li', alt === undefined ? '' : 'alt' + alt);
  const row = el('div', 'row');
  const comma = isLast ? '' : ',';
  const addKey = () => {
    if (key !== null) {
      row.append(el('span', 'key', JSON.stringify(key)), el('span', 'punc', ': '));
    }
  };

  if (!isContainer(v) || (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0)) {
    row.append(el('span', 'tog', ''));
    addKey();
    if (typeof v === 'string' && (v.length > LONG_STRING || v.includes('\n'))) {
      li.append(row);
      li.append(stringBlock(v, comma));
      return li;
    }
    row.append(isContainer(v) ? el('span', 'punc', Array.isArray(v) ? '[]' : '{}') : primitive(v));
    row.append(el('span', 'punc', comma));
    li.append(row);
    return li;
  }

  const isArr = Array.isArray(v);
  li.classList.add('node', 'collapsed');
  row.classList.add('fold');
  const tog = el('span', 'tog', '▸');
  row.append(tog);
  addKey();
  row.append(el('span', 'punc open-only', isArr ? '[' : '{'));
  row.append(el('span', 'preview', preview(v)));
  row.append(el('span', 'punc end', comma));
  li.append(row);

  let built = false;
  // Shift-click expanding also opens direct children (one level only); children opened this way don't cascade.
  const toggle = (openChildren = false) => {
    if (!built) {
      built = true;
      const ul = el('ul');
      const keys = Object.keys(v), total = keys.length;
      // Children are added CHUNK at a time so a huge array/object doesn't build thousands of nodes at once.
      const addRange = from => {
        const to = Math.min(total, from + CHUNK);
        for (let i = from; i < to; i++) ul.append(build(v[keys[i]], isArr ? null : keys[i], i === total - 1, isArr ? i % 2 : undefined));
        if (to < total) {
          const more = el('li', 'more');
          const b = el('button', 'btn plain', `Show ${Math.min(CHUNK, total - to)} more (${total - to} remaining)`);
          b.onclick = e => { e.stopPropagation(); more.remove(); addRange(to); };
          more.append(b);
          ul.append(more);
        }
      };
      addRange(0);
      li.append(ul);
      const close = el('div', 'close');
      close.append(el('span', 'tog', ''), el('span', 'punc', (isArr ? ']' : '}') + comma));
      li.append(close);
    }
    li.classList.toggle('collapsed');
    const collapsed = li.classList.contains('collapsed');
    tog.textContent = collapsed ? '▸' : '▾';
    if (!collapsed && (openChildren || (isArr && v.length === 1)))
      for (const c of li.querySelectorAll(':scope > ul > li.node.collapsed')) c.toggle();
  };
  li.toggle = toggle;
  row.onclick = e => toggle(e.shiftKey);
  return li;
}

export function setAll(tree, open) {
  // Expand lazily-built nodes level by level, capped to avoid freezing on huge docs.
  let budget = 20000;
  const walk = root => {
    for (const li of root.querySelectorAll(':scope > ul > li.node, :scope > li.node')) {
      const isOpen = !li.classList.contains('collapsed');
      if (open && !isOpen && budget-- > 0) li.toggle();
      if (!open && isOpen) li.toggle();
      walk(li);
    }
  };
  walk(tree.querySelector(':scope > ul') || tree);
}
