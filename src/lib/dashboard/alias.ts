// Tên gọi khác của nhà cung cấp: cùng một NCC nhưng file đối soát / hệ thống / sổ phải trả ghi khác nhau.
// Mã NCC chuẩn = mã đang có trong danh mục NCC (fin_suppliers) nếu khớp một tên trong nhóm, không thì mã đầu nhóm.
import type { Supplier } from "./types";

/** Mã NCC tổng hợp của khách sạn lẻ */
export const XPERISE_MANUAL = "XPERISE_MANUAL";
/** Mã NCC chuẩn của một dòng nguồn giá vốn / phải trả (file chi khách sạn trực tiếp B1 → Xperise_Manual) */
export function nccOfSrc(suppliers: Pick<Supplier, "ma_ncc" | "ten_ncc">[], r: { ncc: string | null; khop: string | null }): string {
  if (String(r.khop || "").startsWith("B1:")) return XPERISE_MANUAL;
  return r.ncc ? canonNcc(suppliers, r.ncc.replace(/^(hotel|flight):/, "")) : "Chưa rõ NCC";
}

export const NCC_ALIAS: string[][] = [
  // HNH_Manual: TA check phòng và trả tiền cho HNH (Hồng Ngọc Hà)
  ["HNH_MANUAL", "HNH", "HNH_HOTEL", "HỒNG NGỌC HÀ", "HONG NGOC HA", "CÔNG TY TNHH HỒNG NGỌC HÀ"],
  // Xperise_Manual: khách sạn lẻ — TA check phòng trực tiếp và trả thẳng khách sạn
  // (file chi khách sạn trực tiếp B1, NCC "XPERISE" trên hệ thống, mã hợp đồng trực tiếp "XPERISE:<mã khách sạn>")
  [XPERISE_MANUAL, "XPERISE", "XPERISE_HOTEL", "KS_TRUC_TIEP", "KHÁCH SẠN TRỰC TIẾP (B1)"],
];
/** Tên hiển thị của hai nguồn NCC hotel tổng hợp */
export const NCC_TEN: Record<string, string> = {
  HNH_MANUAL: "HNH_Manual — Hồng Ngọc Hà (TA check & trả HNH)",
  [XPERISE_MANUAL]: "Xperise_Manual — khách sạn lẻ (TA check & trả khách sạn)",
};
const nk = (s: string | null | undefined) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Mã NCC chuẩn cho một mã / tên NCC */
export function canonNcc(suppliers: Pick<Supplier, "ma_ncc" | "ten_ncc">[], code: string): string {
  // hợp đồng trực tiếp với khách sạn = khách sạn lẻ (đã gán về NCC của bảng kê nếu nằm trên bảng kê NCC khác)
  if (/^XPERISE:\d+$/i.test(String(code || "").trim())) return XPERISE_MANUAL;
  const k = nk(code);
  const grp = NCC_ALIAS.find((g) => g.some((n) => nk(n) === k));
  if (!grp) return code;
  if (grp[0] === XPERISE_MANUAL) return XPERISE_MANUAL;
  const keys = new Set(grp.map(nk));
  const s = suppliers.find((x) => keys.has(nk(x.ma_ncc)) || keys.has(nk(x.ten_ncc)));
  return s ? s.ma_ncc : grp[0];
}
/** Hai mã / tên có cùng là một NCC không */
export const sameNcc = (suppliers: Pick<Supplier, "ma_ncc" | "ten_ncc">[], a: string, b: string) => canonNcc(suppliers, a) === canonNcc(suppliers, b) || nk(a) === nk(b);

/** Tên hiển thị của NCC thuộc một nguồn tổng hợp (HNH_Manual / Xperise_Manual), theo mã hoặc tên gọi khác */
export function nccTen(code: string, suppliers: Pick<Supplier, "ma_ncc" | "ten_ncc">[] = []): string | undefined {
  if (NCC_TEN[code]) return NCC_TEN[code];
  const ten = suppliers.find((x) => x.ma_ncc === code)?.ten_ncc;
  const keys = [nk(code), nk(ten)];
  const grp = NCC_ALIAS.find((g) => g.some((n) => keys.includes(nk(n))));
  return grp ? NCC_TEN[grp[0]] : undefined;
}
