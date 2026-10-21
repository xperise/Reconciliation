'use client';
// Ô tìm kiếm thông minh: tìm tới từng bước / câu hỏi / dòng tra lỗi, gợi ý câu trả lời nhanh, hỏi trợ lý AI có dẫn nguồn
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Guide } from '@/lib/guide/meta';
import type { Journey } from '@/lib/guide/journey';
import { renderMd } from '@/lib/guide/md';
import { buildIndex, search, snippet, type Chunk, type Hit } from '@/lib/guide/search';

type LibG = Pick<Guide, 'slug' | 'title' | 'sections'>;
const KIND: Record<Chunk['kind'], [string, string]> = { symptom: ['ri-alarm-warning-line', 'Sự cố'], faq: ['ri-question-line', 'Hỏi đáp'], step: ['ri-footprint-line', 'Bước'], part: ['ri-file-text-line', 'Mục'] };
const SUGGEST = ['Khách không gán được thẻ', 'Quên mã PIN', 'Nạp tiền cho thẻ', 'Tài xế đổi biển số', 'Huỷ chuyến', 'Thẻ hết hạn mức', 'Nhân viên nghỉ việc'];

const HL_SKIP = new Set(['khong', 'duoc', 'khong duoc', 'khong the', 'bi', 'co', 'cho', 'sao', 'lam']);
export function chunkURL(c: { g: string; s: string; head?: string; at?: Chunk['at'] | null }, terms: string[], journeySlug?: string | null, J?: Journey) {
  const qs = new URLSearchParams({ t: terms.filter((w) => w.length > 1 && !HL_SKIP.has(w)).join(','), ...(c.head ? { h: c.head } : {}) }).toString();
  if (c.at && journeySlug && J) return `/huong-dan/${journeySlug}?${qs}#${J.stages[c.at.k].id}/${c.at.p + 1}`;
  return `/huong-dan/${c.g}?${qs}#s-${c.s}`;
}

