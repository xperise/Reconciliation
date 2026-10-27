'use client';

import { useEffect, useMemo, useState } from 'react';
import s from './mlx.module.css';
import { loadCustomers, saveCustomers, TableMissingError, thieuCotLoaiCk } from '@/lib/mlx/masterData';
import { parseRule, type Rule } from '@/lib/mlx/discount';
import { loadLoaiCk, makeLookup, parseLoaiCkFile, saveLoaiCk, type LoaiCkRow } from '@/lib/mlx/loaiCk';
import { loadExcelJS } from '@/lib/mlx/download';
import { companyKey } from '@/lib/mlx/normalize';
import type { MlxCustomer } from '@/lib/mlx/types';

type Field = 'ma_khach_hang' | 'ma_hop_dong' | 'ten_cong_ty' | 'ten_viet_tat' | 'dia_chi' | 'mst' | 'chiet_khau';
type GridRow = { _k: string; id?: string; ma_khach_hang: string; ma_hop_dong: string; ten_cong_ty: string; ten_viet_tat: string; dia_chi: string; mst: string;
  /** loại CK dạng chữ: 'CK 4' | 'CK 5' | 'CK đặc biệt 7%' | 'SGS' | 'Khác: …' | '' */
  chiet_khau: string;
  /** % chiết khấu cũ (chỉ dùng khi chưa chọn loại CK) */
  pct_cu: number };

const FIELDS: { key: Field; label: string; width: number; numeric?: boolean }[] = [
  { key: 'ma_khach_hang', label: 'Mã khách hàng', width: 120 },
  { key: 'ma_hop_dong', label: 'Mã hợp đồng', width: 120 },
  { key: 'ten_viet_tat', label: 'Tên viết tắt', width: 140 },
  { key: 'ten_cong_ty', label: 'Tên công ty *', width: 340 },
  { key: 'dia_chi', label: 'Địa chỉ', width: 420 },
  { key: 'mst', label: 'MST', width: 140 },
  { key: 'chiet_khau', label: 'Chiết khấu', width: 250 },
];

let seq = 0;
const newKey = () => `r${Date.now()}${seq++}`;
const toGrid = (c: MlxCustomer): GridRow => ({
  _k: c.id ?? newKey(),
  id: c.id,
  ma_khach_hang: c.ma_khach_hang,
  ma_hop_dong: c.ma_hop_dong,
  ten_cong_ty: c.ten_cong_ty,
  ten_viet_tat: c.ten_viet_tat,
  dia_chi: c.dia_chi,
  mst: c.mst,
  chiet_khau: c.loai_ck?.trim() || '',
  pct_cu: Number(c.chiet_khau) || 0,
});
const emptyRow = (): GridRow => ({ _k: newKey(), ma_khach_hang: '', ma_hop_dong: '', ten_cong_ty: '', ten_viet_tat: '', dia_chi: '', mst: '', chiet_khau: '', pct_cu: 0 });

