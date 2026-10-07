import { $, el } from './dom.js';
import { save } from './persistence.js';
import { renderMarkdown, escHtml } from './markdown.js';
import { fill, resetGlobalCache, warnings } from './engine.js';
import { buildSchema, newSchema } from './schema.js';
import { attachAutocomplete } from './autocomplete.js';

const PREVIEW_XML_LINES = 8;
const PREVIEW_PATCH_LINES = 12, PREVIEW_PATCH_CHARS = 1500;
const PATCH_TOKEN = '\u0001PATCH\u0001';

// Document and attached patch for the pair being exported, used for `$refs` in the preamble.
let ctx = { schema: newSchema(), root: undefined, patch: null, complete: {} };
attachAutocomplete($('#ex-pre'), () => ctx.complete, () => ctx.schema);

function exportContext(pair) {
  let root;
  try { root = JSON.parse(pair.src.value); } catch {}
  const patch = pair.patch ? pair.patch.text : null;
  const patchNode = newSchema();
  patchNode.types.add('string');
  return {
    root, patch,
    schema: root === undefined ? newSchema() : buildSchema(root),
    complete: patch === null ? {} : { patch: patchNode },
  };
}

// Preamble with `$patch` and document references filled in; `patchText` stands in for `$patch`.
function fillPreamble(text, patchText) {
  resetGlobalCache();
  return fill(text, patchText === null ? {} : { patch: patchText }, ctx.root);
}

// Lookup problems in the current preamble, shown where errors go.
function showWarnings() {
  fillPreamble($('#ex-pre').value, ctx.patch);
  $('#ex-err').textContent = warnings.size ? '⚠ ' + [...warnings].join('; ') : '';
}

function truncatePatch(text) {
  const lines = text.split('\n');
  let out = lines.slice(0, PREVIEW_PATCH_LINES).join('\n');
  if (out.length > PREVIEW_PATCH_CHARS) out = out.slice(0, PREVIEW_PATCH_CHARS);
  if (out.length >= text.length) return text;
  return out + `\n… ${(text.length - out.length).toLocaleString()} more characters`;
}

export function openExport(pair, view) {
  ctx = exportContext(pair);
  const xml = (view.allOuts ? view.allOuts() : []).join('\n');
  const pre = $('#ex-pre');
  pre.value = view.preamble || '';
  pre.oninput = () => { view.preamble = pre.value; save(); showWarnings(); }; // kept on every edit, so Cancel/Esc don't lose it
  $('#ex-info').textContent = `The XML (${xml.length.toLocaleString()} characters) will be copied in a code block.`;
  showWarnings();
  const build = () => {
    view.preamble = pre.value;
    const p = fillPreamble(pre.value, ctx.patch).trim();
    return (p ? p + '\n\n' : '') + '```xml\n' + xml + '\n```';
  };
  $('#ex-dl').onclick = () => {
    const url = URL.createObjectURL(new Blob([build()], { type: 'text/plain;charset=utf-8' }));
    const a = el('a');
    a.href = url;
    a.download = (view.tab.textContent.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'export') + '.txt';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#export-modal').close();
  };
  $('#ex-pre-save').onclick = () => {
    if (!pre.value) { $('#ex-err').textContent = 'The preamble is empty.'; return; }
    showWarnings();
    const url = URL.createObjectURL(new Blob([pre.value], { type: 'text/plain;charset=utf-8' }));
    const a = el('a');
    a.href = url;
    a.download = 'preamble.txt';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('#ex-pre-load').onclick = () => $('#ex-pre-file').click();
  $('#ex-pre-file').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = ''; // so picking the same file again still fires change
    if (!f) return;
    try {
      pre.value = await f.text();
      pre.oninput();
    } catch { $('#ex-err').textContent = 'Could not read that file.'; }
  };
  const setTab = tab => {
    for (const t of document.querySelectorAll('.ex-tab')) t.classList.toggle('active', t.dataset.tab === tab);
    $('#ex-edit-bar').hidden = pre.hidden = tab !== 'edit';
    $('#ex-preview').hidden = tab !== 'preview';
    if (tab === 'preview') {
      const lines = xml.split('\n'), p = fillPreamble(pre.value, ctx.patch === null ? null : PATCH_TOKEN).trim();
      const shown = lines.slice(0, PREVIEW_XML_LINES);
      if (lines.length > shown.length) shown.push(`… ${(lines.length - shown.length).toLocaleString()} more lines`);
      $('#ex-preview').innerHTML = (p ? renderMarkdown(p).replaceAll(PATCH_TOKEN, '<span class="ex-patch">' + escHtml(truncatePatch(ctx.patch ?? '')) + '</span>') : '')
        + '<div class="ex-attach">XML will be attached here</div>'
        + renderMarkdown('```xml\n' + shown.join('\n') + '\n```');
    } else pre.focus();
  };
  for (const t of document.querySelectorAll('.ex-tab')) t.onclick = () => setTab(t.dataset.tab);
  setTab('edit');
  $('#ex-go').onclick = async () => {
    const text = build();
    try { await navigator.clipboard.writeText(text); $('#export-modal').close(); }
    catch { $('#ex-err').textContent = 'Could not copy to the clipboard.'; }
  };
  $('#ex-cancel').onclick = () => $('#export-modal').close();
  $('#export-modal').showModal();
  pre.focus();
}