export default function GuideSearch({ lib, journey, journeySlug, variant = 'hero', placeholder }: { lib: Record<string, LibG>; journey?: Journey; journeySlug?: string | null; variant?: 'hero' | 'bar'; placeholder?: string }) {
  const idx = useMemo(() => buildIndex(lib, journey, journey?.sources), [lib, journey]);
  const [q, setQ] = useState(''), [open, setOpen] = useState(false), [sel, setSel] = useState(0);
  const [ai, setAi] = useState<{ q: string; loading?: boolean; answer?: string; err?: string; sources?: { n: number; g: string; s: string; title: string; head: string; guide: string; at: Chunk['at'] | null; terms: string[] }[] } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const hits: Hit[] = useMemo(() => (q.trim().length >= 2 ? search(idx, q, 10) : []), [idx, q]);
  const top = hits[0];
  const quick = top && top.c.kind === 'symptom' && top.c.sym ? top : hits.find((h, i) => i < 3 && h.c.kind === 'symptom' && h.c.sym);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { const f = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  const url = (h: Hit) => chunkURL(h.c, h.terms, journeySlug, journey);
  const symLink = (h: Hit) => { const m = (h.c.sym?.link || '').match(/\/huong-dan\/([^#?]+)#s-(.+)$/); if (!m) return url(h); const c = idx.find((x) => x.g === m[1] && x.s === m[2]); return chunkURL({ g: m[1], s: m[2], at: c?.at }, h.terms, journeySlug, journey); };
  async function ask() {
    const qq = q.trim(); if (qq.length < 3) return;
    setAi({ q: qq, loading: true });
    try { const r = await fetch('/api/guides/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: qq }) }); const j = await r.json(); setAi(r.ok ? { q: qq, ...j } : { q: qq, err: j.error || 'Không hỏi được trợ lý' }); }
    catch (e) { setAi({ q: qq, err: e instanceof Error ? e.message : String(e) }); }
  }
  const aiHtml = useMemo(() => {
    if (!ai?.answer) return '';
    let h = renderMd(ai.answer, 'ai').html;
    (ai.sources || []).forEach((s) => { h = h.replaceAll(`[${s.n}]`, `<a class="hs-cite" href="${chunkURL(s, s.terms, journeySlug, journey).replace(/"/g, '&quot;')}" title="${(s.title + (s.head ? ' › ' + s.head : '')).replace(/"/g, '&quot;')}">${s.n}</a>`); });
    return h;
  }, [ai, journeySlug, journey]);
  const go = (h?: Hit) => { if (h) location.href = url(h); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setSel((s) => Math.min(hits.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (e.metaKey || e.ctrlKey || !hits.length) ask(); else go(hits[sel]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  const stageTag = (c: Chunk) => c.at && journey ? <span className="hj-badge" style={{ ['--rc' as string]: c.at.color }}>Chặng {c.at.k + 1} · {c.at.stage}</span> : null;

  return (
    <div className={`hs hs-${variant}`} ref={box}>
      <div className="hs-in">
        <i className="ri-search-line" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setAi(null); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          placeholder={placeholder || 'Mô tả vấn đề: “khách không gán được thẻ”, “quên PIN”, “tài xế đổi biển số”…'} aria-label="Tìm trong hướng dẫn" />
        {q && <button className="hs-x" onClick={() => { setQ(''); setAi(null); }} aria-label="Xoá"><i className="ri-close-line" /></button>}
        <button className="hs-ai" disabled={q.trim().length < 3} onClick={() => { setOpen(true); ask(); }} title="Hỏi trợ lý AI (Ctrl + Enter)"><i className="ri-sparkling-2-line" /> Hỏi trợ lý</button>
      </div>
      {open && (q.trim().length >= 2 || !q) && (
        <div className="hs-pop">
          {!q && <div className="hs-sug"><span className="hd-muted">Hay được tìm:</span>{SUGGEST.map((x) => <button key={x} className="hd-chip" onClick={() => setQ(x)}>{x}</button>)}</div>}
          {ai && <div className="hs-aibox">
            <div className="hs-aih"><i className="ri-sparkling-2-fill" /> Trợ lý trả lời: <span className="hd-muted">“{ai.q}”</span></div>
            {ai.loading ? <div className="hd-muted" style={{ padding: '6px 0' }}>Đang đọc các mục liên quan…</div> : ai.err ? <div className="hd-err">{ai.err}</div> : <div className="hd-md hs-aimd" dangerouslySetInnerHTML={{ __html: aiHtml }} />}
            {!!ai.sources?.length && !ai.loading && <div className="hd-muted" style={{ fontSize: 11.5, marginTop: 6 }}>Trả lời dựa trên các mục hướng dẫn được dẫn số — bấm số để mở đúng đoạn. Kiểm tra lại với hướng dẫn trước khi làm thao tác quan trọng.</div>}
          </div>}
          {quick && quick.c.sym && <a className="hs-quick" href={symLink(quick)}>
            <div className="hs-qh"><i className="ri-alarm-warning-line" /> Có thể là sự cố: <b>{quick.c.sym.symptom}</b>{quick.c.sym.who && <span className="hd-pill">{quick.c.sym.who}</span>}</div>
            <div className="hs-qg"><span>Nguyên nhân</span><div>{quick.c.sym.cause}</div><span>Cách xử lý</span><div><b>{quick.c.sym.fix}</b></div></div>
            <div className="hs-qgo">Mở hướng dẫn chi tiết →</div>
          </a>}
          {q.trim().length >= 2 && !hits.length && <div className="hd-muted" style={{ padding: 14 }}>Không thấy đoạn nào khớp. Thử từ khác, hoặc bấm <b>Hỏi trợ lý</b>.</div>}
          {hits.filter((h) => h !== quick).map((h, i) => { const [ic, lab] = KIND[h.c.kind]; const on = hits.indexOf(h) === sel; return (
            <a key={h.c.id} className="hs-hit" data-on={on} href={url(h)} onMouseEnter={() => setSel(hits.indexOf(h))}>
              <span className={`hs-k hs-k-${h.c.kind}`}><i className={ic} /></span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="hs-bc">{lab} · {h.c.guide}{h.c.group ? ` · ${h.c.group}` : ''} {stageTag(h.c)}</span>
                <b>{h.c.title}{h.c.head && h.c.kind !== 'symptom' ? <span className="hs-sub"> › {h.c.head}</span> : h.c.kind === 'symptom' ? <span className="hs-sub"> › {h.c.head}</span> : null}</b>
                <span className="hs-sn" dangerouslySetInnerHTML={{ __html: snippet(h.c.text, h.terms.filter((w) => !HL_SKIP.has(w))) }} />
              </span>
              {i < 9 && on && <span className="hs-enter">Enter ↵</span>}
            </a>); })}
          {q.trim().length >= 2 && <div className="hs-foot"><span>↑↓ chọn · Enter mở · Ctrl+Enter hỏi trợ lý</span><span>{hits.length} đoạn khớp</span></div>}
        </div>
      )}
    </div>
  );
}
