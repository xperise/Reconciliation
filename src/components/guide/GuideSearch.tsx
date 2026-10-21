'use client';
// Ô tìm kiếm thông minh: kết quả hiện ngay bên dưới (không đè lên trang), tối đa 5 đoạn tốt nhất + "xem thêm".
// Tìm tới từng bước / câu hỏi / dòng tra lỗi; bấm kết quả → mở đúng mục trong hướng dẫn theo vai trò, tô sáng từ khoá.
import { useMemo, useState } from 'react';
import type { Guide } from '@/lib/guide/meta';
import type { Journey } from '@/lib/guide/journey';
import { renderMd } from '@/lib/guide/md';
import { buildIndex, search, snippet, type Chunk, type Hit } from '@/lib/guide/search';

type LibG = Pick<Guide, 'slug' | 'title' | 'sections'>;
const KIND: Record<Chunk['kind'], [string, string]> = { symptom: ['ri-alarm-warning-line', 'Sự cố'], faq: ['ri-question-line', 'Hỏi đáp'], step: ['ri-footprint-line', 'Bước'], part: ['ri-file-text-line', 'Mục'] };
const HL_SKIP = new Set(['khong', 'duoc', 'khong duoc', 'khong the', 'bi', 'co', 'cho', 'sao', 'lam']);
const hl = (t: string[]) => t.filter((w) => w.length > 1 && !HL_SKIP.has(w));

/** link tới đúng mục trong hướng dẫn theo vai trò, kèm từ khoá để tô sáng */
export function chunkURL(c: { g: string; s: string; head?: string }, terms: string[]) {
  const qs = new URLSearchParams({ t: hl(terms).join(','), ...(c.head ? { h: c.head } : {}) }).toString();
  return `/huong-dan/${c.g}?${qs}#s-${c.s}`;
}

