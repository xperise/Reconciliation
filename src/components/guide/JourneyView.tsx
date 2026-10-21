'use client';
// Hành trình hướng dẫn: chặng → bước (theo vai trò) → đọc nội dung ngay bên phải, kèm tệp cần gửi ở từng chặng
import './guide.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderMd } from '@/lib/guide/md';
import { audienceLabel, type Guide, type GuideFile } from '@/lib/guide/meta';
import { DEFAULT_ROLES, type JStep } from '@/lib/guide/journey';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ganTepVaoChang, ghiNhanTepHuongDan, xinChoTepHuongDan } from '@/app/(app)/huong-dan/actions';
import GuideNav from './GuideNav';
import JourneyEditor from './JourneyEditor';
import GuideSearch from './GuideSearch';
import { fold, highlightDom } from '@/lib/guide/search';

type Lib = Record<string, Pick<Guide, 'slug' | 'title' | 'audience' | 'sections' | 'status'>>;
const kb = (n: number | null) => (n == null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const noExt = (n: string) => n.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

export default function JourneyView({ guide, lib, canEdit, userId, startEdit }: { guide: Guide; lib: Lib; canEdit: boolean; userId: string; startEdit?: boolean }) {
  const router = useRouter();
  const J = guide.extras!.journey!;
  const roles = J.roles?.length ? J.roles : DEFAULT_ROLES;
  const R = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const src = (g: string) => J.sources?.[g] || (lib[g] ? audienceLabel(lib[g].audience) : g);
  const [edit, setEdit] = useState(!!startEdit && canEdit);
  const [si, setSi] = useState(0), [pi, setPi] = useState(0);
  const [me, setMe] = useState(''), [only, setOnly] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [lb, setLb] = useState<{ src: string; alt: string } | null>(null);
  const [err, setErr] = useState(''), [busy, setBusy] = useState('');
  const [hl, setHl] = useState<{ t: string[]; h: string; at: string } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const KEY = `hdj:${userId}:${guide.slug}`;
  const S = J.stages[si];
  const stepKey = (x: JStep) => `${x.g}#${x.s}`;
  const secOf = (x: JStep) => lib[x.g]?.sections.find((s) => s.id === x.s);

  // khôi phục: vai trò, đã làm, vị trí (từ #chang/buoc trên đường dẫn)
  useEffect(() => {
    let v: { done?: Record<string, boolean>; me?: string; only?: boolean } = {};
    try { v = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* */ }
    // ?vai=… (từ trang Tổng quan) chọn sẵn vai trò
    const vai = new URLSearchParams(location.search).get('vai');
    setDone(v.done || {}); setMe(vai || v.me || ''); setOnly(vai ? true : !!v.only);
    if (vai) { try { localStorage.setItem(KEY, JSON.stringify({ ...v, me: vai, only: true })); } catch { /* */ } }
    const sp = new URLSearchParams(location.search), tt = (sp.get('t') || '').split(',').filter(Boolean);
    if (tt.length) setHl({ t: tt, h: sp.get('h') || '', at: decodeURIComponent(location.hash.slice(1)) });
    const m = decodeURIComponent(location.hash.slice(1)).match(/^([^/]+)(?:\/(\d+))?$/);
    if (m) { const k = J.stages.findIndex((s) => s.id === m[1]); if (k >= 0) { setSi(k); setPi(m[2] ? Math.max(0, +m[2] - 1) : 0); } }
  }, [KEY, J.stages]);
  const save = useCallback((p: { done?: Record<string, boolean>; me?: string; only?: boolean }) => {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); localStorage.setItem(KEY, JSON.stringify({ ...v, ...p })); } catch { /* */ }
  }, [KEY]);

  const visible = (x: JStep) => !me || x.role === me || x.role === 'all';
  const steps = S ? S.steps : [];
  const shown = only && me ? steps.map((x, i) => [x, i] as const).filter(([x]) => visible(x)) : steps.map((x, i) => [x, i] as const);
  const cur = steps[pi];
  const sec = cur ? secOf(cur) : undefined;
  const html = useMemo(() => (sec ? renderMd(sec.md, `j-${sec.id}`).html : ''), [sec]);
  const stat = (k: number) => { const st = J.stages[k].steps; const n = st.filter((x) => done[stepKey(x)]).length; return { n, t: st.length, mine: me ? st.filter(visible).length : st.length }; };
  const all = J.stages.reduce((a, _, k) => { const s = stat(k); return { n: a.n + s.n, t: a.t + s.t }; }, { n: 0, t: 0 });

  const goto = (k: number, p = 0) => {
    setSi(k); setPi(p); history.replaceState(null, '', `${location.pathname}#${J.stages[k].id}/${p + 1}`);
    body.current?.scrollTo({ top: 0 });
    if (window.innerWidth < 1050) setTimeout(() => document.getElementById('hj-reader')?.scrollIntoView({ behavior: 'smooth' }), 30);
  };
  // bước kế / trước (bỏ qua bước của vai trò khác khi đang lọc "chỉ của tôi")
  const nav = (d: number) => {
    let k = si, p = pi;
    for (;;) {
      p += d;
      if (p < 0) { if (k === 0) return; k--; p = J.stages[k].steps.length - 1; }
      else if (p >= J.stages[k].steps.length) { if (k === J.stages.length - 1) return; k++; p = 0; }
      const x = J.stages[k].steps[p];
      if (!x) continue;
      if (!(only && me) || visible(x)) { goto(k, p); return; }
    }
  };
  const toggleDone = () => { if (!cur) return; const n = { ...done, [stepKey(cur)]: !done[stepKey(cur)] }; setDone(n); save({ done: n }); };
  const isLast = si === J.stages.length - 1 && pi === steps.length - 1;
  const lastOfStage = pi === steps.length - 1;

  // đến từ ô tìm kiếm: tô từ khoá và cuộn tới đúng đoạn
  useEffect(() => {
    if (!hl || !body.current || `${S?.id}/${pi + 1}` !== hl.at) return;
    const el = body.current;
    highlightDom(el, hl.t);
    const fh = fold(hl.h).trim();
    const tgt = fh ? Array.from(el.querySelectorAll<HTMLElement>('h3,h4,strong,p,li,td')).find((x) => fold(x.textContent || '').includes(fh)) : el.querySelector<HTMLElement>('mark.hd-hl');
    (tgt || el.querySelector<HTMLElement>('mark.hd-hl'))?.scrollIntoView({ block: 'center' });
  }, [hl, html, si, pi, S]);

  // trong nội dung: link tới mục khác → nhảy tới bước tương ứng của hành trình (nếu có); bấm ảnh → phóng to
  useEffect(() => {
    const el = body.current; if (!el) return;
    const on = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'IMG') { const i = t as HTMLImageElement; setLb({ src: i.src, alt: i.alt }); return; }
      const a = t.closest('a') as HTMLAnchorElement | null; if (!a) return;
      const h = a.getAttribute('href') || '';
      const m = h.match(/^(?:\/huong-dan\/([^#?]+))?#s-(.+)$/); if (!m) return;
      const g = m[1] ? decodeURIComponent(m[1]) : cur?.g, s = m[2];
      for (let k = 0; k < J.stages.length; k++) { const p = J.stages[k].steps.findIndex((x) => x.g === g && x.s === s); if (p >= 0) { e.preventDefault(); goto(k, p); return; } }
      if (!m[1] && g) { e.preventDefault(); window.open(`/huong-dan/${g}#s-${s}`, '_blank'); }
    };
    el.addEventListener('click', on);
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setLb(null); };
    window.addEventListener('keydown', k);
    return () => { el.removeEventListener('click', on); window.removeEventListener('keydown', k); };
  });

  // tệp của chặng
  const fileMap = useMemo(() => Object.fromEntries((guide.files || []).map((f) => [f.id, f])), [guide.files]);
  const stageFiles = (S?.files || []).map((id) => fileMap[id]).filter(Boolean) as GuideFile[];
  const otherFiles = (guide.files || []).filter((f) => !(S?.files || []).includes(f.id));
  async function upload(list: FileList) {
    setErr('');
    for (const [i, f] of Array.from(list).entries()) {
      if (f.size > 50 * 1048576) { setErr(`"${f.name}" lớn hơn 50 MB.`); continue; }
      setBusy(`Đang tải lên ${i + 1}/${list.length}…`);
      try {
        const c = await xinChoTepHuongDan(guide.id, f.name);
        const { error } = await supabaseBrowser().storage.from('guide-files').uploadToSignedUrl(c.path, c.token, f, { contentType: f.type || undefined });
        if (error) throw new Error(error.message);
        const r = await ghiNhanTepHuongDan({ guideId: guide.id, path: c.path, label: noExt(f.name), fileName: f.name, mime: f.type, size: f.size, note: `Chặng: ${S.title}` });
        await ganTepVaoChang(guide.id, S.id, r.id, true);
      } catch (e) { setErr(`"${f.name}": ${e instanceof Error ? e.message : String(e)}`); }
    }
    setBusy(''); router.refresh();
  }
  const attach = async (id: string, on: boolean) => { setErr(''); try { await ganTepVaoChang(guide.id, S.id, id, on); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } };

  if (edit) return <JourneyEditor guide={guide} lib={lib} onCancel={() => setEdit(false)} />;
  if (!S) return <div className="hd"><div className="hd-wrap"><div className="hd-card hj-empty">Hành trình chưa có chặng nào.{canEdit && <> <button className="hd-btn" onClick={() => setEdit(true)}>Sắp xếp hành trình</button></>}</div></div></div>;
  const c = S.color, prevC = (k: number) => J.stages[Math.max(0, k - 1)].color;
  let lastPhase: string | undefined = '§';

  return (
    <div className="hd"><div className="hd-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <GuideNav on="journey" journeySlug={guide.slug} />
        {canEdit && <div style={{ display: 'flex', gap: 8 }}>
          <button className="hd-btn" onClick={() => setEdit(true)}><i className="ri-drag-move-2-line" /> Sắp xếp hành trình</button>
        </div>}
      </div>

      <section className="hj-hero">
        <div className="hj-eb">Mobility / XPAY · Hành trình{guide.status !== 'phat-hanh' ? ' · Nháp' : ''}</div>
        <h1>{guide.title}</h1>
        {guide.summary && <p>{guide.summary}</p>}
        <div className="hj-ring">
          <svg width="74" height="74" viewBox="0 0 74 74" aria-hidden><circle cx="37" cy="37" r="31" fill="none" stroke="#ffffff33" strokeWidth="7" /><circle cx="37" cy="37" r="31" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(all.t ? all.n / all.t : 0) * 194.8} 194.8`} transform="rotate(-90 37 37)" /></svg>
          <b style={{ marginTop: -50, marginBottom: 26 }}>{all.t ? Math.round((all.n / all.t) * 100) : 0}%</b>
          đã làm {all.n}/{all.t} bước
        </div>
        <div className="hj-roles">
          <span className="hj-lab">Tôi là</span>
          <button className="hj-role" data-on={!me} onClick={() => { setMe(''); save({ me: '' }); }}>Xem tất cả</button>
          {roles.filter((r) => r.id !== 'all').map((r) => <button key={r.id} className="hj-role" data-on={me === r.id} onClick={() => { setMe(r.id); save({ me: r.id }); }}><i style={{ background: r.color }} />{r.name}</button>)}
          {me && <label className="hj-role" style={{ cursor: 'pointer' }}><input type="checkbox" checked={only} onChange={(e) => { setOnly(e.target.checked); save({ only: e.target.checked }); }} style={{ accentColor: '#fff' }} /> Chỉ hiện bước của tôi</label>}
        </div>
      </section>

      <div style={{ marginBottom: 14, maxWidth: 860 }}><GuideSearch lib={lib} journey={J} journeySlug={guide.slug} variant="bar" placeholder="Tìm trong hành trình: mô tả vấn đề hoặc thao tác cần làm…" /></div>

      <div className="hj-rail" role="tablist" aria-label="Các chặng">
        {J.stages.map((s, k) => { const st = stat(k); return (
          <button key={s.id} role="tab" aria-selected={k === si} className="hj-node" style={{ ['--c' as string]: s.color, ['--pc' as string]: prevC(k) }} data-on={k === si} data-done={st.t > 0 && st.n === st.t} data-dim={!!me && st.mine === 0} onClick={() => goto(k, 0)}>
            <span className="hj-dot">{st.t > 0 && st.n === st.t ? <i className="ri-check-line" /> : k + 1}</span>
            <b>{s.title}</b>
            <span className="hj-mini"><span style={{ width: `${st.t ? (st.n / st.t) * 100 : 0}%` }} /></span>
            <small>{st.n}/{st.t} bước{me && st.mine !== st.t ? ` · ${st.mine} của bạn` : ''}</small>
          </button>); })}
      </div>

      <div className="hj-body" style={{ ['--c' as string]: c }}>
        <div className="hd-card hj-stage">
          <div className="hj-stage-top">
            <div className="hj-n">Chặng {si + 1} / {J.stages.length}</div>
            <h2>{S.title}</h2>
            {S.goal && <p>{S.goal}</p>}
            {S.gate && <div className="hj-gate"><b><i className="ri-flag-2-line" /> Xong chặng khi:</b> {S.gate}</div>}
            <div className="hj-rolesum">{[...new Set(S.steps.map((x) => x.role))].map((r) => <span key={r} className="hj-badge" style={{ ['--rc' as string]: R[r]?.color || '#5B6470' }}>{R[r]?.name || r} · {S.steps.filter((x) => x.role === r).length}</span>)}</div>
          </div>

          {(stageFiles.length > 0 || canEdit) && <div className="hj-files">
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c)', marginBottom: 4 }}><i className="ri-attachment-2" /> Tài liệu gửi đi ở chặng này</div>
            {!stageFiles.length && <div className="hd-muted" style={{ fontSize: 12 }}>Chưa gắn tệp nào.</div>}
            {stageFiles.map((f) => (
              <div key={f.id} className="hj-file">
                <span className="hj-fi"><i className="ri-file-pdf-2-line" /></span>
                <div style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 13 }}>{f.label}</b><span className="hd-muted" style={{ fontSize: 11.5 }}>{f.file_name} · {kb(f.size_bytes)}</span></div>
                <a className="hd-btn hd-btn-sm" href={`/api/guides/files/${f.id}?xem=1`} target="_blank" rel="noopener">Xem</a>
                <a className="hd-btn hd-btn-sm hd-btn-pri" href={`/api/guides/files/${f.id}`}>Tải về</a>
                {canEdit && <button className="hd-btn hd-btn-sm" title="Gỡ khỏi chặng" onClick={() => attach(f.id, false)}><i className="ri-close-line" /></button>}
              </div>))}
            {canEdit && <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label className="hd-btn hd-btn-sm"><i className="ri-upload-2-line" /> {busy || 'Gắn tệp mới'}<input type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} /></label>
              {otherFiles.length > 0 && <select className="hd-select" style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }} value="" onChange={(e) => e.target.value && attach(e.target.value, true)}>
                <option value="">+ Gắn tệp đã có…</option>{otherFiles.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>}
            </div>}
            {err && <div className="hd-err" style={{ marginTop: 6 }}>{err}</div>}
          </div>}

          <div className="hj-steps">
            {shown.map(([x, i]) => {
              const s = secOf(x), r = R[x.role];
              const ph = x.phase !== lastPhase ? x.phase : undefined; lastPhase = x.phase;
              return (<div key={i}>
                {ph && <div className="hj-phase">{ph}</div>}
                <button className="hj-step" data-on={i === pi} data-done={!!done[stepKey(x)]} data-dim={!only && !!me && !visible(x)} onClick={() => goto(si, i)}>
                  <span className="hj-i">{done[stepKey(x)] ? <i className="ri-check-line" /> : i + 1}</span>
                  <span><div className="hj-t">{x.title || s?.title || x.s}</div><div className="hj-src">{src(x.g)}{s?.group ? ` · ${s.group}` : ''}{!s ? ' · không tìm thấy mục' : ''}</div></span>
                  <span className="hj-badge" style={{ ['--rc' as string]: r?.color || '#5B6470' }}>{r?.name || x.role}</span>
                </button>
              </div>);
            })}
            {!shown.length && <div className="hj-empty">Chặng này không có bước nào của vai trò bạn chọn.</div>}
          </div>
        </div>

        <div className="hd-card hj-reader" id="hj-reader">
          {cur ? <>
            <div className="hj-rhead">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="hj-badge" style={{ ['--rc' as string]: c }}>Chặng {si + 1} · Bước {pi + 1}/{steps.length}</span>
                <span className="hj-badge" style={{ ['--rc' as string]: R[cur.role]?.color || '#5B6470' }}>{R[cur.role]?.name || cur.role}</span>
                <Link href={`/huong-dan/${cur.g}#s-${cur.s}`} className="hd-muted" style={{ marginLeft: 'auto', fontSize: 12 }} target="_blank">Trong thư viện: {src(cur.g)} ↗</Link>
              </div>
              <h3>{cur.title || sec?.title || cur.s}</h3>
            </div>
            <div className="hj-rbody" ref={body}>
              {sec ? <div className="hd-md" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="hj-empty">Không tìm thấy mục “{cur.s}” trong bộ “{cur.g}”. Có thể bài đã bị xoá hoặc đổi mã mục — vào Sắp xếp hành trình để sửa.</div>}
            </div>
            <div className="hj-rfoot">
              <button className="hd-btn" disabled={si === 0 && pi === 0} onClick={() => nav(-1)}><i className="ri-arrow-left-line" /> Bước trước</button>
              <button className="hd-btn hj-done-btn" data-on={!!done[stepKey(cur)]} onClick={toggleDone}><i className={done[stepKey(cur)] ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'} /> {done[stepKey(cur)] ? 'Đã làm' : 'Đánh dấu đã làm'}</button>
              <span style={{ flex: 1 }} />
              {!isLast && <button className="hd-btn hj-next" onClick={() => { if (!done[stepKey(cur)]) toggleDone(); nav(1); }}>{lastOfStage ? `Sang chặng ${si + 2}: ${J.stages[si + 1].title}` : 'Bước tiếp theo'} <i className="ri-arrow-right-line" /></button>}
              {isLast && <span className="hd-ok"><i className="ri-flag-2-fill" /> Đã tới bước cuối của hành trình</span>}
            </div>
          </> : <div className="hj-empty">Chọn một bước ở bên trái để đọc.</div>}
        </div>
      </div>
      {lb && <div className="hd-lb" onClick={() => setLb(null)}><img src={lb.src} alt={lb.alt} /><div>{lb.alt} · bấm ra ngoài hoặc Esc để đóng</div></div>}
    </div></div>
  );
}
