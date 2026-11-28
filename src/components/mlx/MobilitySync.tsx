'use client';
// Đối chiếu Master data MLX ↔ hồ sơ khách ở Dashboard Mobility (Tiến độ khách hàng · Nhập liệu).
// Ghép theo mã hợp đồng → MST (duy nhất) → tên đã chuẩn hoá. MLX là chuẩn mặc định; Mobility bổ sung ô MLX còn trống.
import { Fragment, useMemo, useState } from 'react';
import s from './mlx.module.css';
import { loadCustomers, saveCustomers } from '@/lib/mlx/masterData';
import { nameKey } from '@/lib/mlx/dupes';
import type { MlxCustomer } from '@/lib/mlx/types';

type Mob = { key: string; name: string; mst: string; address: string; tx: number; cards: number; signed: boolean };
type Fld = 'ten' | 'mst' | 'dc';
type Pair = { c: MlxCustomer; m: Mob; by: string; diff: Partial<Record<Fld, { mlx: string; mob: string }>> };
const LAB: Record<Fld, string> = { ten: 'Tên công ty', mst: 'MST', dc: 'Địa chỉ' };
const MERGE0: Record<string, string> = { '26000055': '20000020', '26000034': '24000290', '26000041': '20006788', '26000029': '20006419', '000000000ML': '109839192' };
const bucketOf = (k: string) => { let h = 0; for (const c of String(k)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 'b' + String(h % 32).padStart(2, '0'); };
const normMst = (v: string) => String(v || '').replace(/\D/g, '');
const isoOk = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

async function J(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: 'no-store', ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Lỗi ${r.status} khi gọi ${url}`);
  return j;
}

/** Tải hồ sơ khách từ Dashboard Mobility */
export async function loadMobility(): Promise<Mob[]> {
  const [st, db, cs] = await Promise.all([J('/api/dashboard/mobility/state'), J('/api/dashboard/mobility/db?col=crm'), J('/api/dashboard/mobility/cards?summary=1').catch(() => ({ sum: {} }))]);
  const S = st.data || {}, MERGE: Record<string, string> = { ...MERGE0, ...(S.merge || {}) };
  const to = (k: string) => { let x = k, n = 0; while (MERGE[x] && n++ < 5) x = MERGE[x]; return x; };
  const M = new Map<string, Mob>();
  const get = (k0: string) => { const k = to(String(k0)); if (!M.has(k)) M.set(k, { key: k, name: '', mst: '', address: '', tx: 0, cards: 0, signed: false }); return M.get(k)!; };
  for (const r of (S.book?.rows || []) as unknown[][]) { const m = get(String(r[0])); if (!m.name) m.name = String(r[1] || ''); if (r[6] === 'Y' || r[7] === 'Y') m.signed = true; }
  for (const t of (S.tx || []) as unknown[][]) { const m = get(String(t[2])); m.tx++; if (!m.name) m.name = String(t[7] || '').replace(/^[A-Z0-9]{3,6}\s*-\s*/, ''); }
  const DEL = new Set<string>();
  for (const d of (db.docs || []) as { data: Record<string, { name?: string; deleted?: string; ms?: { pl?: string; hd?: string } }> }[])
    for (const [k, e] of Object.entries(d.data || {})) { if (!e || typeof e !== 'object') continue; if (e.deleted) { DEL.add(k); continue; }
      const m = get(k); if (e.name) m.name = e.name; if ((e.ms && (isoOk(e.ms.pl) || isoOk(e.ms.hd) || e.ms.pl === 'Y' || e.ms.hd === 'Y'))) m.signed = true; }
  for (const [k, v] of Object.entries((cs.sum || {}) as Record<string, { mst?: string; address?: string; n?: number }>)) { const m = get(k); m.mst = v.mst || m.mst; m.address = v.address || m.address; m.cards += v.n || 0; }
  return [...M.values()].filter((m) => !DEL.has(m.key) && !MERGE[m.key] && m.name);
}

export default function MobilitySync({ onApplied }: { onApplied: () => void }) {
  const [busy, setBusy] = useState(''), [err, setErr] = useState(''), [msg, setMsg] = useState('');
  const [R, setR] = useState<{ same: number; pairs: Pair[]; mobOnly: Mob[]; mlxOnly: MlxCustomer[]; skipped: Mob[] } | null>(null);
  const [pick, setPick] = useState<Record<string, 'mlx' | 'mob'>>({});   // `${id}|${fld}` → bên được chọn
  const [add, setAdd] = useState<Record<string, boolean>>({});
  const [show, setShow] = useState<'diff' | 'mob' | 'mlx'>('diff');

  async function run() {
    setBusy('Đang tải dữ liệu hai bên…'); setErr(''); setMsg('');
    try {
      const [C, M] = await Promise.all([loadCustomers(), loadMobility()]);
      const byKey = new Map(M.map((m) => [m.key, m])), mstCount = new Map<string, number>(), nkCount = new Map<string, number>();
      M.forEach((m) => { const t = normMst(m.mst); if (t) mstCount.set(t, (mstCount.get(t) || 0) + 1); const n = nameKey(m.name); if (n) nkCount.set(n, (nkCount.get(n) || 0) + 1); });
      const byMst = new Map(M.filter((m) => mstCount.get(normMst(m.mst)) === 1).map((m) => [normMst(m.mst), m])), byNk = new Map(M.filter((m) => nkCount.get(nameKey(m.name)) === 1).map((m) => [nameKey(m.name), m]));
      const used = new Set<string>(), pairs: Pair[] = [], mlxOnly: MlxCustomer[] = []; let same = 0;
      for (const c of C) {
        let m = c.ma_hop_dong && byKey.get(c.ma_hop_dong.trim()), by = 'mã hợp đồng';
        if (!m && normMst(c.mst)) { m = byMst.get(normMst(c.mst)); by = 'MST'; }
        if (!m) { m = byNk.get(nameKey(c.ten_cong_ty)); by = 'tên'; }
        if (!m || used.has(m.key)) { mlxOnly.push(c); continue; }
        used.add(m.key);
        const diff: Pair['diff'] = {};
        if (m.name && nameKey(m.name) !== nameKey(c.ten_cong_ty)) diff.ten = { mlx: c.ten_cong_ty, mob: m.name };
        if (normMst(m.mst) !== normMst(c.mst) && (m.mst || c.mst)) diff.mst = { mlx: c.mst, mob: m.mst };
        if ((m.address || '').trim() !== (c.dia_chi || '').trim() && (m.address || c.dia_chi)) diff.dc = { mlx: c.dia_chi, mob: m.address };
        if (Object.keys(diff).length) pairs.push({ c, m, by, diff }); else same++;
      }
      // toàn bộ khách Mobility chưa có ở MLX (không phân biệt đã có giao dịch); trùng tên với khách MLX hoặc với nhau thì chỉ lấy 1 (MLX không cho 2 khách cùng tên)
      const mlxNames = new Set(C.map((c) => c.ten_cong_ty.trim().toLowerCase())), seenN = new Set<string>();
      const mobAll = M.filter((m) => !used.has(m.key)).sort((a, b) => b.tx - a.tx || b.cards - a.cards || a.name.localeCompare(b.name, 'vi'));
      const mobOnly: Mob[] = [], skipped: Mob[] = [];
      for (const m of mobAll) { const n = m.name.trim().toLowerCase(); if (mlxNames.has(n) || seenN.has(n)) { skipped.push(m); continue; } seenN.add(n); mobOnly.push(m); }
      // mặc định: MLX là chuẩn; ô MLX trống thì lấy Mobility
      const P: Record<string, 'mlx' | 'mob'> = {};
      pairs.forEach((p) => (Object.keys(p.diff) as Fld[]).forEach((f) => { P[`${p.c.id}|${f}`] = p.diff[f]!.mlx.trim() ? 'mlx' : 'mob'; }));
      setPick(P); setAdd(Object.fromEntries(mobOnly.map((m) => [m.key, true]))); setR({ same, pairs, mobOnly, mlxOnly, skipped });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  }

  const counts = useMemo(() => { if (!R) return null; let toMlx = 0, toMob = 0;
    R.pairs.forEach((p) => (Object.keys(p.diff) as Fld[]).forEach((f) => { const d = p.diff[f]!; const v = pick[`${p.c.id}|${f}`]; if (v === 'mob' && d.mob !== d.mlx) toMlx++; if (v === 'mlx' && d.mlx !== d.mob) toMob++; }));
    return { toMlx, toMob, add: Object.values(add).filter(Boolean).length }; }, [R, pick, add]);

  async function apply() {
    if (!R || !counts) return;
    if (!confirm(`Áp dụng: ${counts.toMlx} ô cập nhật vào MLX · ${counts.toMob} ô cập nhật sang Mobility · thêm ${counts.add} khách vào MLX?`)) return;
    setBusy('Đang lưu…'); setErr(''); setMsg('');
    try {
      const upd: MlxCustomer[] = [], comp: { key: string; mst?: string; address?: string }[] = [], names: { key: string; name: string }[] = [];
      for (const p of R.pairs) { const c = { ...p.c }; let ch = false; const co: { key: string; mst?: string; address?: string } = { key: p.m.key };
        for (const f of Object.keys(p.diff) as Fld[]) { const d = p.diff[f]!, v = pick[`${p.c.id}|${f}`];
          if (v === 'mob') { if (f === 'ten') c.ten_cong_ty = d.mob; if (f === 'mst') c.mst = d.mob; if (f === 'dc') c.dia_chi = d.mob; ch = true; }
          else { if (f === 'ten' && d.mlx) names.push({ key: p.m.key, name: d.mlx }); if (f === 'mst' && d.mlx) co.mst = d.mlx; if (f === 'dc' && d.mlx) co.address = d.mlx; } }
        if (ch) upd.push(c); if (co.mst || co.address) comp.push(co); }
      let news: MlxCustomer[] = R.mobOnly.filter((m) => add[m.key]).map((m) => ({ ma_khach_hang: '', ma_hop_dong: /^(XPAY-|MOI-)/.test(m.key) ? '' : m.key, ten_cong_ty: m.name.trim(), ten_viet_tat: '', dia_chi: m.address || '', mst: m.mst || '', chiet_khau: 0, loai_ck: '' }));
      // MLX không cho 2 khách cùng tên: kiểm tra trước với toàn bộ master data hiện tại (đọc lại để có số mới nhất)
      const nk = (v: string) => v.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
      const C0 = await loadCustomers(), finalName = new Map(C0.map((c) => [c.id as string, c.ten_cong_ty]));
      const conflicts: string[] = [];
      for (const c of upd) { const old = finalName.get(c.id as string) || ''; if (nk(old) === nk(c.ten_cong_ty)) continue;
        const clash = [...finalName.entries()].some(([id, n]) => id !== c.id && nk(n) === nk(c.ten_cong_ty));
        if (clash) { conflicts.push(`đổi tên “${old}” → “${c.ten_cong_ty}”`); c.ten_cong_ty = old; } else finalName.set(c.id as string, c.ten_cong_ty); }
      const taken = new Set([...finalName.values()].map(nk));
      news = news.filter((c) => { const k = nk(c.ten_cong_ty); if (taken.has(k)) { conflicts.push(`thêm “${c.ten_cong_ty}”`); return false; } taken.add(k); return true; });
      for (let i = 0; i < upd.length; i += 500) { setBusy(`Đang cập nhật MLX ${Math.min(i + 500, upd.length)}/${upd.length}…`); await saveCustomers(upd.slice(i, i + 500), []); }
      for (let i = 0; i < news.length; i += 500) { setBusy(`Đang thêm khách vào MLX ${Math.min(i + 500, news.length)}/${news.length}…`); await saveCustomers(news.slice(i, i + 500), []); }
      if (comp.length) { const r = await J('/api/dashboard/mobility/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companies: comp, cards: [], deletes: [], dry: false }) }); if ((r.errors || []).length) throw new Error('Mobility: ' + r.errors.join('; ')); }
      const byB: Record<string, Record<string, { name: string }>> = {}; names.forEach((n) => { (byB[bucketOf(n.key)] = byB[bucketOf(n.key)] || {})[n.key] = { name: n.name }; });
      for (const [b, data] of Object.entries(byB)) await J('/api/dashboard/mobility/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'update', path: 'crm/' + b, data }) });
      setMsg(`Đã cập nhật ${upd.length} khách và thêm ${news.length} khách vào MLX; cập nhật ${comp.length + names.length} hồ sơ ở Mobility.${conflicts.length ? ` Bỏ qua ${conflicts.length} thay đổi vì trùng tên với khách khác đã có ở MLX: ${conflicts.slice(0, 6).join('; ')}${conflicts.length > 6 ? '…' : ''}` : ''}`);
      onApplied(); await run();
    } catch (e) { setErr((e as Error).message); setBusy(''); }
  }

  const cell = (p: Pair, f: Fld) => { const d = p.diff[f]; if (!d) return <td style={{ color: 'var(--ink-3)' }}>—</td>; const k = `${p.c.id}|${f}`;
    return (<td style={{ minWidth: 220 }}>
      {(['mlx', 'mob'] as const).map((side) => (
        <label key={side} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12.5, marginBottom: 2 }}>
          <input type="radio" name={k} checked={pick[k] === side} onChange={() => setPick((x) => ({ ...x, [k]: side }))} style={{ marginTop: 2 }} />
          <span><b style={{ fontSize: 10.5, color: side === 'mlx' ? 'var(--accent)' : '#7a5af8' }}>{side === 'mlx' ? 'MLX' : 'MOBILITY'}</b> {(side === 'mlx' ? d.mlx : d.mob) || <i style={{ color: 'var(--ink-3)' }}>(trống)</i>}</span>
        </label>))}
    </td>); };

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <div>
          <div className={s.eyebrow}>Đồng bộ</div>
          <h2 className={s.title}>Đối chiếu với hồ sơ khách ở Dashboard Mobility</h2>
          <div className={s.note}>Ghép theo mã hợp đồng → MST → tên. MLX là chuẩn mặc định; ô MLX còn trống thì lấy từ Mobility. Chọn bên đúng cho từng ô lệch, bấm Áp dụng để ghi về cả hai bên.</div>
        </div>
        <div className={s.row} style={{ gap: 8 }}>
          {R && counts && <button className={`${s.btn} ${s.btnPrimary}`} disabled={!!busy || !(counts.toMlx + counts.toMob + counts.add)} onClick={apply}>Áp dụng ({counts.toMlx + counts.toMob} ô · +{counts.add} khách)</button>}
          <button className={s.btn} disabled={!!busy} onClick={run}>{R ? 'Đối chiếu lại' : 'Đối chiếu với Mobility'}</button>
        </div>
      </div>
      {busy && <div className={s.note}>{busy}</div>}
      {err && <div className={`${s.banner} ${s.bannerErr}`}>{err}</div>}
      {msg && <div className={`${s.banner} ${s.bannerOk}`}>{msg}</div>}
      {R && (<>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0 10px' }}>
          <span className={`${s.chip} ${s.chipOk}`}>{R.same} khách khớp, thông tin giống nhau</span>
          {([['diff', `${R.pairs.length} khách khớp nhưng lệch thông tin`], ['mob', `${R.mobOnly.length} khách có ở Mobility, chưa có ở MLX`], ['mlx', `${R.mlxOnly.length} khách có ở MLX, chưa có ở Mobility`]] as const).map(([k, l]) => (
            <button key={k} className={s.btn} style={show === k ? { borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 } : undefined} onClick={() => setShow(k)}>{l}</button>))}
        </div>
        {show === 'diff' && (R.pairs.length ? <div className={s.tableWrap} style={{ maxHeight: 520, overflow: 'auto' }}><table className={s.table}><thead><tr><th>Khách (MLX)</th><th>Ghép theo</th>{(['ten', 'mst', 'dc'] as Fld[]).map((f) => <th key={f}>{LAB[f]}</th>)}</tr></thead>
          <tbody>{R.pairs.map((p) => <tr key={p.c.id}><td style={{ minWidth: 200 }}><b>{p.c.ten_viet_tat || p.c.ten_cong_ty}</b><div className={s.note}>HĐ {p.c.ma_hop_dong || '—'} · Mobility {p.m.key}</div></td><td>{p.by}</td>{(['ten', 'mst', 'dc'] as Fld[]).map((f) => <Fragment key={f}>{cell(p, f)}</Fragment>)}</tr>)}</tbody></table></div>
          : <div className={s.note}>Không có khách nào lệch thông tin.</div>)}
        {show === 'mob' && (R.mobOnly.length ? <div className={s.tableWrap} style={{ maxHeight: 520, overflow: 'auto' }}><table className={s.table}><thead><tr><th><input type="checkbox" checked={R.mobOnly.every((m) => add[m.key])} onChange={(e) => setAdd(Object.fromEntries(R.mobOnly.map((m) => [m.key, e.target.checked])))} /></th><th>Mã HĐ (Mobility)</th><th>Tên</th><th>MST</th><th>Địa chỉ</th><th>Giao dịch XPAY</th><th>Thẻ</th><th>Đã ký</th></tr></thead>
          <tbody>{R.mobOnly.slice(0, 500).map((m) => <tr key={m.key}><td><input type="checkbox" checked={!!add[m.key]} onChange={(e) => setAdd((x) => ({ ...x, [m.key]: e.target.checked }))} /></td><td>{m.key}</td><td>{m.name}</td><td>{m.mst || '—'}</td><td style={{ maxWidth: 260 }}>{m.address || '—'}</td><td>{m.tx || '—'}</td><td>{m.cards || '—'}</td><td>{m.signed ? '✓' : '—'}</td></tr>)}</tbody></table>
          <div className={s.note} style={{ padding: 8 }}>Toàn bộ khách ở Mobility chưa có ở MLX (kể cả chưa có giao dịch), mặc định tick hết — đã chọn <b>{Object.values(add).filter(Boolean).length}</b>/{R.mobOnly.length}. {R.mobOnly.length > 500 ? `Bảng chỉ hiện 500 dòng đầu (xếp theo số giao dịch); các dòng còn lại vẫn được thêm theo ô tick ở đầu bảng. ` : ''}Mã tạm XPAY- / MOI- thêm vào MLX với mã hợp đồng trống.{R.skipped.length ? ` Bỏ qua ${R.skipped.length} khách trùng tên với khách đã có ở MLX hoặc trùng tên nhau (MLX không cho 2 khách cùng tên): ${R.skipped.slice(0, 8).map((m) => m.name + ' (' + m.key + ')').join('; ')}${R.skipped.length > 8 ? '…' : ''}` : ''}</div></div>
          : <div className={s.note}>Không có khách nào cần thêm.</div>)}
        {show === 'mlx' && (R.mlxOnly.length ? <div className={s.tableWrap} style={{ maxHeight: 520, overflow: 'auto' }}><table className={s.table}><thead><tr><th>Mã HĐ</th><th>Tên công ty</th><th>MST</th><th>Loại CK</th></tr></thead>
          <tbody>{R.mlxOnly.map((c) => <tr key={c.id}><td>{c.ma_hop_dong || '—'}</td><td>{c.ten_cong_ty}</td><td>{c.mst || '—'}</td><td>{c.loai_ck || '—'}</td></tr>)}</tbody></table>
          <div className={s.note} style={{ padding: 8 }}>Thường là khách chỉ đi CMS / Be, chưa có trong sổ Mobility. Kiểm tra lại mã hợp đồng nếu là khách XPAY.</div></div>
          : <div className={s.note}>Mọi khách MLX đều đã có ở Mobility.</div>)}
      </>)}
    </div>
  );
}
