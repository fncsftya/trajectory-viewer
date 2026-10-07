import { $, el } from './dom.js';
import { save } from './persistence.js';

export function openExport(view) {
  const xml = (view.allOuts ? view.allOuts() : []).join('\n');
  const pre = $('#ex-pre');
  pre.value = view.preamble || '';
  pre.oninput = () => { view.preamble = pre.value; save(); }; // kept on every edit, so Cancel/Esc don't lose it
  $('#ex-info').textContent = `The XML (${xml.length.toLocaleString()} characters) will be copied in a code block.`;
  $('#ex-err').textContent = '';
  const build = () => {
    view.preamble = pre.value;
    const p = pre.value.trim();
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
    $('#ex-err').textContent = '';
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
      $('#ex-err').textContent = '';
    } catch { $('#ex-err').textContent = 'Could not read that file.'; }
  };
  $('#ex-go').onclick = async () => {
    const text = build();
    try { await navigator.clipboard.writeText(text); $('#export-modal').close(); }
    catch { $('#ex-err').textContent = 'Could not copy to the clipboard.'; }
  };
  $('#ex-cancel').onclick = () => $('#export-modal').close();
  $('#export-modal').showModal();
  pre.focus();
}