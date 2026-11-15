// Tải master data Travel & SaaS về Excel — số đúng như dashboard đang dùng (đã gộp số sửa tay trên web),
// kèm dòng gốc của các file nguồn đã nạp. Tiền để số VND gốc; Net revenue, Margin, Còn lại là công thức.
import type { Ctx } from "./calc";
import { SEG_DV, segOfCustomer } from "./calc";
import { kyIdx, todayIso } from "./util";

/* SheetJS — chỉ phần dùng ở đây */
interface WS { [cell: string]: unknown; "!cols"?: { wch: number }[]; "!autofilter"?: { ref: string }; "!freeze"?: unknown; "!ref"?: string }
interface XLib {
  utils: {
    aoa_to_sheet(rows: unknown[][], o?: { cellDates?: boolean; dateNF?: string }): WS;
    book_new(): { SheetNames: string[]; Sheets: Record<string, WS> };
    book_append_sheet(wb: unknown, ws: WS, name: string): void;
    encode_cell(c: { r: number; c: number }): string;
    encode_range(r: { s: { r: number; c: number }; e: { r: number; c: number } }): string;
  };
  writeFile(wb: unknown, name: string, o?: { compression?: boolean }): void;
}
async function lib(): Promise<XLib> {
  const m = (await import("xlsx")) as unknown as Partial<XLib> & { default?: XLib };
  return (typeof m.writeFile === "function" ? m : m.default) as XLib;
}

type Col = { h: string; w?: number; t?: "money" | "date" | "pct" | "int" | "text"; f?: (r: number, col: (h: string) => string) => string };
/** Ngày → số ngày Excel (không lệch múi giờ) */
const dateOf = (s: unknown) => { const v = typeof s === "string" ? s : ""; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5 : v || null; };
const numOf = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** Một sheet: dòng tiêu đề + dữ liệu, định dạng số / ngày / %, công thức theo dòng, lọc và cố định dòng đầu */
function sheet(X: XLib, cols: Col[], rows: unknown[][]): WS {
  const aoa = [cols.map((c) => c.h), ...rows.map((r) => r.map((v, i) => (cols[i].t === "date" ? dateOf(v) : cols[i].t === "money" || cols[i].t === "int" ? numOf(v) : v ?? null)))];
  const ws = X.utils.aoa_to_sheet(aoa);
  const letter = (i: number) => X.utils.encode_cell({ r: 0, c: i }).replace(/\d+$/, "");
  const colOf = (h: string) => letter(cols.findIndex((c) => c.h === h));
  for (let r = 1; r <= rows.length; r++) {
    cols.forEach((c, i) => {
      const a = X.utils.encode_cell({ r, c: i });
      if (c.f) ws[a] = { t: "n", f: c.f(r + 1, colOf) };
      const cell = ws[a] as { z?: string } | undefined;
      if (!cell) return;
      if (c.t === "money") cell.z = "#,##0";
      else if (c.t === "int") cell.z = "0";
      else if (c.t === "pct") cell.z = "0.00%";
      else if (c.t === "date") cell.z = "dd/mm/yyyy";
    });
  }
  ws["!cols"] = cols.map((c) => ({ wch: c.w || Math.max(10, Math.min(40, c.h.length + 2)) }));
  if (rows.length) ws["!autofilter"] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: cols.length - 1 } }) };
  return ws;
}

export interface SrcLines { kh: Record<string, unknown>[]; ncc: Record<string, unknown>[] }

