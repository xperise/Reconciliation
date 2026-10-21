'use client';
// Sự cố thường gặp: bảng tra theo triệu chứng, lọc theo người gặp + tìm thông minh; mở đúng mục hướng dẫn
import './guide.css';
import { useMemo, useState } from 'react';
import { buildIndex, fold, search } from '@/lib/guide/search';
import { chunkURL } from './GuideSearch';
import GuideNav from './GuideNav';

type Row = { who: string; symptom: string; cause: string; fix: string; g?: string; s?: string };
const strip = (x: string) => x.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').trim();

export default function SuCoView({ md, journeySlug }: { md: string; journeySlug: string }) {
  const rows: Row[] = useMemo(() => {
    const L = md.split('\n').filter((l) => /^\|.*\|$/.test(l.trim())); if (L.length < 3) return [];
    const H = L[0].split('|').map((x) => fold(x).trim()), ix = (k: string) => H.findIndex((h) => h.includes(k));
    return L.slice(2).map((l) => { const c = l.split('|').map((x) => x.trim()), m = l.match(/\]\(\/huong-dan\/([^#?)]+)#s-([^)]+)\)/);
      return { who: strip(c[ix('ai gap')] || ''), symptom: strip(c[ix('trieu chung')] || ''), cause: strip(c[ix('nguyen nhan')] || ''), fix: strip(c[ix('cach xu ly')] || ''), g: m?.[1], s: m?.[2] }; });
  }, [md]);
  const idx = useMemo(() => buildIndex({ x: { slug: 'x', title: 'Sự cố', sections: [{ id: 'm', title: 'Sự cố', md }] } }), [md]);
  const [who, setWho] = useState(''), [q, setQ] = useState('');
  const opts = useMemo(() => [...new Set(rows.map((r) => r.who).filter(Boolean))], [rows]);
  const qq = q.trim();
  // có từ khoá: xếp theo độ khớp (hiểu đồng nghĩa, không dấu, sai chính tả); không có: giữ thứ tự gốc
  const shown = useMemo(() => {
    const base = rows.filter((r) => !who || r.who === who);
    if (qq.length < 2) return base.map((r) => ({ r, terms: [] as string[] }));
    const hits = search(idx, qq, 50);
    return hits.map((h) => ({ r: base.find((r) => r.symptom === h.c.sym?.symptom), terms: h.terms })).filter((x): x is { r: Row; terms: string[] } => !!x.r);
  }, [rows, who, qq, idx]);
  const mark = (t: string, terms: string[]) => {
    if (!terms.length) return t;
    const f = fold(t); const R: [number, number][] = [];
    terms.filter((w) => w.length > 1 && !['khong', 'duoc', 'bi', 'co'].includes(w)).forEach((w) => { let i = -1; while ((i = f.indexOf(w, i + 1)) >= 0) R.push([i, i + w.length]); });
    if (!R.length) return t; R.sort((a, b) => a[0] - b[0]); const out: (string | JSX.Element)[] = []; let at = 0;
    R.forEach(([a, b], k) => { if (a < at) return; out.push(t.slice(at, a), <mark key={k}>{t.slice(a, b)}</mark>); at = b; }); out.push(t.slice(at)); return out;
  };

  return (
    <div className="hd"><div className="hd-wrap">
      <div style={{ marginBottom: 14 }}><GuideNav on="suco" journeySlug={journeySlug} /></div>
      <section className="hh-hero" style={{ background: 'radial-gradient(800px 260px at 100% -30%, #ff8a5b 0%, transparent 60%), linear-gradient(115deg, #e83c3f 0%, #c2185b 55%, #8a2fd0 100%)' }}>
        <div className="hd-eyebrow" style={{ color: '#ffffffcc', position: 'relative' }}>Tra cứu</div>
        <h1>Sự cố thường gặp</h1>
        <p>Gõ triệu chứng khách, tài xế hoặc tổng đài báo — bảng lọc ngay. Đọc nguyên nhân, cách xử lý, rồi bấm để mở đúng mục hướng dẫn.</p>
        <div className="hs" style={{ marginTop: 16, maxWidth: 720 }}><div className="hs-in"><i className="ri-search-line" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ví dụ: không gán được thẻ · PIN sai · hết hạn mức · không có xe" aria-label="Tìm sự cố" />
          {q && <button className="hs-x" onClick={() => setQ('')} aria-label="Xoá"><i className="ri-close-line" /></button>}</div></div>
      </section>
      <div className="hd-card" style={{ padding: 14 }}>
        <div className="hd-chips" style={{ marginBottom: 10, alignItems: 'center' }}>
          <span className="hd-muted" style={{ marginRight: 4 }}>Ai gặp</span>
          <button className="hd-chip" data-on={!who} onClick={() => setWho('')}>Tất cả</button>
          {opts.map((o) => <button key={o} className="hd-chip" data-on={who === o} onClick={() => setWho(o)}>{o}</button>)}
          <span className="hd-muted" style={{ marginLeft: 'auto' }}>{shown.length}/{rows.length} tình huống</span>
        </div>
        <div className="hd-md"><div className="g-tw"><table><thead><tr><th>Ai gặp</th><th>Triệu chứng</th><th>Nguyên nhân</th><th>Cách xử lý</th><th /></tr></thead><tbody>
          {shown.map(({ r, terms }, i) => <tr key={i}>
            <td><span className="hd-pill">{r.who}</span></td><td><b>{mark(r.symptom, terms)}</b></td><td>{mark(r.cause, terms)}</td><td>{mark(r.fix, terms)}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{r.g && r.s && <a href={chunkURL({ g: r.g, s: r.s }, terms)}>Xem hướng dẫn →</a>}</td>
          </tr>)}
          {!shown.length && <tr><td colSpan={5} className="hd-muted">Không có tình huống khớp. Thử từ khác hoặc dùng ô tìm kiếm ở trang Tổng quan để tìm trong toàn bộ hướng dẫn.</td></tr>}
        </tbody></table></div></div>
      </div>
    </div></div>
  );
}
