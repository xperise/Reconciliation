'use client';
// Tab Hướng dẫn — danh sách theo mảng dịch vụ × đối tượng, tìm kiếm toàn văn, chọn nhiều bài để xuất 1 bộ PDF
import './guide.css';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AUDIENCES, SERVICES, audienceLabel, type Guide } from '@/lib/guide/meta';
import ImportBundle from './ImportBundle';
import GuideNav from './GuideNav';

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
export const audPill = (a: string) => (a === 'internal' ? 'hd-pill-int' : a === 'khach-hang' ? 'hd-pill-kh' : a === 'tai-xe' ? 'hd-pill-tx' : 'hd-pill-dv');
const plain = (md: string) => md.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`|[\]-]+/g, ' ').replace(/\s+/g, ' ');

export default function GuideHome({ guides, canEdit, error, journeySlug }: { guides: Guide[]; canEdit: boolean; error?: string; journeySlug?: string | null }) {
  const [svc, setSvc] = useState('');
  const [aud, setAud] = useState('');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string[]>([]);

  const idx = useMemo(() => guides.map((g) => ({ g, text: plain(g.sections.map((s) => s.title + ' ' + s.md).join(' ')), ft: fold(g.title + ' ' + (g.summary || '') + ' ' + g.sections.map((s) => s.title + ' ' + s.md).join(' ')) })), [guides]);
  const fq = fold(q.trim());
  const shown = idx.filter(({ g, ft }) => (!svc || g.service === svc) && (!aud || g.audience === aud) && (!fq || fq.split(/\s+/).every((w) => ft.includes(w))));
  const snip = (text: string) => {
    if (!fq) return '';
    const w = fq.split(/\s+/)[0], ft = fold(text), at = ft.indexOf(w);
    if (at < 0) return '';
    const a = Math.max(0, at - 60), b = Math.min(text.length, at + w.length + 90);
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return (a ? '…' : '') + esc(text.slice(a, at)) + '<mark>' + esc(text.slice(at, at + w.length)) + '</mark>' + esc(text.slice(at + w.length, b)) + (b < text.length ? '…' : '');
  };
  const toggle = (slug: string) => setPick((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]));
  const count = (k: string, v: string) => idx.filter(({ g }) => (k === 's' ? g.service === v && (!aud || g.audience === aud) : g.audience === v && (!svc || g.service === svc))).length;

  return (
    <div className="hd"><div className="hd-wrap">
      <div style={{ marginBottom: 14 }}><GuideNav on="library" journeySlug={journeySlug} /></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16, justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div className="hd-eyebrow">Theo vai trò</div>
          <h1 style={{ margin: '4px 0 2px', fontSize: 22 }}>Hướng dẫn đầy đủ cho từng vai trò</h1>
          <div className="hd-muted">Theo từng mảng dịch vụ, cho Internal, Khách hàng, Đơn vị và Tài xế. Xem và làm theo trên web; tải tài liệu đính kèm để gửi cho khách khi cần.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && <ImportBundle />}
          {canEdit && <Link className="hd-btn hd-btn-pri" href="/huong-dan/moi"><i className="ri-add-line" /> Tạo hướng dẫn</Link>}
        </div>
      </div>
      {error && <div className="hd-err" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="hd-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input className="hd-input" placeholder="Tìm trong toàn bộ hướng dẫn: tên bước, menu, lỗi… (ví dụ: gán thẻ, cost center, verify)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="hd-chips"><span className="hd-muted" style={{ alignSelf: 'center', minWidth: 70 }}>Mảng</span>
          <button className="hd-chip" data-on={!svc} onClick={() => setSvc('')}>Tất cả</button>
          {SERVICES.map(([k, l]) => <button key={k} className="hd-chip" data-on={svc === k} onClick={() => setSvc(svc === k ? '' : k)}>{l} · {count('s', k)}</button>)}
        </div>
        <div className="hd-chips"><span className="hd-muted" style={{ alignSelf: 'center', minWidth: 70 }}>Đối tượng</span>
          <button className="hd-chip" data-on={!aud} onClick={() => setAud('')}>Tất cả</button>
          {AUDIENCES.map(([k, l]) => <button key={k} className="hd-chip" data-on={aud === k} onClick={() => setAud(aud === k ? '' : k)}>{l} · {count('a', k)}</button>)}
        </div>
      </div>

      {!shown.length && <div className="hd-card" style={{ padding: 24, marginTop: 16, textAlign: 'center' }} ><span className="hd-muted">{guides.length ? 'Không có hướng dẫn khớp bộ lọc.' : 'Chưa có hướng dẫn nào.'}</span></div>}
      {SERVICES.map(([sk, sl]) => {
        const rows = shown.filter(({ g }) => g.service === sk);
        if (!rows.length) return null;
        return (
          <section key={sk}>
            <div className="hd-group-t"><h2>{sl}</h2><span className="hd-muted">{rows.length} hướng dẫn</span></div>
            <div className="hd-grid">
              {rows.map(({ g, text }) => {
                const sn = snip(text);
                return (
                  <Link key={g.id} href={`/huong-dan/${g.slug}`} className="hd-card hd-item">
                    <input type="checkbox" className="hd-pick" title="Chọn để xuất chung 1 file PDF" checked={pick.includes(g.slug)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(g.slug)} />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingRight: 24 }}>
                      <span className={`hd-pill ${audPill(g.audience)}`}>{audienceLabel(g.audience)}</span>
                      {g.status !== 'phat-hanh' && <span className="hd-pill hd-pill-draft">Nháp</span>}
                      <span className="hd-pill">v{g.version}</span>
                      {!!g.files?.length && <span className="hd-pill" style={{ background: 'var(--hd-neg-soft)', color: 'var(--hd-neg)' }}><i className="ri-attachment-2" style={{ marginRight: 3 }} />{g.files.length} tệp</span>}
                    </div>
                    <h3>{g.title}</h3>
                    {g.summary && <p>{g.summary}</p>}
                    {sn && <div className="hd-snip" dangerouslySetInnerHTML={{ __html: sn }} />}
                    <div className="hd-muted" style={{ marginTop: 'auto', fontSize: 11.5 }}>{g.sections.length} mục · cập nhật {new Date(g.updated_at).toLocaleDateString('vi-VN')}{g.owner ? ` · ${g.owner}` : ''}</div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
      {pick.length > 0 && (
        <div className="hd-bar">
          <b>Đã chọn {pick.length} hướng dẫn</b><span style={{ opacity: .7, fontSize: 12.5 }}>xuất chung 1 file PDF theo thứ tự đã chọn</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="hd-btn hd-btn-sm" onClick={() => setPick([])}>Bỏ chọn</button>
            <a className="hd-btn hd-btn-sm hd-btn-pri" href={`/in-huong-dan?s=${pick.map(encodeURIComponent).join(',')}`} target="_blank" rel="noopener">Xuất PDF</a>
          </span>
        </div>
      )}
    </div></div>
  );
}