/** "5", "5%", "5,5" → 5 / 5.5 ; không hợp lệ → NaN */
function parsePct(v: string): number {
  const t = v.replace('%', '').replace(',', '.').trim();
  if (t === '') return 0;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const isBlank = (r: GridRow) => FIELDS.every((f) => !r[f.key].trim());

/* ---- Loại chiết khấu: chữ lưu trong master data ↔ lựa chọn trên màn hình ---- */
type CkKind = '' | 'CK4' | 'CK5' | 'DB' | 'SGS' | 'KHAC';
const ruleToText = (r: Rule | null): string => !r ? '' : r.kind === 'CK4' ? 'CK 4' : r.kind === 'CK5' ? 'CK 5' : r.kind === 'FLAT' ? `CK đặc biệt ${String(r.pct ?? 0).replace('.', ',')}%` : r.kind === 'SGS' ? 'SGS' : `Khác: ${r.raw.replace(/^khác\s*:?\s*/i, '')}`;
function ckOf(text: string): { kind: CkKind; x: string; note: string } {
  const r = parseRule(text);
  if (!r) return { kind: '', x: '', note: '' };
  if (r.kind === 'CK4') return { kind: 'CK4', x: '', note: '' };
  if (r.kind === 'CK5') return { kind: 'CK5', x: '', note: '' };
  if (r.kind === 'FLAT') return { kind: 'DB', x: String(r.pct ?? '').replace('.', ','), note: '' };
  if (r.kind === 'SGS') return { kind: 'SGS', x: '', note: '' };
  return { kind: 'KHAC', x: '', note: text.replace(/^khác\s*:?\s*/i, '') };
}
const ckText = (kind: CkKind, x: string, note: string) => kind === 'CK4' ? 'CK 4' : kind === 'CK5' ? 'CK 5' : kind === 'DB' ? `CK đặc biệt ${x.trim() || '?'}%` : kind === 'SGS' ? 'SGS' : kind === 'KHAC' ? `Khác: ${note}` : '';
const snapshot = (rows: GridRow[]) =>
  JSON.stringify(rows.filter((r) => !isBlank(r)).map(({ _k, ...rest }) => rest));

export default function MasterDataGrid() {
  const [rows, setRows] = useState<GridRow[]>([]);
  const [original, setOriginal] = useState<{ ids: string[]; snap: string }>({ ids: [], snap: '[]' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  // Bảng phân loại chiết khấu (file THOP_AR02 "C NGUYET")
  const [loaiCk, setLoaiCk] = useState<LoaiCkRow[]>([]);
  const [ckErr, setCkErr] = useState('');
  const [ckMsg, setCkMsg] = useState('');
  useEffect(() => { loadLoaiCk().then(setLoaiCk).catch((e: Error) => setCkErr(e.message)); }, []);
  const lookCk = useMemo(() => makeLookup(loaiCk), [loaiCk]);
  const goiY = (r: GridRow) => { const L = lookCk({ ma_khach_hang: r.ma_khach_hang, ma_hop_dong: r.ma_hop_dong, ten_cong_ty: r.ten_cong_ty, ten_viet_tat: '', dia_chi: '', mst: r.mst, chiet_khau: 0 }); return L.rule ? ruleToText(L.rule) : ''; };
  /** điền loại CK theo bảng phân loại: chiDong = chỉ dòng chưa chọn */
  function dienTheoBang(table: LoaiCkRow[], chiDongTrong: boolean) {
    const L = makeLookup(table); let n = 0;
    const next = rows.map((r) => {
      if (isBlank(r) || (chiDongTrong && r.chiet_khau.trim())) return r;
      const g = L({ ma_khach_hang: r.ma_khach_hang, ma_hop_dong: r.ma_hop_dong, ten_cong_ty: r.ten_cong_ty, ten_viet_tat: '', dia_chi: '', mst: r.mst, chiet_khau: 0 });
      const t = g.rule ? ruleToText(g.rule) : '';
      if (!t || t === r.chiet_khau) return r;
      n++; return { ...r, chiet_khau: t };
    });
    if (n) setRows(next);
    return n;
  }
  async function napLoaiCk(f: File) {
    setCkErr(''); setCkMsg('Đang đọc file phân loại…');
    try {
      const ExcelJS = await loadExcelJS();
      const table = await parseLoaiCkFile(ExcelJS, await f.arrayBuffer());
      setCkMsg(`Đang lưu ${table.length} hợp đồng…`);
      await saveLoaiCk(table);
      setLoaiCk(table);
      const n = dienTheoBang(table, false);
      setCkMsg(`Đã nạp ${table.length} hợp đồng từ "${f.name}". ${n ? `Đã điền loại CK cho ${n} khách theo bảng — bấm Lưu thay đổi để ghi vào master data.` : 'Loại CK của các khách đã khớp với bảng.'}`);
    } catch (e) { setCkMsg(''); setCkErr((e as Error).message); }
  }

  async function reload() {
    setLoading(true);
    try {
      const data = await loadCustomers();
      const grid = data.map(toGrid);
      setRows(grid.length ? grid : [emptyRow()]);
      setOriginal({ ids: data.map((d) => d.id as string), snap: snapshot(grid) });
      setTableMissing(false);
    } catch (e) {
      if (e instanceof TableMissingError) setTableMissing(true);
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    reload();
  }, []);

  const dirty = snapshot(rows) !== original.snap;

  // Cảnh báo rời trang khi chưa lưu
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // Kiểm tra dữ liệu
  const issues = useMemo(() => {
    const bad = new Set<string>(); // `${_k}:${field}`
    const list: string[] = [];
    const seen = new Map<string, number>();
    rows.forEach((r, i) => {
      if (isBlank(r)) return;
      if (!r.ten_cong_ty.trim()) {
        bad.add(`${r._k}:ten_cong_ty`);
        list.push(`Dòng ${i + 1}: thiếu tên công ty`);
      }
      const ck = ckOf(r.chiet_khau);
      if (ck.kind === 'DB') { const x = parsePct(ck.x); if (Number.isNaN(x) || x <= 0 || x > 100) { bad.add(`${r._k}:chiet_khau`); list.push(`Dòng ${i + 1}: CK đặc biệt cần nhập % từ 0 đến 100`); } }
      // So trùng đúng như ràng buộc trên Supabase: bỏ khoảng trắng thừa, không
      // phân biệt hoa/thường, GIỮ NGUYÊN dấu tiếng Việt. Nếu bỏ dấu để so thì
      // hai công ty khác nhau thật sự sẽ bị báo trùng oan.
      const key = r.ten_cong_ty.trim().toLowerCase();
      if (key) {
        if (seen.has(key)) {
          bad.add(`${r._k}:ten_cong_ty`);
          list.push(`Dòng ${i + 1} trùng tên với dòng ${seen.get(key)! + 1}: ${r.ten_cong_ty.trim()}`);
        } else seen.set(key, i);
      }
    });
    return { bad, list };
  }, [rows]);

  const setCell = (k: string, field: Field, value: string) =>
    setRows((prev) => prev.map((r) => (r._k === k ? { ...r, [field]: value } : r)));

  /** Dán nhiều ô từ Excel/Google Sheets (TSV) bắt đầu từ ô đang chọn */
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, fieldIndex: number) {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return; // dán 1 ô → để mặc định
    e.preventDefault();
    const matrix = text
      .replace(/\r/g, '')
      .replace(/\n$/, '')
      .split('\n')
      .map((line) => line.split('\t'));
    setRows((prev) => {
      const next = [...prev];
      matrix.forEach((cells, dr) => {
        const ri = rowIndex + dr;
        while (next.length <= ri) next.push(emptyRow());
        const row = { ...next[ri] };
        cells.forEach((val, dc) => {
          const f = FIELDS[fieldIndex + dc];
          if (f) row[f.key] = f.key === 'chiet_khau' ? (/^\d+([.,]\d+)?\s*%?$/.test(val.trim()) && parsePct(val) > 0 ? `CK đặc biệt ${val.replace('%', '').trim()}%` : ruleToText(parseRule(val)) || '') : val.trim();
        });
        next[ri] = row;
      });
      return next;
    });
  }

  async function save() {
    if (saving || !dirty) return;
    if (issues.list.length) {
      setMsg({ type: 'err', text: 'Còn lỗi dữ liệu, sửa các ô tô đỏ trước khi lưu.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const payload: MlxCustomer[] = rows
        .filter((r) => !isBlank(r))
        .map((r) => ({
          id: r.id,
          ma_khach_hang: r.ma_khach_hang,
          ma_hop_dong: r.ma_hop_dong,
          ten_cong_ty: r.ten_cong_ty,
          ten_viet_tat: r.ten_viet_tat,
          dia_chi: r.dia_chi,
          mst: r.mst,
          // CK đặc biệt: % lưu vào chiet_khau; chưa chọn loại CK: giữ % cũ; loại khác: 0
          chiet_khau: (() => { const c = ckOf(r.chiet_khau); return c.kind === 'DB' ? parsePct(c.x) || 0 : c.kind === '' ? r.pct_cu : 0; })(),
          loai_ck: r.chiet_khau.trim(),
        }));
      const kq = await saveCustomers(payload, original.ids);
      await reload();
      const chiTiet = [kq.them && `thêm ${kq.them}`, kq.sua && `cập nhật ${kq.sua}`, kq.xoa && `xoá ${kq.xoa}`]
        .filter(Boolean)
        .join(' · ');
      setMsg({
        type: 'ok',
        text: `Đã lưu ${payload.length} khách hàng${chiTiet ? ` (${chiTiet})` : ''}.`,
      });
    } catch (e) {
      setMsg({ type: 'err', text: `Lưu thất bại: ${(e as Error).message}` });
    } finally {
      setSaving(false);
    }
  }

  const q = companyKey(search);
  const visible = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !q || FIELDS.some((f) => companyKey(r[f.key]).includes(q)));

  const nChua = rows.filter((r) => !isBlank(r) && !r.chiet_khau.trim()).length;
  const nKhac = rows.filter((r) => ckOf(r.chiet_khau).kind === 'KHAC').length;
  const demBang = (() => { const c: Record<string, number> = {}; loaiCk.forEach((x) => { const k = ruleToText(parseRule(x.loai_ck)).replace(/^Khác:.*$/, 'Khác') || '(trống)'; const kk = /^CK đặc biệt/.test(k) ? 'CK đặc biệt' : k; c[kk] = (c[kk] ?? 0) + 1; }); return c; })();
  return (
    <div className={s.page}>
      {/* Bảng phân loại chiết khấu */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <div>
            <div className={s.eyebrow}>Chiết khấu</div>
            <h2 className={s.title}>Bảng phân loại chiết khấu</h2>
            <div className={s.note}>
              Chiết khấu tính trên <b>tổng giao dịch cả 3 nguồn</b> (CMS + XPAY + Be) theo loại CK chọn ở cột <b>Chiết khấu</b> bên dưới:
              CK 4, CK 5 (lũy tiến từng phần), CK đặc biệt x% (phẳng), SGS (cuốc ≥ 700k CK 2%, phần còn lại 8,5%).
              Nạp file THOP_AR02 (sheet C NGUYET) để điền loại CK tự động theo mã hợp đồng = SO_HD CMS, mã khách hàng = SO_HD_CU, hoặc MST.
            </div>
          </div>
          <div className={s.row}>
            {loaiCk.length > 0 && <span className={s.chip}>{loaiCk.length} hợp đồng · {Object.entries(demBang).map(([k, n]) => `${k}: ${n}`).join(' · ')}</span>}
            {loaiCk.length > 0 && nChua > 0 && <button className={s.btn} onClick={() => { const n = dienTheoBang(loaiCk, true); setCkMsg(n ? `Đã điền loại CK cho ${n} khách chưa chọn — bấm Lưu thay đổi.` : 'Không tìm thấy khách chưa chọn nào có trong bảng phân loại.'); }}>Điền cho {nChua} khách chưa chọn</button>}
            <label className={s.btn} style={{ cursor: 'pointer' }}>
              Nạp file phân loại CK
              <input type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) napLoaiCk(f); e.target.value = ''; }} />
            </label>
          </div>
        </div>
        {ckMsg && <div className={`${s.banner} ${s.bannerOk}`}>{ckMsg}</div>}
        {ckErr && <div className={`${s.banner} ${s.bannerErr}`}>{ckErr}</div>}
        {thieuCotLoaiCk && <div className={`${s.banner} ${s.bannerErr}`}>Chưa lưu được loại CK vào master data: chạy file supabase/migrations/27_mlx_loai_ck_khach.sql trong SQL Editor của Supabase.</div>}
        {nKhac > 0 && <div className={`${s.banner} ${s.bannerErr}`}>{nKhac} khách chọn <b>Rule khác</b>: cần define cách tính và báo Vân để cập nhật hệ thống. Bảng kê của các khách này chưa xuất được.</div>}
      </div>

      <div className={s.card}>
        <div className={s.cardHead}>
          <div>
            <div className={s.eyebrow}>Master data</div>
            <h2 className={s.title}>Khách hàng MLX</h2>
            <div className={s.note}>
              {rows.filter((r) => !isBlank(r)).length} khách · Tên file xuất = Mã hợp đồng_Tên công ty · Copy dữ liệu từ Excel rồi dán vào ô bất kỳ (theo thứ tự cột
              bên dưới) · cột Chiết khấu dán được chữ như “CK 5”, “CK đặc biệt 7%”, “SGS”
            </div>
          </div>
          <div className={s.row}>
            <input
              className={s.input}
              placeholder="Tìm tên, MST, viết tắt…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className={s.btn} onClick={() => setRows((p) => [...p, emptyRow()])} disabled={tableMissing}>
              + Thêm dòng
            </button>
            <button className={s.btn} onClick={reload} disabled={!dirty || saving}>
              Hoàn tác
            </button>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={save} disabled={!dirty || saving || tableMissing}>
              {saving ? 'Đang lưu…' : dirty ? 'Lưu thay đổi' : 'Đã lưu'}
            </button>
          </div>
        </div>

        {msg && (
          <div className={`${s.banner} ${msg.type === 'ok' ? s.bannerOk : s.bannerErr}`} style={{ marginBottom: 12 }}>
            {msg.text}
          </div>
        )}
        {issues.list.length > 0 && (
          <div className={`${s.banner} ${s.bannerErr}`} style={{ marginBottom: 12 }}>
            {issues.list.slice(0, 5).join(' · ')}
            {issues.list.length > 5 ? ` · và ${issues.list.length - 5} lỗi khác` : ''}
          </div>
        )}

        {loading ? (
          <div className={s.empty}>Đang tải…</div>
        ) : tableMissing ? (
          <div className={s.empty}>Cần tạo bảng trên Supabase trước khi nhập dữ liệu.</div>
        ) : (
          <div className={s.tableWrap} style={{ maxHeight: '70vh' }}>
            <table className={`${s.table} ${s.grid}`}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  {FIELDS.map((f) => (
                    <th key={f.key} style={{ minWidth: f.width, textAlign: f.numeric ? 'right' : 'left' }}>
                      {f.label}
                    </th>
                  ))}
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {visible.map(({ r, i }) => (
                  <tr key={r._k}>
                    <td className={s.rowNo}>{i + 1}</td>
                    {FIELDS.map((f, fi) => f.key === 'chiet_khau' ? (
                      <td key={f.key} className={issues.bad.has(`${r._k}:chiet_khau`) ? s.cellInvalid : ''}>
                        {(() => { const c = ckOf(r.chiet_khau), gy = !c.kind ? goiY(r) : '';
                          const setCk = (kind: CkKind, x = c.x, note = c.note) => setCell(r._k, 'chiet_khau', ckText(kind, x, note));
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '2px 4px' }}>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <select className={s.cell} style={{ flex: 1 }} value={c.kind} onChange={(e) => setCk(e.target.value as CkKind, c.kind === 'DB' ? c.x : '', '')} onPaste={(e) => handlePaste(e as unknown as React.ClipboardEvent<HTMLInputElement>, i, fi)}>
                                  <option value="">Chưa chọn{r.pct_cu ? ` (đang dùng ${r.pct_cu}% cũ)` : ''}</option>
                                  <option value="CK4">CK 4 — lũy tiến</option>
                                  <option value="CK5">CK 5 — lũy tiến</option>
                                  <option value="DB">CK đặc biệt x%</option>
                                  <option value="SGS">SGS — cuốc ≥ 700k</option>
                                  <option value="KHAC">Rule khác…</option>
                                </select>
                                {c.kind === 'DB' && <><input className={s.cellNum} style={{ width: 52 }} value={c.x} placeholder="x" onChange={(e) => setCk('DB', e.target.value)} /><span>%</span></>}
                              </div>
                              {c.kind === 'KHAC' && <input className={s.cell} value={c.note} placeholder="Mô tả cách tính" onChange={(e) => setCk('KHAC', '', e.target.value)} />}
                              {c.kind === 'KHAC' && <span style={{ fontSize: 11, color: '#b45309' }}>Cần define — báo Vân để cập nhật hệ thống</span>}
                              {gy && <button className={s.iconBtn} style={{ fontSize: 11, textAlign: 'left', width: 'auto' }} title="Áp dụng theo bảng phân loại" onClick={() => setCell(r._k, 'chiet_khau', gy)}>Bảng phân loại: {gy} · áp dụng</button>}
                            </div>
                          ); })()}
                      </td>
                    ) : (
                      <td key={f.key}>
                        <input
                          className={`${f.numeric ? s.cellNum : s.cell} ${issues.bad.has(`${r._k}:${f.key}`) ? s.cellInvalid : ''}`}
                          value={r[f.key]}
                          onChange={(e) => setCell(r._k, f.key, e.target.value)}
                          onPaste={(e) => handlePaste(e, i, fi)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.preventDefault();
                          }}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        className={s.iconBtn}
                        title="Xoá dòng"
                        onClick={() => setRows((p) => (p.length > 1 ? p.filter((x) => x._k !== r._k) : [emptyRow()]))}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
