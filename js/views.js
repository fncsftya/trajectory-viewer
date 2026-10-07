import { $, el } from './dom.js';
import { renderView } from './view-render.js';
import { openConfigure } from './view-config.js';
import { openExport } from './export.js';
import { applyColour, show, viewLabel } from './tabs.js';

export function addView(pair, saved) {
  let n = 1;
  while (pair.views.some(v => v.num === n)) n++;
  const view = saved ? { num: saved.num, config: saved.config, state: saved.state || {}, preamble: saved.preamble || '' } : { num: n, config: null, state: {}, preamble: '' };
  view.tab = el('button', 'tab');
  const last = pair.views.length ? pair.views[pair.views.length - 1].tab : pair.tabOut;
  last.after(view.tab);

  const sec = view.sec = el('section', 'viewsec');
  const tools = el('div', 'tools');
  const cfg = el('button', 'btn plain', 'Configure');
  const exp = el('button', 'btn plain', 'Export');
  exp.title = 'Copy all results as one string';
  exp.onclick = async () => {
    if (view.config?.mode === 'xml') return openExport(view);
    const outs = view.allOuts ? view.allOuts() : [];
    const { header = '', footer = '' } = view.config?.mode === 'xml' ? {} : view.config || {};
    const text = outs.length > 1 ? [header, ...outs, footer].filter(x => x !== '').join('\n') : outs[0] || '';
    try { await navigator.clipboard.writeText(text); exp.textContent = 'Copied'; }
    catch { exp.textContent = 'Failed'; }
    setTimeout(() => { exp.textContent = 'Export'; }, 1200);
  };
  const close = el('button', 'btn plain', 'Close');
  tools.append(cfg, exp, close);
  view.body = el('div', 'viewbody');
  sec.append(tools, view.body);
  applyColour(sec, pair.hue); applyColour(view.tab, pair.hue);
  $('main').append(sec);

  cfg.onclick = () => openConfigure(pair, view);
  close.onclick = () => {
    if (view.config && !confirm('Close this view and discard its configuration?')) return;
    pair.views.splice(pair.views.indexOf(view), 1);
    view.tab.remove(); sec.remove();
    show(pair, 'out');
  };
  view.tab.onclick = () => show(pair, view);
  pair.views.push(view);
  view.tab.textContent = viewLabel(pair, view);
  if (saved) { view.dirty = true; return; }
  renderView(pair, view);
  show(pair, view);
  openConfigure(pair, view);
}
