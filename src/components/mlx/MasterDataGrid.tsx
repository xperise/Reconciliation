'use client';

import { useEffect, useMemo, useState } from 'react';
import s from './mlx.module.css';
import { loadCustomers, saveCustomers, TableMissingError, thieuCotLoaiCk } from '@/lib/mlx/masterData';
import { parseRule, type Rule } from '@/lib/mlx/discount';
import { bestOf, findDupes } from '@/lib/mlx/dupes';
import { saveAlias } from '@/lib/mlx/aliases';
import { getSupabase } from '@/lib/mlx/supabase';
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
  const [fCk, setFCk] = useState<'' | 'NONE' | CkKind>('');
  const [sortCk, setSortCk] = useState<0 | 1 | -1>(0);
  const [upMsg, setUpMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [fData, setFData] = useState('');
  /** dòng đã gộp (bị xoá) → dòng giữ lại: chuyển phần ghi nhớ tên sang dòng giữ lại khi lưu */
  const [mergedTo, setMergedTo] = useState<{ from: string; to: string; name: string }[]>([]);
  const [weakOk, setWeakOk] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('mlx_dup_ok') || '[]'); } catch { return []; } });
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

  // Khách bị nhập nhiều dòng: cùng mã HĐ / cùng mã KH / cùng tên (đã chuẩn hoá)
  const dups = useMemo(() => findDupes(rows.filter((r) => !isBlank(r)), (r) => r._k).filter((g) => g.strong || !weakOk.includes([...g.ids].sort().join('|'))), [rows, weakOk]);
  const dupOf = useMemo(() => { const m = new Map<string, number>(); dups.forEach((g, i) => g.ids.forEach((k) => m.set(k, i))); return m; }, [dups]);
  /** gộp 1 nhóm trùng: giữ 1 dòng, điền các ô trống từ dòng khác, bỏ các dòng còn lại */
  function gopNhom(ids: string[], keepK: string) {
    const keep = rows.find((r) => r._k === keepK); if (!keep) return;
    const others = rows.filter((r) => ids.includes(r._k) && r._k !== keepK);
    const merged = { ...keep } as GridRow;
    for (const o of others) for (const f of FIELDS) if (!merged[f.key].trim() && o[f.key].trim()) merged[f.key] = o[f.key];
    if (!merged.pct_cu && others.some((o) => o.pct_cu)) merged.pct_cu = others.find((o) => o.pct_cu)!.pct_cu;
    setMergedTo((m) => [...m, ...others.filter((o) => o.id && keep.id).map((o) => ({ from: o.id!, to: keep.id!, name: o.ten_cong_ty }))]);
    setRows((prev) => prev.filter((r) => !others.some((o) => o._k === r._k)).map((r) => (r._k === keepK ? merged : r)));
  }
  const [keepSel, setKeepSel] = useState<Record<string, string>>({});

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
    dups.filter((g) => g.strong).forEach((g) => { g.ids.forEach((k) => bad.add(`${k}:ten_cong_ty`)); list.push(`Khách bị nhập ${g.ids.length} dòng (${g.label}): ${rows.find((r) => r._k === g.ids[0])?.ten_cong_ty ?? ''} — gộp để chỉ giữ 1 dòng`); });
    return { bad, list };
  }, [rows, dups]);

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
      // gộp dòng trùng: chuyển phần ghi nhớ tên của dòng bị bỏ sang dòng giữ lại (trước khi dòng bị xoá)
      for (const m of mergedTo) {
        try { await getSupabase().from('mlx_alias').update({ customer_id: m.to }).eq('customer_id', m.from); await saveAlias(m.name, m.to); } catch { /* chưa có bảng ghi nhớ: bỏ qua */ }
      }
      const kq = await saveCustomers(payload, original.ids);
      setMergedTo([]);
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
  const ORD: Record<CkKind, number> = { '': 0, CK4: 1, CK5: 2, DB: 3, SGS: 4, KHAC: 5 };
  const visible = rows
    .map((r, i) => ({ r, i, ck: ckOf(r.chiet_khau) }))
    .filter(({ r }) => !q || FIELDS.some((f) => companyKey(r[f.key]).includes(q)))
    .filter(({ r, ck }) => !fCk || (fCk === 'NONE' ? !isBlank(r) && !ck.kind : ck.kind === fCk))
    .filter(({ r }) => !fData || (fData === 'dup' ? dupOf.has(r._k) : fData === 'new' ? !r.id && !isBlank(r) : fData === 'nohd' ? !r.ma_hop_dong.trim() : fData === 'nokh' ? !r.ma_khach_hang.trim() : fData === 'nomst' ? !r.mst.trim() : fData === 'noaddr' ? !r.dia_chi.trim() : fData === 'noshort' ? !r.ten_viet_tat.trim() : true) && !isBlank(r))
    .sort((a, b) => !sortCk ? a.i - b.i : sortCk * (ORD[a.ck.kind] - ORD[b.ck.kind] || (a.ck.kind === 'DB' ? (parsePct(a.ck.x) || 0) - (parsePct(b.ck.x) || 0) : 0)) || a.i - b.i);
  const demLoai = (k: CkKind | 'NONE') => rows.filter((r) => !isBlank(r) && (k === 'NONE' ? !ckOf(r.chiet_khau).kind : ckOf(r.chiet_khau).kind === k)).length;

  /* ---- Template & upload master data (cùng cột với bảng) ---- */
  const HEAD = FIELDS.map((f) => f.label.replace(' *', ''));
  async function taiTemplate() {
    const ExcelJS = await loadExcelJS(); const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Master data');
    ws.addRow(HEAD); ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D6E63' } };
    [16, 16, 18, 48, 56, 16, 22].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    [1, 2, 6].forEach((c) => (ws.getColumn(c).numFmt = '@'));
    rows.filter((r) => !isBlank(r)).forEach((r) => ws.addRow(FIELDS.map((f) => r[f.key])));
    const hd = wb.addWorksheet('Huong dan');
    [['Cột', 'Cách nhập'], ['Tên công ty', 'Bắt buộc. Dòng có tên trùng (không phân biệt hoa/thường) hoặc cùng Mã hợp đồng sẽ được cập nhật, còn lại thêm mới.'],
     ['Chiết khấu', 'CK 4 · CK 5 · CK đặc biệt 7% (hoặc chỉ ghi 7) · SGS · Khác: <mô tả cách tính> · để trống = chưa chọn'],
     ['Ô để trống', 'Giữ nguyên giá trị đang có trên hệ thống'], ['Mã hợp đồng, MST', 'Định dạng Text để không mất số 0 đầu']].forEach((x) => hd.addRow(x));
    hd.getColumn(1).width = 20; hd.getColumn(2).width = 110; hd.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer(); const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = `Master_data_MLX_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
  }
  async function uploadMaster(file: File) {
    setUpMsg(null);
    try {
      const ExcelJS = await loadExcelJS(); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets.find((w) => /master/i.test(w.name)) ?? wb.worksheets[0];
      const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
      const txt = (v: unknown) => { if (v == null) return ''; if (typeof v === 'object' && v && 'text' in (v as object)) return String((v as { text: unknown }).text ?? '').trim(); if (typeof v === 'object' && v && 'result' in (v as object)) return String((v as { result: unknown }).result ?? '').trim(); return String(v).trim(); };
      let hr = 0; const col: Partial<Record<Field, number>> = {};
      for (let r = 1; r <= Math.min(10, ws.rowCount) && !hr; r++) { const m: Partial<Record<Field, number>> = {};
        ws.getRow(r).eachCell((c, ci) => { const h = fold(txt(c.value)); const f = FIELDS.find((x) => fold(x.label.replace(' *', '')) === h || (x.key === 'chiet_khau' && /chiet khau/.test(h))); if (f && !m[f.key]) m[f.key] = ci; });
        if (m.ten_cong_ty) { hr = r; Object.assign(col, m); } }
      if (!hr) throw new Error('Không thấy cột "Tên công ty". Hãy dùng file tải từ nút "Tải template".');
      const next = rows.filter((r) => !isBlank(r)).map((r) => ({ ...r }));
      const byHd = new Map(next.filter((r) => r.ma_hop_dong.trim()).map((r) => [r.ma_hop_dong.trim(), r])), byTen = new Map(next.map((r) => [r.ten_cong_ty.trim().toLowerCase(), r]));
      let sua = 0, them = 0, bo = 0;
      for (let r = hr + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r), v: Partial<Record<Field, string>> = {};
        (Object.keys(col) as Field[]).forEach((k) => (v[k] = txt(row.getCell(col[k]!).value)));
        if (!Object.values(v).some(Boolean)) continue;
        if (v.chiet_khau !== undefined && v.chiet_khau !== '') { const c = v.chiet_khau; v.chiet_khau = /^\d+([.,]\d+)?\s*%?$/.test(c) && parsePct(c) > 0 ? `CK đặc biệt ${c.replace('%', '').trim()}%` : ruleToText(parseRule(c)) || ''; }
        const ten = (v.ten_cong_ty || '').toLowerCase(), cur = (v.ma_hop_dong && byHd.get(v.ma_hop_dong)) || (ten && byTen.get(ten));
        if (cur) { let ch = false; (Object.keys(v) as Field[]).forEach((k) => { if (v[k] && v[k] !== cur[k]) { (cur as Record<Field, string>)[k] = v[k]!; ch = true; } }); if (ch) sua++; }
        else if (v.ten_cong_ty) { const nr = { ...emptyRow(), ...v } as GridRow; next.push(nr); byTen.set(ten, nr); if (nr.ma_hop_dong) byHd.set(nr.ma_hop_dong, nr); them++; }
        else bo++;
      }
      setRows(next.length ? next : [emptyRow()]);
      setUpMsg({ type: 'ok', text: `Đã đọc "${file.name}": cập nhật ${sua} khách, thêm ${them} khách${bo ? `, bỏ qua ${bo} dòng thiếu tên công ty` : ''}. Kiểm tra rồi bấm Lưu thay đổi.` });
    } catch (e) { setUpMsg({ type: 'err', text: (e as Error).message }); }
  }

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
            <select className={s.input} style={{ width: 'auto' }} value={fCk} onChange={(e) => setFCk(e.target.value as typeof fCk)} title="Lọc theo chiết khấu">
              <option value="">Chiết khấu: tất cả</option>
              <option value="NONE">Chưa chọn ({demLoai('NONE')})</option>
              <option value="CK4">CK 4 ({demLoai('CK4')})</option>
              <option value="CK5">CK 5 ({demLoai('CK5')})</option>
              <option value="DB">CK đặc biệt ({demLoai('DB')})</option>
              <option value="SGS">SGS ({demLoai('SGS')})</option>
              <option value="KHAC">Rule khác ({demLoai('KHAC')})</option>
            </select>
            <select className={s.input} style={{ width: 'auto' }} value={fData} onChange={(e) => setFData(e.target.value)} title="Lọc theo dữ liệu">
              <option value="">Dữ liệu: tất cả</option>
              <option value="dup">Bị trùng nhiều dòng ({dups.reduce((n, g) => n + g.ids.length, 0)})</option>
              <option value="nohd">Thiếu mã hợp đồng</option>
              <option value="nokh">Thiếu mã khách hàng</option>
              <option value="nomst">Thiếu MST</option>
              <option value="noaddr">Thiếu địa chỉ</option>
              <option value="noshort">Thiếu tên viết tắt</option>
              <option value="new">Dòng mới chưa lưu</option>
            </select>
            {(fCk || fData || search) && <button className={s.iconBtn} style={{ width: 'auto', textDecoration: 'underline' }} onClick={() => { setFCk(''); setFData(''); setSearch(''); }}>Xoá lọc</button>}
            <button className={s.btn} onClick={taiTemplate} disabled={tableMissing} title="Tải file Excel cùng cột với bảng, kèm dữ liệu hiện có">Tải template</button>
            <label className={s.btn} style={{ cursor: tableMissing ? 'default' : 'pointer' }} title="Upload file theo template: cập nhật khách có sẵn, thêm khách mới">
              Upload file
              <input type="file" accept=".xlsx" hidden disabled={tableMissing} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMaster(f); e.target.value = ''; }} />
            </label>
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
        {dups.length > 0 && (
          <div className={`${s.banner} ${s.bannerErr}`} style={{ marginBottom: 12 }}>
            <b>{dups.filter((g) => g.strong).length} khách bị nhập thành nhiều dòng</b>{dups.some((g) => !g.strong) ? ` · ${dups.filter((g) => !g.strong).length} nhóm nghi trùng (cùng tên, khác mã hợp đồng)` : ''} — mỗi khách chỉ giữ 1 dòng, nếu không bảng kê sẽ bị tách nhiều file.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {dups.map((g) => { const R = g.ids.map((k) => rows.find((r) => r._k === k)!).filter(Boolean), gid = [...g.ids].sort().join('|'), keepK = keepSel[gid] ?? bestOf(R)._k;
                return (
                  <div key={gid} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: '#fff', borderRadius: 8, padding: '6px 8px', color: 'inherit' }}>
                    <span style={{ fontWeight: 600, color: g.strong ? '#c81e1e' : '#b45309' }}>{g.strong ? 'Trùng' : 'Nghi trùng'} · {g.label}:</span>
                    <span>Giữ dòng</span>
                    <select className={s.input} style={{ width: 'auto', maxWidth: 520 }} value={keepK} onChange={(e) => setKeepSel((m) => ({ ...m, [gid]: e.target.value }))}>
                      {R.map((r) => <option key={r._k} value={r._k}>{[r.ma_hop_dong, r.ma_khach_hang, r.ten_cong_ty].filter(Boolean).join(' · ')}</option>)}
                    </select>
                    <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => gopNhom(g.ids, keepK)}>Gộp, giữ 1 dòng</button>
                    {!g.strong && <button className={s.btn} onClick={() => { const n = [...weakOk, gid]; setWeakOk(n); try { localStorage.setItem('mlx_dup_ok', JSON.stringify(n)); } catch { /* */ } }}>Không phải trùng</button>}
                    <button className={s.iconBtn} style={{ width: 'auto', textDecoration: 'underline' }} onClick={() => { setFData('dup'); setSearch(''); }}>Xem các dòng</button>
                  </div>); })}
            </div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Gộp: giữ dòng được chọn, các ô trống được điền từ dòng còn lại, tên của dòng bị bỏ được ghi nhớ để file upload sau vẫn khớp vào dòng giữ lại. Bấm Lưu thay đổi để ghi.</div>
          </div>
        )}
        {upMsg && (
          <div className={`${s.banner} ${upMsg.type === 'ok' ? s.bannerOk : s.bannerErr}`} style={{ marginBottom: 12 }}>
            {upMsg.text}
          </div>
        )}
        {nChua > 0 && fCk !== 'NONE' && (
          <div className={`${s.banner} ${s.bannerErr}`} style={{ marginBottom: 12, background: '#fff7e6', color: '#8a6200', borderColor: '#f3d48a' }}>
            {nChua} khách chưa chọn chiết khấu (tô vàng bên dưới) — đang dùng % cũ hoặc tra bảng phân loại khi lập bảng kê.{' '}
            <button className={s.iconBtn} style={{ width: 'auto', textDecoration: 'underline' }} onClick={() => setFCk('NONE')}>Chỉ xem khách chưa chọn</button>
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
                    <th key={f.key} style={{ minWidth: f.width, textAlign: f.numeric ? 'right' : 'left', cursor: f.key === 'chiet_khau' ? 'pointer' : undefined }}
                      onClick={f.key === 'chiet_khau' ? () => setSortCk((x) => (x === 0 ? 1 : x === 1 ? -1 : 0)) : undefined}
                      title={f.key === 'chiet_khau' ? 'Bấm để sắp xếp theo chiết khấu' : undefined}>
                      {f.label}{f.key === 'chiet_khau' ? (sortCk === 1 ? ' ▲' : sortCk === -1 ? ' ▼' : ' ⇅') : ''}
                    </th>
                  ))}
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {visible.map(({ r, i, ck }) => (
                  <tr key={r._k} style={dupOf.has(r._k) ? { background: dups[dupOf.get(r._k)!].strong ? '#fdecec' : '#fff4e5', boxShadow: `inset 3px 0 0 ${dups[dupOf.get(r._k)!].strong ? '#e83c3f' : '#e8a600'}` } : !isBlank(r) && !ck.kind ? { background: '#fff7e6', boxShadow: 'inset 3px 0 0 #e8a600' } : undefined}>
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
