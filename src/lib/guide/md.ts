// Markdown gọn cho tab Hướng dẫn → HTML an toàn (mọi chữ đều được escape).
// Hỗ trợ: tiêu đề ##/###, đoạn văn, **đậm**, *nghiêng*, `mã`, [link](url), ảnh ![chú thích](url),
// danh sách -, 1., checklist - [ ] / - [x], bảng | a | b |, trích dẫn > và hộp lưu ý > [!NOTE] / [!TIP] / [!WARNING] / [!CAUTION],
// đường kẻ ---, khối mã ```.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeUrl = (u: string) => /^(https?:\/\/|\/|#|mailto:)/i.test(u.trim()) ? u.trim() : '#';

function inline(s: string): string {
  // tách `mã` ra trước để không bị xử lý tiếp
  const codes: string[] = [];
  let t = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  t = esc(t);
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => `<img src="${esc(safeUrl(url.replace(/&amp;/g, '&')))}" alt="${alt}" loading="lazy">`);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) => { const u = safeUrl(url.replace(/&amp;/g, '&')); return `<a href="${esc(u)}"${/^https?:/i.test(u) ? ' target="_blank" rel="noopener"' : ''}>${txt}</a>`; });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>').replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

const ALERT: Record<string, [string, string]> = {
  NOTE: ['note', 'Lưu ý'], TIP: ['tip', 'Mẹo'], IMPORTANT: ['important', 'Quan trọng'], WARNING: ['warning', 'Cảnh báo'], CAUTION: ['caution', 'Không được làm'],
};

/** Render Markdown → HTML. taskPrefix: tiền tố id cho ô checklist (để lưu tiến độ). */
export function renderMd(md: string, taskPrefix = 't'): { html: string; tasks: number } {
  const L = (md || '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0, task = 0;
  const isTable = (a: string, b?: string) => /^\s*\|.*\|\s*$/.test(a) && !!b && /^\s*\|?\s*:?-{2,}/.test(b);
  const cells = (r: string) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

  function list(indent: number): string {
    const items: string[] = [];
    let ordered: boolean | null = null, hasTask = false;
    while (i < L.length) {
      const m = L[i].match(/^(\s*)([-*]|\d+[.)])\s+(.*)$/);
      if (!m) break;
      const ind = m[1].replace(/\t/g, '  ').length;
      if (ind < indent) break;
      if (ind > indent) { if (items.length) { items[items.length - 1] = items[items.length - 1].replace(/<\/li>$/, list(ind) + '</li>'); continue; } }
      if (ordered === null) ordered = /\d/.test(m[2]);
      let body = m[3];
      i++;
      // dòng nối tiếp (thụt lề, không phải mục mới)
      while (i < L.length && /^\s{2,}\S/.test(L[i]) && !/^\s*([-*]|\d+[.)])\s+/.test(L[i])) { body += ' ' + L[i].trim(); i++; }
      const tk = body.match(/^\[( |x|X)\]\s+(.*)$/);
      if (tk) { hasTask = true; const id = `${taskPrefix}-${task++}`; items.push(`<li class="g-task"><label><input type="checkbox" data-task="${id}"${tk[1] !== ' ' ? ' checked' : ''}><span>${inline(tk[2])}</span></label></li>`); }
      else items.push(`<li>${inline(body)}</li>`);
    }
    const tag = ordered ? 'ol' : 'ul';
    return `<${tag}${hasTask ? ' class="g-tasks"' : ''}>${items.join('')}</${tag}>`;
  }

  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    if (/^```/.test(l)) { const buf: string[] = []; i++; while (i < L.length && !/^```/.test(L[i])) buf.push(L[i++]); i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue; }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) { const lv = Math.min(4, h[1].length + 1); out.push(`<h${lv}>${inline(h[2])}</h${lv}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (isTable(l, L[i + 1])) {
      const head = cells(l); i += 2; const rows: string[][] = [];
      while (i < L.length && /^\s*\|.*\|\s*$/.test(L[i])) rows.push(cells(L[i++]));
      out.push(`<div class="g-tw"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*>/.test(l)) {
      const buf: string[] = [];
      while (i < L.length && /^\s*>/.test(L[i])) buf.push(L[i++].replace(/^\s*>\s?/, ''));
      const a = buf[0]?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
      if (a) { const [cls, lab] = ALERT[a[1].toUpperCase()]; const rest = [a[2], ...buf.slice(1)].filter((x, k) => k > 0 || x).join('\n');
        out.push(`<div class="g-alert g-${cls}"><div class="g-alert-t">${lab}</div>${renderMd(rest, taskPrefix + 'q' + i).html}</div>`); }
      else out.push(`<blockquote>${renderMd(buf.join('\n'), taskPrefix + 'q' + i).html}</blockquote>`);
      continue;
    }
    if (/^\s*([-*]|\d+[.)])\s+/.test(l)) { out.push(list(l.match(/^(\s*)/)![1].length)); continue; }
    if (/^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(l)) { const m = l.match(/!\[([^\]]*)\]/)!; out.push(`<figure>${inline(l.trim())}${m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : ''}</figure>`); i++; continue; }
    const buf: string[] = [];
    while (i < L.length && L[i].trim() && !/^(#{1,4}\s|```|\s*>|\s*([-*]|\d+[.)])\s+|\s*(-{3,}|\*{3,})\s*$)/.test(L[i]) && !isTable(L[i], L[i + 1])) buf.push(L[i++].trim());
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return { html: out.join('\n'), tasks: task };
}
