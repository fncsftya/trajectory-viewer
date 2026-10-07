

export const MD_THRESHOLD = 3;
const MD_SIGNS = [
  /\[[^\]\n]+\]\([^)\s]+\)/g,          // links
  /\*\*[^*\n]+\*\*|__[^_\n]+__/g,      // bold
  /(?<![\w*])\*[^*\s][^*\n]*\*(?![\w*])/g, // italic
  /`[^`\n]+`/g,                        // inline code
  /^```/gm,                            // code fence
  /^#{1,6} +\S/gm,                     // headings
  /^ *[-*+] +\S/gm,                    // bullets
  /^ *\d+[.)] +\S/gm,                  // numbered
  /^> +\S/gm,                          // blockquote
  /^\|.+\|\s*$/gm,                     // table rows
];
export const mdScore = s => MD_SIGNS.reduce((n, re) => n + (s.match(re) || []).length, 0);

export const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function mdInline(src) {
  const codes = [];
  let t = escHtml(src).replace(/`([^`\n]+)`/g, (_, c) => '\u0000' + (codes.push(c) - 1) + '\u0000');
  t = t.replace(/!?\[([^\]\n]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (m, text, url) => {
    const u = url.replace(/&amp;/g, '&');
    return /^(https?:|file:|mailto:|#|\/)/i.test(u)
      ? '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>' : m;
  });
  t = t.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => '<strong>' + (a || b) + '</strong>')
       .replace(/(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])/g, '<em>$1</em>')
       .replace(/(?<!\w)_([^_\s][^_]*?)_(?!\w)/g, '<em>$1</em>')
       .replace(/~~(.+?)~~/g, '<del>$1</del>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + codes[i] + '</code>');
}

export function renderMarkdown(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const isBlockStart = l => /^(```|#{1,6} |> |\s*([-*+]|\d+[.)]) +\S|\s*([-*_] *){3,}$)/.test(l);
  const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    let m;
    if (!l.trim()) { i++; continue; }
    if (/^```/.test(l)) {
      const buf = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) buf.push(lines[i]);
      i++;
      out.push('<pre><code>' + escHtml(buf.join('\n')) + '</code></pre>');
    } else if ((m = /^(#{1,6}) +(.*?)#* *$/.exec(l))) {
      out.push('<h' + m[1].length + '>' + mdInline(m[2]) + '</h' + m[1].length + '>'); i++;
    } else if (/^\s*([-*_] *){3,}$/.test(l)) {
      out.push('<hr>'); i++;
    } else if (/^> ?/.test(l)) {
      const buf = [];
      for (; i < lines.length && /^> ?/.test(lines[i]); i++) buf.push(lines[i].replace(/^> ?/, ''));
      out.push('<blockquote>' + renderMarkdown(buf.join('\n')) + '</blockquote>');
    } else if (/^\s*([-*+]|\d+[.)]) +\S/.test(l)) {
      const stack = []; // {indent, tag}
      let html = '';
      for (; i < lines.length; i++) {
        const lm = /^(\s*)([-*+]|\d+[.)]) +(.*)$/.exec(lines[i]);
        if (!lm) break;
        const indent = lm[1].replace(/\t/g, '    ').length, tag = /\d/.test(lm[2]) ? 'ol' : 'ul';
        while (stack.length && indent < stack[stack.length - 1].indent) html += '</li></' + stack.pop().tag + '>';
        if (stack.length && indent === stack[stack.length - 1].indent) html += '</li>';
        else if (!stack.length || indent > stack[stack.length - 1].indent) { stack.push({ indent, tag }); html += '<' + tag + '>'; }
        html += '<li>' + mdInline(lm[3]);
      }
      while (stack.length) html += '</li></' + stack.pop().tag + '>';
      out.push(html);
    } else if (/^\|.*\|\s*$/.test(l) && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1] || '')) {
      const head = cells(l);
      let html = '<table><thead><tr>' + head.map(c => '<th>' + mdInline(c) + '</th>').join('') + '</tr></thead><tbody>';
      for (i += 2; i < lines.length && /^\|.*\|\s*$/.test(lines[i]); i++)
        html += '<tr>' + cells(lines[i]).map(c => '<td>' + mdInline(c) + '</td>').join('') + '</tr>';
      out.push(html + '</tbody></table>');
    } else {
      const buf = [];
      for (; i < lines.length && lines[i].trim() && (!buf.length || !isBlockStart(lines[i])); i++) buf.push(lines[i]);
      out.push('<p>' + buf.map(mdInline).join('<br>') + '</p>');
    }
  }
  return out.join('');
}
