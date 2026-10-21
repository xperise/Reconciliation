'use client';
// Sắp xếp hành trình: chặng (tên, màu, mục tiêu, điều kiện) → bước (vai trò, nhóm, mục trong thư viện)
import './guide.css';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Guide } from '@/lib/guide/meta';
import { DEFAULT_ROLES, STAGE_COLORS, type JStage, type JStep } from '@/lib/guide/journey';
import { luuHuongDan } from '@/app/(app)/huong-dan/actions';

type Lib = Record<string, Pick<Guide, 'slug' | 'title' | 'audience' | 'sections' | 'status'>>;
const nid = () => Math.random().toString(36).slice(2, 8);

export default function JourneyEditor({ guide, lib, onCancel }: { guide: Guide; lib: Lib; onCancel: () => void }) {
  const router = useRouter();
  const J0 = guide.extras!.journey!;
  const roles = J0.roles?.length ? J0.roles : DEFAULT_ROLES;
  const [st, setSt] = useState<JStage[]>(() => JSON.parse(JSON.stringify(J0.stages)));
  const [open, setOpen] = useState(0);
  const [title, setTitle] = useState(guide.title), [summary, setSummary] = useState(guide.summary || ''), [status, setStatus] = useState(guide.status);
  const [err, setErr] = useState(''), [busy, start] = useTransition();
  const libs = Object.values(lib);
  const upd = (k: number, p: Partial<JStage>) => setSt((S) => S.map((s, i) => (i === k ? { ...s, ...p } : s)));
  const updStep = (k: number, j: number, p: Partial<JStep>) => upd(k, { steps: st[k].steps.map((x, i) => (i === j ? { ...x, ...p } : x)) });
  const mv = <T,>(a: T[], i: number, d: number) => { const b = a.slice(); const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b; };

  function save() {
    setErr('');
    start(async () => {
      try {
        await luuHuongDan({ id: guide.id, title, summary, service: guide.service, audience: guide.audience, version: guide.version, owner: guide.owner || '', status, sort: guide.sort, sections: [], note: 'Sắp xếp hành trình',
          extras: { ...guide.extras, kind: 'journey', journey: { ...J0, roles, stages: st } } });
        router.refresh(); onCancel();
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    });
  }

  return (
    <div className="hd"><div className="hd-wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, position: 'sticky', top: 56, zIndex: 3, background: 'var(--canvas, #f4f6f8)', padding: '8px 0', flexWrap: 'wrap' }}>
        <div><div className="hd-eyebrow">Sắp xếp hành trình</div><b style={{ fontSize: 17 }}>{title}</b></div>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="hd-btn" onClick={onCancel}>Huỷ</button>
          <button className="hd-btn hd-btn-pri" disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu hành trình'}</button>
        </span>
      </div>
      {err && <div className="hd-err" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="hd-card" style={{ padding: 16, marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 2fr 160px', gap: 10 }}>
        <div><label className="hd-label">Tên hành trình</label><input className="hd-input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className="hd-label">Mô tả</label><input className="hd-input" value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
        <div><label className="hd-label">Trạng thái</label><select className="hd-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="nhap">Nháp</option><option value="phat-hanh">Đã phát hành</option></select></div>
      </div>

      {st.map((s, k) => (
        <div key={s.id} className="hd-card" style={{ marginBottom: 12, overflow: 'hidden', borderLeft: `5px solid ${s.color}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 16px', cursor: 'pointer' }} onClick={() => setOpen(open === k ? -1 : k)}>
            <span style={{ width: 30, height: 30, borderRadius: '50%', background: s.color, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{k + 1}</span>
            <b style={{ fontSize: 15 }}>{s.title}</b><span className="hd-muted">{s.steps.length} bước</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
              <button className="hd-btn hd-btn-sm" title="Lên" disabled={!k} onClick={() => { setSt((S) => mv(S, k, -1)); setOpen(k - 1); }}><i className="ri-arrow-up-line" /></button>
              <button className="hd-btn hd-btn-sm" title="Xuống" disabled={k === st.length - 1} onClick={() => { setSt((S) => mv(S, k, 1)); setOpen(k + 1); }}><i className="ri-arrow-down-line" /></button>
              <button className="hd-btn hd-btn-sm hd-btn-danger" title="Xoá chặng" onClick={() => { if (window.confirm(`Xoá chặng "${s.title}"?`)) setSt((S) => S.filter((_, i) => i !== k)); }}><i className="ri-delete-bin-line" /></button>
            </span>
          </div>
          {open === k && <div style={{ padding: '0 16px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: 8 }}>
              <div><label className="hd-label">Tên chặng</label><input className="hd-input" value={s.title} onChange={(e) => upd(k, { title: e.target.value })} /></div>
              <div><label className="hd-label">Màu</label><input type="color" className="hd-input" style={{ padding: 2, height: 37 }} value={s.color} onChange={(e) => upd(k, { color: e.target.value })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <div><label className="hd-label">Mục tiêu chặng</label><textarea className="hd-textarea" style={{ minHeight: 60, fontFamily: 'var(--font-ui)' }} value={s.goal || ''} onChange={(e) => upd(k, { goal: e.target.value })} /></div>
              <div><label className="hd-label">Xong chặng khi (điều kiện sang chặng sau)</label><textarea className="hd-textarea" style={{ minHeight: 60, fontFamily: 'var(--font-ui)' }} value={s.gate || ''} onChange={(e) => upd(k, { gate: e.target.value })} /></div>
            </div>
            <div className="hd-label" style={{ marginTop: 12 }}>Các bước — theo thứ tự làm</div>
            {s.steps.map((x, j) => (
              <div key={j} style={{ display: 'grid', gridTemplateColumns: '26px 170px 160px minmax(0,1fr) auto', gap: 6, alignItems: 'center', padding: '4px 0', borderTop: '1px solid var(--hd-line-2)' }}>
                <b style={{ color: s.color, fontSize: 12 }}>{j + 1}</b>
                <input className="hd-input" style={{ padding: '5px 8px', fontSize: 12.5 }} value={x.phase || ''} placeholder="Nhóm (không bắt buộc)" onChange={(e) => updStep(k, j, { phase: e.target.value })} />
                <select className="hd-select" style={{ padding: '5px 8px', fontSize: 12.5 }} value={x.role} onChange={(e) => updStep(k, j, { role: e.target.value })}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                <select className="hd-select" style={{ padding: '5px 8px', fontSize: 12.5 }} value={`${x.g}#${x.s}`} onChange={(e) => { const [g, sx] = e.target.value.split('#'); updStep(k, j, { g, s: sx }); }}>
                  {!lib[x.g]?.sections.some((q) => q.id === x.s) && <option value={`${x.g}#${x.s}`}>(không tìm thấy) {x.g} · {x.s}</option>}
                  {libs.map((g) => <optgroup key={g.slug} label={g.title}>{g.sections.map((q) => <option key={q.id} value={`${g.slug}#${q.id}`}>{q.title}</option>)}</optgroup>)}
                </select>
                <span style={{ display: 'flex', gap: 3 }}>
                  <button className="hd-btn hd-btn-sm" disabled={!j} onClick={() => upd(k, { steps: mv(s.steps, j, -1) })}><i className="ri-arrow-up-line" /></button>
                  <button className="hd-btn hd-btn-sm" disabled={j === s.steps.length - 1} onClick={() => upd(k, { steps: mv(s.steps, j, 1) })}><i className="ri-arrow-down-line" /></button>
                  <button className="hd-btn hd-btn-sm hd-btn-danger" onClick={() => upd(k, { steps: s.steps.filter((_, i) => i !== j) })}><i className="ri-close-line" /></button>
                </span>
              </div>))}
            <button className="hd-btn hd-btn-sm" style={{ marginTop: 8 }} onClick={() => { const g = libs[0]; if (!g?.sections[0]) return; const last = s.steps[s.steps.length - 1]; upd(k, { steps: [...s.steps, { g: last?.g || g.slug, s: last ? last.s : g.sections[0].id, role: last?.role || 'vh', phase: last?.phase }] }); }}><i className="ri-add-line" /> Thêm bước</button>
          </div>}
        </div>
      ))}
      <button className="hd-btn" onClick={() => { setSt((S) => [...S, { id: nid(), title: `Chặng ${S.length + 1}`, color: STAGE_COLORS[S.length % STAGE_COLORS.length], steps: [], files: [] }]); setOpen(st.length); }}><i className="ri-add-line" /> Thêm chặng</button>
    </div></div>
  );
}