export default function GuideSearch({ lib, journey, placeholder, compact }: { lib: Record<string, LibG>; journey?: Journey; placeholder?: string; compact?: boolean }) {
  const idx = useMemo(() => buildIndex(lib, journey, journey?.sources), [lib, journey]);
  const [q, setQ] = useState(''), [more, setMore] = useState(false), [sel, setSel] = useState(0);
  const [ai, setAi] = useState<{ q: string; loading?: boolean; answer?: string; err?: string; sources?: { n: number; g: string; s: string; title: string; head: string; terms: string[] }[] } | null>(null);
  const qq = q.trim();
  const hits: Hit[] = useMemo(() => (qq.length >= 2 ? search(idx, qq, 12) : []), [idx, qq]);
  const quick = hits.slice(0, 3).find((h) => h.c.kind === 'symptom' && h.c.sym);
  const list = hits.filter((h) => h !== quick), shown = more ? list : list.slice(0, 5);
  const symURL = (h: Hit) => { const m = (h.c.sym?.link || '').match(/\/huong-dan\/([^#?]+)#s-(.+)$/); return m ? chunkURL({ g: m[1], s: m[2] }, h.terms) : chunkURL(h.c, h.terms); };
  async function ask() {
    if (qq.length < 3) return;
    setAi({ q: qq, loading: true });
    try { const r = await fetch('/api/guides/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: qq }) }); const j = await r.json(); setAi(r.ok ? { q: qq, ...j } : { q: qq, err: j.error || 'Không hỏi được trợ lý' }); }
    catch (e) { setAi({ q: qq, err: e instanceof Error ? e.message : String(e) }); }
  }
  const aiHtml = useMemo(() => {
    if (!ai?.answer) return '';
    let h = renderMd(ai.answer, 'ai').html;
    (ai.sources || []).forEach((s) => { h = h.split(`[${s.n}]`).join(`<a class="hs-cite" href="${chunkURL(s, s.terms).replace(/"/g, '&quot;')}" title="${(s.title + (s.head ? ' › ' + s.head : '')).replace(/"/g, '&quot;')}">${s.n}</a>`); });
    return h;
  }, [ai]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(shown.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (e.metaKey || e.ctrlKey) ask(); else if (shown[sel]) location.href = chunkURL(shown[sel].c, shown[sel].terms); else if (quick) location.href = symURL(quick); }
    else if (e.key === 'Escape') { setQ(''); setAi(null); }
  };

  return (
    <div className={`hs${compact ? ' hs-compact' : ''}`}>
      <div className="hs-in">
        <i className="ri-search-line" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setAi(null); setMore(false); setSel(0); }} onKeyDown={onKey}
          placeholder={placeholder || 'Mô tả vấn đề, ví dụ: khách không gán được thẻ · quên PIN · tài xế đổi biển số'} aria-label="Tìm trong hướng dẫn" />
        {q && <button className="hs-x" onClick={() => { setQ(''); setAi(null); }} aria-label="Xoá" title="Xoá (Esc)"><i className="ri-close-line" /></button>}
        <button className="hs-ai" disabled={qq.length < 3} onClick={ask} title="Hỏi trợ lý AI (Ctrl + Enter)"><i className="ri-sparkling-2-line" /> Hỏi trợ lý</button>
      </div>
      {qq.length >= 2 && (
        <div className="hs-res">
          {ai && <div className="hs-aibox">
            <div className="hs-aih"><i className="ri-sparkling-2-fill" /> Trợ lý trả lời</div>
            {ai.loading ? <div className="hd-muted">Đang đọc các mục liên quan…</div> : ai.err ? <div className="hd-err">{ai.err}</div> : <div className="hd-md hs-aimd" dangerouslySetInnerHTML={{ __html: aiHtml }} />}
            {!!ai.sources?.length && !ai.loading && <div className="hd-muted" style={{ fontSize: 11.5, marginTop: 6 }}>Bấm số để mở đúng đoạn hướng dẫn. Kiểm tra lại trước khi làm thao tác quan trọng.</div>}
          </div>}
          {quick && quick.c.sym && <a className="hs-quick" href={symURL(quick)}>
            <div className="hs-qh"><i className="ri-alarm-warning-line" /> Có thể là: <b>{quick.c.sym.symptom}</b></div>
            <div className="hs-qg"><span>Nguyên nhân</span><div>{quick.c.sym.cause}</div><span>Cách xử lý</span><div><b>{quick.c.sym.fix}</b></div></div>
            <div className="hs-qgo">Xem hướng dẫn chi tiết →</div>
          </a>}
          {!hits.length && <div className="hd-muted" style={{ padding: '10px 4px' }}>Không thấy mục nào khớp. Thử từ khác, hoặc bấm <b>Hỏi trợ lý</b>.</div>}
          {shown.map((h, i) => { const [ic, lab] = KIND[h.c.kind]; return (
            <a key={h.c.id} className="hs-hit" data-on={i === sel} href={chunkURL(h.c, h.terms)} onMouseEnter={() => setSel(i)}>
              <span className={`hs-k hs-k-${h.c.kind}`}><i className={ic} /></span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <b>{h.c.kind === 'symptom' ? h.c.head : h.c.title}{h.c.head && h.c.kind !== 'symptom' ? <span className="hs-sub"> › {h.c.head}</span> : null}</b>
                <span className="hs-bc">{lab} · {h.c.guide}{h.c.at ? ` · Chặng ${h.c.at.k + 1} ${h.c.at.stage}` : ''}</span>
                <span className="hs-sn" dangerouslySetInnerHTML={{ __html: snippet(h.c.text, hl(h.terms), 150) }} />
              </span>
            </a>); })}
          {list.length > 5 && <button className="hs-more" onClick={() => setMore(!more)}>{more ? 'Thu gọn' : `Xem thêm ${list.length - 5} kết quả`}</button>}
        </div>
      )}
    </div>
  );
}
