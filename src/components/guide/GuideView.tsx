'use client';
// Tab Hướng dẫn — trang xem: mục lục, nội dung, checklist có lưu tiến độ, xuất PDF, chuyển sang chế độ sửa
import './guide.css';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderMd } from '@/lib/guide/md';
import { audienceLabel, hasOwnNumber, serviceLabel, statusLabel, type Guide } from '@/lib/guide/meta';
import FilesBox from './FilesBox';
import { audPill } from './GuideHome';
import GuideEditor from './GuideEditor';

export default function GuideView({ guide, canEdit, userId, startEdit }: { guide: Guide; canEdit: boolean; userId: string; startEdit?: boolean }) {
  const [edit, setEdit] = useState(!!startEdit && canEdit);
  const [on, setOn] = useState(guide.sections[0]?.id || '');
  const box = useRef<HTMLDivElement>(null);
  const key = `hd:${userId}:${guide.slug}`;
  const R = useMemo(() => guide.sections.map((s, i) => ({ ...s, ...renderMd(s.md, `${s.id}-${i}`) })), [guide]);
  const total = R.reduce((a, s) => a + s.tasks, 0);
  const [done, setDone] = useState(0);
  const [lb, setLb] = useState<{ src: string; alt: string } | null>(null);
  const X = guide.extras || {};
  const num = (t: string, i: number) => (hasOwnNumber(t) ? '' : `${i + 1}. `);
  const go = (id: string) => { const el = document.getElementById(`s-${id}`); if (el) { el.scrollIntoView({ behavior: 'smooth' }); history.replaceState(null, '', `#s-${id}`); } };

  // tiến độ checklist: lưu theo người dùng + hướng dẫn trên trình duyệt này
  useEffect(() => {
    const el = box.current; if (!el || edit) return;
    let saved: Record<string, boolean> = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* bỏ qua */ }
    const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('input[data-task]'));
    inputs.forEach((i) => { if (i.dataset.task! in saved) i.checked = saved[i.dataset.task!]; });
    const upd = () => setDone(inputs.filter((i) => i.checked).length);
    upd();
    const on = (e: Event) => { const t = e.target as HTMLInputElement; if (!t.dataset?.task) return; saved[t.dataset.task] = t.checked; try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* đầy bộ nhớ */ } upd(); };
    el.addEventListener('change', on);
    return () => el.removeEventListener('change', on);
  }, [key, edit, R]);
  const reset = () => { try { localStorage.removeItem(key); } catch { /* */ } box.current?.querySelectorAll<HTMLInputElement>('input[data-task]').forEach((i) => { i.checked = i.defaultChecked; }); setDone(box.current?.querySelectorAll('input[data-task]:checked').length || 0); };

  // bấm ảnh → xem phóng to
  useEffect(() => {
    const el = box.current; if (!el || edit) return;
    const on = (e: MouseEvent) => { const t = e.target as HTMLElement; if (t.tagName === 'IMG' && t.closest('.hd-md')) { const i = t as HTMLImageElement; setLb({ src: i.src, alt: i.alt }); } };
    el.addEventListener('click', on);
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setLb(null); };
    window.addEventListener('keydown', k);
    return () => { el.removeEventListener('click', on); window.removeEventListener('keydown', k); };
  }, [edit]);

  // mục đang đọc (tô trong mục lục)
  useEffect(() => {
    if (edit) return;
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setOn(v.target.id.replace(/^s-/, '')); }, { rootMargin: '-80px 0px -65% 0px' });
    document.querySelectorAll('.hd-sec[id^="s-"]').forEach((el) => io.observe(el));
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    return () => io.disconnect();
  }, [edit, R]);

  if (edit) return <GuideEditor guide={guide} onCancel={() => setEdit(false)} />;
  const copy = (id: string) => { const u = `${location.origin}/huong-dan/${guide.slug}#s-${id}`; navigator.clipboard?.writeText(u); history.replaceState(null, '', `#s-${id}`); };

  return (
    <div className="hd"><div className="hd-wrap">
      <div style={{ marginBottom: 14 }}><Link href="/huong-dan" className="hd-muted" style={{ textDecoration: 'none' }}>← Tất cả hướng dẫn</Link></div>
      <div className="hd-card" style={{ padding: '18px 22px', marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 420px' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <span className="hd-eyebrow" style={{ alignSelf: 'center' }}>{serviceLabel(guide.service)}</span>
            <span className={`hd-pill ${audPill(guide.audience)}`}>{audienceLabel(guide.audience)}</span>
            {guide.status !== 'phat-hanh' && <span className="hd-pill hd-pill-draft">{statusLabel(guide.status)} · chỉ người sửa thấy</span>}
            {X.internal && <span className="hd-pill hd-int">Nội bộ · không gửi khách</span>}
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, lineHeight: 1.3 }}>{guide.title}</h1>
          {guide.summary && <div style={{ color: 'var(--hd-ink-2)', fontSize: 14, lineHeight: 1.55 }}>{guide.summary}</div>}
          {(X.who || X.portal) && <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8, fontSize: 13 }}>
            {X.who && <span><span className="hd-muted">Dành cho </span><b>{X.who}</b></span>}
            {X.portal && <span><span className="hd-muted">Dùng trên </span><code style={{ font: '12.5px var(--font-mono)', color: '#8a2fd0' }}>{X.portal}</code></span>}
          </div>}
          <div className="hd-muted" style={{ marginTop: 8 }}>Phiên bản {guide.version} · cập nhật {new Date(guide.updated_at).toLocaleString('vi-VN')}{guide.updated_by ? ` bởi ${guide.updated_by}` : ''}{guide.owner ? ` · phụ trách: ${guide.owner}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="hd-btn" href={`/in-huong-dan?s=${encodeURIComponent(guide.slug)}`} target="_blank" rel="noopener" title="In trang web này ra giấy / PDF"><i className="ri-printer-line" /> In bản web</a>
          {canEdit && <button className="hd-btn" onClick={() => setEdit(true)}><i className="ri-edit-line" /> Sửa</button>}
        </div>
      </div>
      <FilesBox guideId={guide.id} files={guide.files || []} canEdit={canEdit} internal={X.internal} />
      {!!X.tasks?.length && <>
        <div className="hd-label" style={{ margin: '4px 2px 8px' }}>Việc hay làm</div>
        <div className="hd-tasks">{X.tasks.map((t, i) => <button key={i} className="hd-card hd-task" onClick={() => go(t.sec)}><b>{t.t}</b>{t.d && <span>{t.d}</span>}</button>)}</div>
      </>}
      <div className="hd-view">
        <nav className="hd-card hd-toc" aria-label="Mục lục">
          <div className="hd-label" style={{ padding: '0 10px 6px' }}>Mục lục</div>
          {R.map((s, i) => <span key={s.id}>
            {s.group && s.group !== R[i - 1]?.group && <div className="hd-toc-g">{s.group}</div>}
            <a href={`#s-${s.id}`} data-on={on === s.id} onClick={(e) => { e.preventDefault(); go(s.id); }}>{num(s.title, i)}{s.title}</a>
          </span>)}
          {total > 0 && <div style={{ padding: '12px 10px 2px', borderTop: '1px solid var(--hd-line-2)', marginTop: 10 }}>
            <div className="hd-muted">Checklist: <b style={{ color: 'var(--hd-ink)' }}>{done}/{total}</b> đã làm</div>
            <div className="hd-progress"><div style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
            {done > 0 && <button className="hd-btn hd-btn-sm" style={{ marginTop: 8 }} onClick={reset}>Làm lại từ đầu</button>}
          </div>}
        </nav>
        <div ref={box}>
          {!R.length && <div className="hd-card" style={{ padding: 24 }}><span className="hd-muted">Hướng dẫn chưa có nội dung.</span></div>}
          {R.map((s, i) => (
            <div key={s.id}>
            {s.group && s.group !== R[i - 1]?.group && <div className="hd-sec-g">{s.group}</div>}
            <section id={`s-${s.id}`} className="hd-card hd-sec">
              <h2>{num(s.title, i) && <span className="hd-num">{i + 1}.</span>}{s.title}<a className="hd-anchor" href={`#s-${s.id}`} onClick={(e) => { e.preventDefault(); copy(s.id); }} title="Chép link tới mục này">Chép link</a></h2>
              <div className="hd-md" dangerouslySetInnerHTML={{ __html: s.html }} />
            </section>
            </div>
          ))}
        </div>
      </div>
      {lb && <div className="hd-lb" onClick={() => setLb(null)}><img src={lb.src} alt={lb.alt} /><div>{lb.alt} · bấm ra ngoài hoặc Esc để đóng</div></div>}
    </div></div>
  );
}