export async function exportTravel(C: Ctx, src: SrcLines): Promise<string> {
  const X = await lib();
  const D = C.D, wb = X.utils.book_new();
  const isTs = (ma: string) => segOfCustomer(D, ma) === "ts";
  const cust = (ma: string) => C.cust.get(ma);
  const sup = new Map(D.suppliers.map((s) => [s.ma_ncc, s]));
  const mobNcc = new Set(D.suppliers.filter((s) => s.nganh === "Mobility").map((s) => s.ma_ncc));
  const byKy = (a: { ky?: string | null }, b: { ky?: string | null }) => kyIdx(String(a.ky || "")) - kyIdx(String(b.ky || ""));

  /* README */
  const readme = [
    ["Master data Travel & SaaS", ""], ["Xuất lúc", new Date().toLocaleString("vi-VN")], ["Số liệu chốt", C.asOf], ["", ""],
    ["Sheet", "Nội dung"],
    ["GMV_theo_ngay", "GMV, giá vốn theo ngày × khách × NCC × mảng — số dashboard dùng. Net revenue = GMV có giá vốn − giá vốn; Margin = Net revenue ÷ GMV có giá vốn (công thức)"],
    ["Bang_ke_KH", "Dòng gốc bảng kê khách hàng đã nạp: hotel, flight, Transportation (Be). GMV = Tổng thành tiền"],
    ["Gia_von_NCC", "Dòng gốc nguồn giá vốn: đối soát NCC, chi khách sạn trực tiếp B1, giá NCC trên hệ thống. Thứ tự ưu tiên khi nối bảng kê: đối soát → B1 → hệ thống"],
    ["Cong_no_phai_thu", "Công nợ phải thu khách Travel & SaaS theo hóa đơn, đã gộp số sửa trên web. Ở kỳ đã có bảng kê: phải thu = GMV bảng kê (quy theo tỷ trọng từng hóa đơn; chưa có hóa đơn thì một dòng không số HĐ), đã thu theo sổ phải thu. Còn lại là công thức"],
    ["Cong_no_phai_tra", "Sổ công nợ phải trả NCC Travel & SaaS (không gồm NCC Mobility)"],
    ["DM_Khach_hang", "Danh mục khách hàng Travel & SaaS"], ["DM_NCC", "Danh mục nhà cung cấp + mã NCC có phát sinh nhưng chưa có trong danh mục"],
    ["Ke_hoach", "Kế hoạch GMV và số khách Travel & SaaS theo kỳ"], ["", ""], ["Tiền", "VND, số gốc không làm tròn"],
  ];
  X.utils.book_append_sheet(wb, sheet(X, [{ h: "Mục", w: 22 }, { h: "Giá trị", w: 110 }], readme.slice(1).map((r) => r)), "README");

  /* GMV theo ngày */
  const gmv = D.gmv.filter((r) => SEG_DV.ts.includes(r.dich_vu)).slice().sort((a, b) => byKy(a, b) || String(a.ngay || "").localeCompare(String(b.ngay || "")) || a.ma_kh.localeCompare(b.ma_kh));
  X.utils.book_append_sheet(wb, sheet(X, [
    { h: "Kỳ", w: 10 }, { h: "Ngày", t: "date", w: 12 }, { h: "Mã KH", w: 14 }, { h: "Tên KH", w: 30 }, { h: "Nhóm đối soát", w: 18 }, { h: "Nhóm", w: 7 }, { h: "PM", w: 12 },
    { h: "Mã NCC", w: 18 }, { h: "Mảng", w: 15 }, { h: "Nguồn", w: 12 },
    { h: "GMV", t: "money", w: 16 }, { h: "GMV có giá vốn", t: "money", w: 16 }, { h: "Giá vốn", t: "money", w: 16 },
    { h: "Net revenue", t: "money", w: 15, f: (r, c) => `${c("GMV có giá vốn")}${r}-${c("Giá vốn")}${r}` },
    { h: "Margin", t: "pct", w: 10, f: (r, c) => `IF(${c("GMV có giá vốn")}${r}=0,"",${c("Net revenue")}${r}/${c("GMV có giá vốn")}${r})` },
  ], gmv.map((r) => {
    const c = cust(r.ma_kh);
    return [r.ky, r.ngay || null, r.ma_kh, c?.ten_viet_tat || c?.ten_kh || r.ma_kh, D.grp?.[r.ma_kh]?.ten || "", c?.nhom || "", c?.pm || "", r.ma_ncc || "", r.dich_vu === "Transportation" ? "Transportation (Be)" : r.dich_vu,
      r.nguon === "bk" ? "Bảng kê" : r.tay ? "Nhập tay" : "File template", r.gmv, r.gmv_co_gv == null ? r.gmv : r.gmv_co_gv, r.gia_von, null, null];
  })), "GMV_theo_ngay");

  /* Bảng kê khách hàng */
  const LOAI: Record<string, string> = { hotel: "Hotel", flight: "Flight", transport: "Transportation (Be)" };
  const kh = src.kh.slice().sort((a, b) => String(a.ngay).localeCompare(String(b.ngay)));
  X.utils.book_append_sheet(wb, sheet(X, [
    { h: "Mảng", w: 15 }, { h: "Kỳ", w: 10 }, { h: "Ngày giao dịch", t: "date", w: 13 }, { h: "Tên công ty", w: 30 }, { h: "Trạng thái", w: 12 },
    { h: "Mã giao dịch / Session", w: 22 }, { h: "Mã chiều về", w: 12 }, { h: "Số vé", w: 16 }, { h: "Số hóa đơn", w: 12 },
    { h: "Thành tiền", t: "money", w: 14 }, { h: "Tổng thành tiền (GMV)", t: "money", w: 16 }, { h: "Chiết khấu", t: "money", w: 12 }, { h: "Phí dịch vụ", t: "money", w: 12 },
    { h: "Khách", w: 24 }, { h: "Mô tả", w: 36 }, { h: "File", w: 30 },
  ], kh.map((r) => [LOAI[String(r.loai)] || r.loai, r.ky, r.ngay, r.ten_cong_ty, r.trang_thai, r.ma_gd, r.ma_gd2, r.so_ve, r.so_hd, r.gmv, r.tong_tt ? r.tong_tt : Number(r.gmv || 0) + Number(r.phi_dv || 0) - Number(r.chiet_khau || 0), r.chiet_khau, r.phi_dv, r.khach, r.mo_ta, r.file_name])), "Bang_ke_KH");

  /* Nguồn giá vốn */
  const nguon = (k: unknown) => { const s = String(k || ""); return s.startsWith("HT:") ? "Giá NCC hệ thống" : s.startsWith("B1:") ? "Chi KS trực tiếp B1" : "Đối soát NCC"; };
  const ncc = src.ncc.slice().sort((a, b) => nguon(a.khop).localeCompare(nguon(b.khop)) || String(a.ngay_dv || "").localeCompare(String(b.ngay_dv || "")));
  X.utils.book_append_sheet(wb, sheet(X, [
    { h: "Nguồn", w: 18 }, { h: "NCC", w: 26 }, { h: "Ngành", w: 9 }, { h: "Mã booking", w: 22 }, { h: "Số vé", w: 16 }, { h: "Khách", w: 24 },
    { h: "Ngày dịch vụ", t: "date", w: 12 }, { h: "Kỳ", w: 10 }, { h: "Số tiền NCC (giá vốn)", t: "money", w: 16 }, { h: "Ledger / giá bán hệ thống", t: "money", w: 16 },
    { h: "Khớp / trạng thái", w: 22 }, { h: "Xử lý", w: 16 }, { h: "Mô tả", w: 36 }, { h: "Dòng / mã đề xuất", w: 16 }, { h: "File", w: 30 },
  ], ncc.map((r) => [nguon(r.khop), String(r.ncc || "").replace(/^(hotel|flight):/, ""), r.nganh, r.ma_booking, r.so_ve, r.khach, r.ngay_dv, r.ky, r.bang_ke, r.ledger,
    String(r.khop || "").replace(/^(HT|B1): /, ""), r.xu_ly, r.mo_ta, r.dong, r.file_name])), "Gia_von_NCC");

  /* Công nợ phải thu */
  const ar = D.ar.filter((r) => isTs(r.ma_kh)).slice().sort((a, b) => a.ma_kh.localeCompare(b.ma_kh) || byKy(a, b));
  X.utils.book_append_sheet(wb, sheet(X, [
    { h: "Mã KH", w: 14 }, { h: "Tên KH", w: 28 }, { h: "Nhóm đối soát", w: 18 }, { h: "Nhóm", w: 7 }, { h: "PM", w: 12 }, { h: "Kỳ nợ", w: 10 }, { h: "Số hóa đơn", w: 12 },
    { h: "Ngày hóa đơn", t: "date", w: 12 }, { h: "Ngày gửi bảng kê", t: "date", w: 14 }, { h: "Ngày đến hạn", t: "date", w: 12 },
    { h: "Phải thu", t: "money", w: 15 }, { h: "Đã thu", t: "money", w: 15 }, { h: "Còn lại", t: "money", w: 15, f: (r, c) => `${c("Phải thu")}${r}-${c("Đã thu")}${r}` },
    { h: "Ngày thu đủ", t: "date", w: 12 }, { h: "Ngày thu gần nhất", t: "date", w: 14 },
    { h: "Số ngày quá hạn", t: "int", w: 12, f: (r, c) => `IF(${c("Còn lại")}${r}<=0,"",MAX(0,DATE(${C.asOf.slice(0, 4)},${+C.asOf.slice(5, 7)},${+C.asOf.slice(8, 10)})-${c("Ngày đến hạn")}${r}))` },
    { h: "Sửa trên web", w: 10 }, { h: "Ghi chú", w: 30 },
  ], ar.map((r) => { const c = cust(r.ma_kh); return [r.ma_kh, c?.ten_viet_tat || c?.ten_kh || r.ma_kh, D.grp?.[r.ma_kh]?.ten || "", c?.nhom || "", c?.pm || "", r.ky, r.so_ct, r.ngay_hd, r.ngay_gui_bk, r.ngay_den_han,
    r.so_tien, r.da_thu || 0, null, r.ngay_thu_du, r.ngay_thu_gan_nhat, null, r.suaTay || r.suaKy ? "Có" : "", r.ghi_chu || ""]; })), "Cong_no_phai_thu");

  /* Công nợ phải trả */
  const ap = D.ap.filter((r) => !mobNcc.has(r.ma_ncc)).slice().sort((a, b) => a.ma_ncc.localeCompare(b.ma_ncc) || byKy(a, b));
  X.utils.book_append_sheet(wb, sheet(X, [
    { h: "Mã NCC", w: 14 }, { h: "Tên NCC", w: 26 }, { h: "Ngành", w: 9 }, { h: "Payment term", t: "int", w: 12 }, { h: "Kỳ", w: 10 }, { h: "Số chứng từ", w: 14 },
    { h: "Ngày hóa đơn", t: "date", w: 12 }, { h: "Ngày đến hạn", t: "date", w: 12 }, { h: "Phải trả", t: "money", w: 15 }, { h: "Đã trả", t: "money", w: 15 },
    { h: "Còn lại", t: "money", w: 15, f: (r, c) => `${c("Phải trả")}${r}-${c("Đã trả")}${r}` }, { h: "Ngày trả", t: "date", w: 12 }, { h: "Ghi chú", w: 30 },
  ], ap.map((r) => { const s = sup.get(r.ma_ncc); return [r.ma_ncc, s?.ten_ncc || r.ma_ncc, s?.nganh || "", s?.payment_term ?? null, r.ky, r.so_ct, r.ngay_hd, r.ngay_den_han, r.so_tien, r.da_tra || 0, null, r.ngay_tra, r.ghi_chu || ""]; })), "Cong_no_phai_tra");

  /* Danh mục khách hàng */
  const khTs = D.customers.filter((c) => isTs(c.ma_kh)).slice().sort((a, b) => a.ma_kh.localeCompare(b.ma_kh));
  const khSet = new Set(khTs.map((c) => c.ma_kh));
  const extra = Array.from(new Set(gmv.map((r) => r.ma_kh))).filter((m) => !khSet.has(m));
  X.utils.book_append_sheet(wb, sheet(X, [
    { h: "Mã KH", w: 16 }, { h: "Tên khách hàng", w: 44 }, { h: "Tên viết tắt", w: 22 }, { h: "Nhóm đối soát", w: 18 }, { h: "Nhóm", w: 7 }, { h: "PM", w: 12 }, { h: "Sales", w: 12 }, { h: "Credit term", t: "int", w: 11 }, { h: "Ghi chú", w: 34 },
  ], [...khTs.map((c) => [c.ma_kh, c.ten_kh, c.ten_viet_tat || "", D.grp?.[c.ma_kh]?.ten || "", c.nhom, c.pm || "", c.sales || "", c.credit_term ?? null, ""]),
    ...extra.map((m) => [m, m, "", "", "", "", "", null, "Có GMV nhưng chưa có trong danh mục"])]), "DM_Khach_hang");

  /* Danh mục NCC */
  const nccCodes = new Set<string>([...gmv.map((r) => r.ma_ncc || "").filter(Boolean), ...src.ncc.map((r) => String(r.ncc || "").replace(/^(hotel|flight):/, "")).filter(Boolean)]);
  const supTs = D.suppliers.filter((s) => s.nganh !== "Mobility");
  const supSet = new Set(supTs.map((s) => s.ma_ncc));
  X.utils.book_append_sheet(wb, sheet(X, [
    { h: "Mã NCC", w: 26 }, { h: "Tên NCC", w: 30 }, { h: "Ngành", w: 10 }, { h: "Payment term", t: "int", w: 12 }, { h: "Partnership", w: 14 }, { h: "Ghi chú", w: 40 },
  ], [...supTs.map((s) => [s.ma_ncc, s.ten_ncc, s.nganh, s.payment_term ?? null, s.partnership || "", ""]),
    ...Array.from(nccCodes).filter((k) => !supSet.has(k)).sort().map((k) => [k, k, "", null, "", "Có trong bảng kê / đối soát, chưa có trong danh mục (chưa có payment term)"])]), "DM_NCC");

  /* Kế hoạch */
  X.utils.book_append_sheet(wb, sheet(X, [
    { h: "Kỳ", w: 10 }, { h: "GMV Hotel", t: "money", w: 15 }, { h: "GMV Flight", t: "money", w: 15 }, { h: "GMV SaaS Travel", t: "money", w: 15 }, { h: "GMV F&B", t: "money", w: 13 },
    { h: "Tổng GMV kế hoạch", t: "money", w: 17, f: (r, c) => `SUM(${c("GMV Hotel")}${r}:${c("GMV F&B")}${r})` }, { h: "Số khách N1", t: "int", w: 12 },
  ], D.targets.slice().sort(byKy).map((t) => [t.ky, t.gmv_hotel, t.gmv_flight, t.gmv_saas_t, t.gmv_fnb, null, t.kh_n1])), "Ke_hoach");

  const name = `Master_data_Travel_SaaS_${todayIso().replace(/-/g, "")}.xlsx`;
  X.writeFile(wb, name, { compression: true });
  return name;
}
