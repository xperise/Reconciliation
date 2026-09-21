'use client';

import { useEffect, useMemo, useState } from 'react';
import s from './mlx.module.css';
import { loadCustomers, saveCustomers, TableMissingError } from '@/lib/mlx/masterData';
import { companyKey } from '@/lib/mlx/normalize';
import type { MlxCustomer } from '@/lib/mlx/types';

type Field = 'ma_khach_hang' | 'ma_hop_dong' | 'ten_cong_ty' | 'ten_viet_tat' | 'dia_chi' | 'mst' | 'chiet_khau';
type GridRow = { _k: string; id?: string; ma_khach_hang: string; ma_hop_dong: string; ten_cong_ty: string; ten_viet_tat: string; dia_chi: string; mst: string; chiet_khau: string };

const FIELDS: { key: Field; label: string; width: number; numeric?: boolean }[] = [
  { key: 'ma_khach_hang', label: 'Mã khách hàng', width: 120 },
  { key: 'ma_hop_dong', label: 'Mã hợp đồng', width: 120 },
  { key: 'ten_viet_tat', label: 'Tên viết tắt', width: 140 },
  { key: 'ten_cong_ty', label: 'Tên công ty *', width: 340 },
  { key: 'dia_chi', label: 'Địa chỉ', width: 420 },
  { key: 'mst', label: 'MST', width: 140 },
  { key: 'chiet_khau', label: '% Chiết khấu', width: 110, numeric: true },
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
  chiet_khau: c.chiet_khau ? String(c.chiet_khau) : '0',
});
const emptyRow = (): GridRow => ({ _k: newKey(), ma_khach_hang: '', ma_hop_dong: '', ten_cong_ty: '', ten_viet_tat: '', dia_chi: '', mst: '', chiet_khau: '0' });

/** "5", "5%", "5,5" → 5 / 5.5 ; không hợp lệ → NaN */
function parsePct(v: string): number {
  const t = v.replace('%', '').replace(',', '.').trim();
  if (t === '') return 0;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const isBlank = (r: GridRow) => FIELDS.every((f) => (f.key === 'chiet_khau' ? parsePct(r[f.key]) === 0 : !r[f.key].trim()));
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
      const pct = parsePct(r.chiet_khau);
      if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        bad.add(`${r._k}:chiet_khau`);
        list.push(`Dòng ${i + 1}: % chiết khấu phải là số từ 0 đến 100`);
      }
      const key = companyKey(r.ten_cong_ty);
      if (key) {
        if (seen.has(key)) {
          bad.add(`${r._k}:ten_cong_ty`);
          list.push(`Dòng ${i + 1}: trùng tên công ty với dòng ${seen.get(key)! + 1}`);
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
          if (f) row[f.key] = val.trim();
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
          chiet_khau: parsePct(r.chiet_khau),
        }));
      await saveCustomers(payload, original.ids);
      await reload();
      setMsg({ type: 'ok', text: `Đã lưu ${payload.length} khách hàng.` });
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

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.cardHead}>
          <div>
            <div className={s.eyebrow}>Master data</div>
            <h2 className={s.title}>Khách hàng MLX</h2>
            <div className={s.note}>
              {rows.filter((r) => !isBlank(r)).length} khách · Tên file xuất = Mã hợp đồng_Tên công ty · Copy dữ liệu từ Excel rồi dán vào ô bất kỳ (theo thứ tự cột
              bên dưới) · % chiết khấu nhập 5 = 5%
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
                    {FIELDS.map((f, fi) => (
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
