// Tên gọi khác của nhà cung cấp: cùng một NCC nhưng file đối soát / hệ thống / sổ phải trả ghi khác nhau.
// Mã NCC chuẩn = mã đang có trong danh mục NCC (fin_suppliers) nếu khớp một tên trong nhóm, không thì mã đầu nhóm.
import type { Supplier } from "./types";

export const NCC_ALIAS: string[][] = [
  ["HNH", "HỒNG NGỌC HÀ", "HONG NGOC HA", "CÔNG TY TNHH HỒNG NGỌC HÀ"],
];
const nk = (s: string | null | undefined) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Mã NCC chuẩn cho một mã / tên NCC */
export function canonNcc(suppliers: Pick<Supplier, "ma_ncc" | "ten_ncc">[], code: string): string {
  const k = nk(code);
  const grp = NCC_ALIAS.find((g) => g.some((n) => nk(n) === k));
  if (!grp) return code;
  const keys = new Set(grp.map(nk));
  const s = suppliers.find((x) => keys.has(nk(x.ma_ncc)) || keys.has(nk(x.ten_ncc)));
  return s ? s.ma_ncc : grp[0];
}
/** Hai mã / tên có cùng là một NCC không */
export const sameNcc = (suppliers: Pick<Supplier, "ma_ncc" | "ten_ncc">[], a: string, b: string) => canonNcc(suppliers, a) === canonNcc(suppliers, b) || nk(a) === nk(b);

/** File đối soát đôi khi đảo ngày/tháng ở các ngày ≤ 12 (vd. 01/10 ghi thành 2026-01-10).
 *  Lấy khoảng ngày của các dòng chắc chắn đúng (ngày > 12); dòng nào nằm ngoài khoảng đó mà đảo lại thì nằm trong → đảo lại. */
export function fixSwappedDates(ds: (string | null)[]): (string | null)[] {
  const sure = ds.filter((d): d is string => !!d && Number(d.slice(8, 10)) > 12).sort();
  if (sure.length < 3) return ds;
  const lo = Date.parse(sure[0]) - 10 * 864e5, hi = Date.parse(sure[sure.length - 1]) + 10 * 864e5;
  return ds.map((d) => {
    if (!d || Number(d.slice(8, 10)) > 12) return d;
    const t = Date.parse(d);
    if (t >= lo && t <= hi) return d;
    const sw = `${d.slice(0, 4)}-${d.slice(8, 10)}-${d.slice(5, 7)}`, ts = Date.parse(sw);
    return isFinite(ts) && ts >= lo && ts <= hi ? sw : d;
  });
}
