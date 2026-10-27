// Bảng phân loại chiết khấu (mlx_loai_ck): nạp từ file THOP_AR02 "C NGUYET", tra loại CK cho từng khách.
import type ExcelJS from 'exceljs';
import { getSupabase } from './supabase';
import type { MlxCustomer } from './types';
import { parseRule, type Rule } from './discount';

export type LoaiCkRow = { so_hd_cms: string; so_hd_cu: string; ten_kh: string; mst: string; loai_ck: string };
const TABLE = 'mlx_loai_ck';
const t = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const digits = (v: unknown) => t(v).replace(/[^\d-]/g, '');
const missing = (m: string) => /mlx_loai_ck|does not exist|schema cache|PGRST205|42P01/i.test(m);
export const LOAI_CK_MIGRATE = 'Chưa có bảng phân loại chiết khấu — chạy supabase/migrations/26_mlx_loai_ck.sql trong SQL Editor của Supabase.';

export async function loadLoaiCk(): Promise<LoaiCkRow[]> {
  const out: LoaiCkRow[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await getSupabase().from(TABLE).select('so_hd_cms,so_hd_cu,ten_kh,mst,loai_ck').order('so_hd_cms').range(from, from + 999);
    if (error) throw new Error(missing(error.message) ? LOAI_CK_MIGRATE : error.message);
    out.push(...((data ?? []) as LoaiCkRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Đọc file phân loại: tìm dòng tiêu đề có SO_HD CMS; cột loại CK = cột ngay sau MA_SO_THUE (cột E) */
export async function parseLoaiCkFile(ExcelJSLib: typeof ExcelJS, buf: ArrayBuffer): Promise<LoaiCkRow[]> {
  const wb = new ExcelJSLib.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets.find((w) => /nguyet/i.test(w.name)) ?? wb.worksheets[0];
  const f = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let head = 0, cCu = 0, cCms = 0, cTen = 0, cMst = 0, cCk = 0;
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !head; r++) ws.getRow(r).eachCell((cell, c) => {
    const h = f(t(cell.value));
    if (h === 'so hd cms') { head = r; cCms = c; } else if (h === 'so hd cu') cCu = c; else if (h === 'ten kh') cTen = c; else if (h === 'ma so thue') cMst = c; else if (/loai ck|chiet khau/.test(h)) cCk = c;
  });
  if (!head) throw new Error('Không thấy cột "SO_HD CMS" trong file phân loại.');
  if (!cCk) cCk = (cMst || cCms) + 1;
  const by = new Map<string, LoaiCkRow>();
  for (let r = head + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r), v = (c: number) => (c ? row.getCell(c).value : null);
    const cms = digits(v(cCms)); if (!cms) continue;
    by.set(cms, { so_hd_cms: cms, so_hd_cu: t(v(cCu)), ten_kh: t(v(cTen)), mst: digits(v(cMst)), loai_ck: t(v(cCk)) });
  }
  return [...by.values()];
}

export async function saveLoaiCk(rows: LoaiCkRow[]): Promise<number> {
  const sb = getSupabase(), now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(TABLE).upsert(rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: now })), { onConflict: 'so_hd_cms' });
    if (error) throw new Error(missing(error.message) ? LOAI_CK_MIGRATE : error.message);
  }
  return rows.length;
}

export type CkLookup = { rule: Rule | null; row: LoaiCkRow | null; via: 'hop_dong' | 'ma_kh' | 'mst' | null; note?: string };
/** Tra loại CK cho 1 khách: mã hợp đồng → mã khách hàng (SO_HD_CU) → MST có đúng 1 hợp đồng */
export function makeLookup(table: LoaiCkRow[]) {
  const byCms = new Map(table.map((r) => [r.so_hd_cms, r]));
  const byCu = new Map<string, LoaiCkRow>(), byMst = new Map<string, LoaiCkRow[]>();
  table.forEach((r) => { if (r.so_hd_cu) byCu.set(r.so_hd_cu.toUpperCase(), r); if (r.mst) (byMst.get(r.mst) ?? byMst.set(r.mst, []).get(r.mst)!).push(r); });
  return (c: MlxCustomer): CkLookup => {
    const hd = digits(c.ma_hop_dong), kh = t(c.ma_khach_hang).toUpperCase(), mst = digits(c.mst);
    let row = (hd && byCms.get(hd)) || null, via: CkLookup['via'] = row ? 'hop_dong' : null;
    if (!row && kh) { row = byCu.get(kh) || null; if (row) via = 'ma_kh'; }
    let note: string | undefined;
    if (!row && mst) { const L = byMst.get(mst) || []; if (L.length === 1) { row = L[0]; via = 'mst'; } else if (L.length > 1) note = `MST ${mst} có ${L.length} hợp đồng trong bảng phân loại — cần nhập đúng mã hợp đồng ở master data`; }
    return { rule: row ? parseRule(row.loai_ck) : null, row, via, note };
  };
}
