import { el } from './dom.js';
import { MAX_PREVIEW, LONG_STRING, CHUNK } from './config.js';
import { stringBlock } from './tree.js';

const XEL = 1, XTEXT = 3, XCDATA = 4, XCOMMENT = 8;
// Child nodes worth showing: elements, comments and non-blank text.
const xKids = e => [...e.childNodes].filter(n => n.nodeType === XEL || n.nodeType === XCOMMENT || ((n.nodeType === XTEXT || n.nodeType === XCDATA) && n.nodeValue.trim()));
const xIsText = n => n.nodeType === XTEXT || n.nodeType === XCDATA;

// Outputs can hold several top-level elements, so they are parsed inside a synthetic root.
function parseXml(text) {
  const doc = new DOMParser().parseFromString('<x-root>' + text + '</x-root>', 'application/xml');
  const bad = doc.getElementsByTagName('parsererror')[0];
  if (bad) {
    const msg = bad.textContent;
    throw new Error((msg.match(/error on line[^\n]*?(?=Below|\n|$)/) || [msg.slice(0, 200)])[0].trim());
  }
  return doc.documentElement;
}

function xmlTag(e, selfClose) {
  const parts = [el('span', 'punc', '<'), el('span', 'key', e.nodeName)];
  for (const a of e.attributes) parts.push(el('span', 'meta', ' ' + a.name + '='), el('span', 'str', '"' + a.value + '"'));
  parts.push(el('span', 'punc', selfClose ? '/>' : '>'));
  return parts;
}

function xmlBrief(n) {
  if (n.nodeType === XCOMMENT) return '<!-- -->';
  if (xIsText(n)) return JSON.stringify(n.nodeValue.trim());
  const k = xKids(n);
  if (!k.length) return '<' + n.nodeName + '/>';
  if (k.every(xIsText)) return n.nodeName + ': ' + JSON.stringify(n.textContent.trim().replace(/\s+/g, ' '));
  return '<' + n.nodeName + '>…';
}

// Empty elements (`<reasoning/>`) are left out of the list and only counted, so the list shows what actually has content.
const xIsEmpty = n => n.nodeType === XEL && !xKids(n).length;

function xmlPreview(kids) {
  const parts = [];
  const full = kids.filter(n => !xIsEmpty(n)), empty = kids.length - full.length;
  let len = 0, more = false;
  for (const n of full) {
    let s = xmlBrief(n);
    if (s.length > 30) s = s.slice(0, 29) + '…';
    if (len + s.length > MAX_PREVIEW) { more = true; break; }
    parts.push(s);
    len += s.length + 2;
  }
  return parts.join(', ') + (more ? ', …' : '') + '  ' + kids.length + (kids.length === 1 ? ' node' : ' nodes') + (empty ? ` (${empty} empty)` : '');
}

// Repeated sibling elements are banded like array items.
function xmlAlts(kids) {
  const count = {}, seen = {};
  for (const n of kids) if (n.nodeType === XEL) count[n.nodeName] = (count[n.nodeName] || 0) + 1;
  return kids.map(n => n.nodeType === XEL && count[n.nodeName] > 1 ? (seen[n.nodeName] = (seen[n.nodeName] || 0) + 1) % 2 : undefined);
}

// Children are added CHUNK at a time so a huge element doesn't build thousands of nodes at once.
function xmlFill(ul, kids) {
  const alts = xmlAlts(kids), total = kids.length;
  const addRange = from => {
    const to = Math.min(total, from + CHUNK);
    for (let i = from; i < to; i++) ul.append(buildXml(kids[i], alts[i]));
    if (to < total) {
      const more = el('li', 'more');
      const b = el('button', 'btn plain', `Show ${Math.min(CHUNK, total - to)} more (${total - to} remaining)`);
      b.onclick = e => { e.stopPropagation(); more.remove(); addRange(to); };
      more.append(b);
      ul.append(more);
    }
  };
  addRange(0);
}

function buildXml(n, alt) {
  const li = el('li', alt === undefined ? '' : 'alt' + alt);
  const row = el('div', 'row');
  if (n.nodeType !== XEL) {
    if (n.nodeType === XCOMMENT) {
      row.append(el('span', 'tog', ''), el('span', 'meta', '<!--' + n.nodeValue + '-->'));
      li.append(row);
      return li;
    }
    const t = n.nodeValue.trim();
    if (t.length > LONG_STRING || t.includes('\n')) { li.append(stringBlock(t, '', t)); return li; }
    row.append(el('span', 'tog', ''), el('span', 'str', t));
    li.append(row);
    return li;
  }

  const kids = xKids(n);
  if (kids.every(xIsText)) { // empty, or only text
    const t = n.textContent.trim();
    row.append(el('span', 'tog', ''));
    li.append(row);
    if (!kids.length) { row.append(...xmlTag(n, true)); return li; }
    if (t.length > LONG_STRING || t.includes('\n')) {
      row.append(...xmlTag(n, false));
      const close = el('div', 'close');
      close.append(el('span', 'tog', ''), el('span', 'punc', '</' + n.nodeName + '>'));
      li.append(stringBlock(t, '', t), close);
      return li;
    }
    row.append(...xmlTag(n, false), el('span', 'str', t), el('span', 'punc', '</' + n.nodeName + '>'));
    return li;
  }

  li.classList.add('node', 'collapsed');
  row.classList.add('fold');
  const tog = el('span', 'tog', '▸');
  row.append(tog, ...xmlTag(n, false), el('span', 'preview', xmlPreview(kids)), el('span', 'punc end', '</' + n.nodeName + '>'));
  li.append(row);

  let built = false;
  // Shift-click expanding also opens direct children (one level only).
  const toggle = (openChildren = false) => {
    if (!built) {
      built = true;
      const ul = el('ul');
      xmlFill(ul, kids);
      li.append(ul);
      const close = el('div', 'close');
      close.append(el('span', 'tog', ''), el('span', 'punc', '</' + n.nodeName + '>'));
      li.append(close);
    }
    li.classList.toggle('collapsed');
    const collapsed = li.classList.contains('collapsed');
    tog.textContent = collapsed ? '▸' : '▾';
    if (!collapsed && (openChildren || kids.length === 1))
      for (const c of li.querySelectorAll(':scope > ul > li.node.collapsed')) c.toggle();
  };
  li.toggle = toggle;
  row.onclick = e => toggle(e.shiftKey);
  return li;
}

export function xmlTree(text) {
  const box = el('div', 'xtree');
  let root;
  try { root = parseXml(text); }
  catch (e) { box.append(el('div', 'err', 'Could not preview this XML: ' + e.message)); return box; }
  const ul = el('ul');
  xmlFill(ul, xKids(root));
  box.append(ul);
  for (const li of ul.querySelectorAll(':scope > li.node')) li.toggle(); // open the top level
  return box;
}
