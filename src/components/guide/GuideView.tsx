'use client';
// Tab Hướng dẫn — trang xem: mục lục, nội dung, checklist có lưu tiến độ, xuất PDF, chuyển sang chế độ sửa
import './guide.css';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderMd } from '@/lib/guide/md';
import { audienceLabel, serviceLabel, statusLabel, type Guide } from '@/lib/guide/meta';
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
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, lineHeight: 1.3 }}>{guide.title}</h1>
          {guide.summary && <div style={{ color: 'var(--hd-ink-2)', fontSize: 14, lineHeight: 1.55 }}>{guide.summary}</div>}
          <div className="hd-muted" style={{ marginTop: 8 }}>Phiên bản {guide.version} · cập nhật {new Date(guide.updated_at).toLocaleString('vi-VN')}{guide.updated_by ? ` bởi ${guide.updated_by}` : ''}{guide.owner ? ` · phụ trách: ${guide.owner}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="hd-btn hd-btn-pri" href={`/in-huong-dan?s=${encodeURIComponent(guide.slug)}`} target="_blank" rel="noopener"><i className="ri-file-pdf-2-line" /> Xuất PDF</a>
          {canEdit && <button className="hd-btn" onClick={() => setEdit(true)}><i className="ri-edit-line" /> Sửa</button>}
        </div>
      </div>
      <div className="hd-view">
        <nav className="hd-card hd-toc" aria-label="Mục lục">
          <div className="hd-label" style={{ padding: '0 10px 6px' }}>Mục lục</div>
          {R.map((s, i) => <a key={s.id} href={`#s-${s.id}`} data-on={on === s.id} onClick={(e) => { e.preventDefault(); document.getElementById(`s-${s.id}`)?.scrollIntoView({ behavior: 'smooth' }); history.replaceState(null, '', `#s-${s.id}`); }}>{i + 1}. {s.title}</a>)}
          {total > 0 && <div style={{ padding: '12px 10px 2px', borderTop: '1px solid var(--hd-line-2)', marginTop: 10 }}>
            <div className="hd-muted">Checklist: <b style={{ color: 'var(--hd-ink)' }}>{done}/{total}</b> đã làm</div>
            <div className="hd-progress"><div style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
            {done > 0 && <button className="hd-btn hd-btn-sm" style={{ marginTop: 8 }} onClick={reset}>Làm lại từ đầu</button>}
          </div>}
        </nav>
        <div ref={box}>
          {!R.length && <div className="hd-card" style={{ padding: 24 }}><span className="hd-muted">Hướng dẫn chưa có nội dung.</span></div>}
          {R.map((s, i) => (
            <section key={s.id} id={`s-${s.id}`} className="hd-card hd-sec">
              <h2><span className="hd-num">{i + 1}.</span>{s.title}<a className="hd-anchor" href={`#s-${s.id}`} onClick={(e) => { e.preventDefault(); copy(s.id); }} title="Chép link tới mục này">Chép link</a></h2>
              <div className="hd-md" dangerouslySetInnerHTML={{ __html: s.html }} />
            </section>
          ))}
        </div>
      </div>
    </div></div>
  );
}
