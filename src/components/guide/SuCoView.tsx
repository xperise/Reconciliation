'use client';
// Sự cố thường gặp: bảng tra theo triệu chứng, lọc theo vai trò; "Mở mục" nhảy thẳng vào đúng bước của hành trình
import './guide.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderMd } from '@/lib/guide/md';
import type { Journey } from '@/lib/guide/journey';
import GuideNav from './GuideNav';

export default function SuCoView({ md, journeySlug, journey }: { md: string; journeySlug: string; journey: Journey }) {
  const box = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMd(md, 'suco').html, [md]);
  const [who, setWho] = useState(''), [q, setQ] = useState(''), [opts, setOpts] = useState<string[]>([]), [n, setN] = useState([0, 0]);
  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

  useEffect(() => {
    const el = box.current; if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    setOpts([...new Set(rows.map((r) => r.cells[0]?.textContent?.trim() || '').filter(Boolean))]);
    // link "Mở mục" → bước tương ứng trong hành trình
    el.querySelectorAll<HTMLAnchorElement>('a[href*="#s-"]').forEach((a) => {
      const m = (a.getAttribute('href') || '').match(/\/huong-dan\/([^#?]+)#s-(.+)$/); if (!m) return;
      for (let k = 0; k < journey.stages.length; k++) { const p = journey.stages[k].steps.findIndex((x) => x.g === m[1] && x.s === m[2]); if (p >= 0) { a.href = `/huong-dan/${journeySlug}#${journey.stages[k].id}/${p + 1}`; a.textContent = `Chặng ${k + 1} · bước ${p + 1} →`; return; } }
    });
  }, [html, journey, journeySlug]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLTableRowElement>('tbody tr')); const fq = fold(q.trim()); let k = 0;
    rows.forEach((r) => { const ok = (!who || r.cells[0]?.textContent?.trim() === who) && (!fq || fold(r.textContent || '').includes(fq)); r.style.display = ok ? '' : 'none'; if (ok) k++; });
    setN([k, rows.length]);
  }, [who, q, html]);

  return (
    <div className="hd"><div className="hd-wrap">
      <div style={{ marginBottom: 14 }}><GuideNav on="suco" journeySlug={journeySlug} /></div>
      <section className="hh-hero" style={{ background: 'radial-gradient(800px 260px at 100% -30%, #ff8a5b 0%, transparent 60%), linear-gradient(115deg, #e83c3f 0%, #c2185b 55%, #8a2fd0 100%)' }}>
        <div className="hd-eyebrow" style={{ color: '#ffffffcc', position: 'relative' }}>Tra cứu</div>
        <h1>Sự cố thường gặp</h1>
        <p>Tìm theo triệu chứng khách, tài xế hoặc tổng đài báo. Đọc nguyên nhân, cách xử lý, rồi bấm để mở đúng bước hướng dẫn.</p>
        <div className="hh-search"><i className="ri-search-line" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ví dụ: không gán được thẻ, PIN, hết hạn mức, không có xe…" /></div>
      </section>
      <div className="hd-card" style={{ padding: 14 }}>
        <div className="hd-chips" style={{ marginBottom: 10, alignItems: 'center' }}>
          <span className="hd-muted" style={{ marginRight: 4 }}>Ai gặp</span>
          <button className="hd-chip" data-on={!who} onClick={() => setWho('')}>Tất cả</button>
          {opts.map((o) => <button key={o} className="hd-chip" data-on={who === o} onClick={() => setWho(o)}>{o}</button>)}
          <span className="hd-muted" style={{ marginLeft: 'auto' }}>{n[0]}/{n[1]} tình huống</span>
        </div>
        <div ref={box} className="hd-md" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div></div>
  );
}
