// Đọc thẳng file nguồn (không qua file template) — chạy trên trình duyệt.
//   · Bảng kê khách hàng hotel / flight (xperise_hotel_statement / xperise_flight_statement)
//   · Bảng kê Be (Be_statement_<tên công ty>_<ngày>): mảng Transportation, mỗi Session ID một chuyến,
//     GMV = tổng "Total amount" các dòng của session (cước phí + phụ phí); tên khách lấy từ tên file
//   · File đối soát NCC (Doi_soat_…): cột "Bảng kê" = số NCC (giá vốn), "Ledger" = số trên bảng kê khách hàng
//   · Sổ công nợ phải thu (sheet CNO PTHU + danh mục KHACH HANG)
//   · Danh sách chi khách sạn trực tiếp B1 (hoa-don-ks-b1-…): số tiền trả khách sạn theo từng booking = giá vốn
//   · Giá NCC trên hệ thống (Performance Dashboard · Hotel / Flight spending, .csv): Supplier total amount theo booking.
//     Chỉ dùng cho dòng bảng kê chưa có giá vốn từ đối soát NCC hay B1; mã booking không có trên bảng kê thì không tính.
// Nhận diện file theo dòng tiêu đề, không theo tên file.
import { loadSheetJS, norm } from "./parse";
import type { Customer } from "./types";


export type SrcKind = "kh_hotel" | "kh_flight" | "kh_be" | "ncc" | "b1" | "ht_hotel" | "ht_flight" | "ar" | "unknown";
export const KIND_LABEL: Record<SrcKind, string> = {
  kh_hotel: "Bảng kê khách hàng · Hotel", kh_flight: "Bảng kê khách hàng · Flight", kh_be: "Bảng kê Be · Transportation", ncc: "Đối soát NCC", b1: "Chi khách sạn trực tiếp (B1)", ht_hotel: "Giá NCC trên hệ thống · Hotel", ht_flight: "Giá NCC trên hệ thống · Flight", ar: "Công nợ phải thu", unknown: "Không nhận diện được",
};
export interface KhRow { loai: "hotel" | "flight" | "transport"; ky: string; ngay: string; ten_cong_ty: string | null; trang_thai: string | null; ma_gd: string | null; ma_gd2: string | null; so_ve: string | null; so_hd: string | null; gmv: number; tong_tt: number | null; chiet_khau: number | null; phi_dv: number | null; khach: string | null; mo_ta: string | null; email?: string | null }
export interface NccRow { ncc: string | null; nganh: string | null; ma_booking: string | null; so_ve: string | null; khach: string | null; ngay_dv: string | null; ky: string | null; bang_ke: number | null; ledger: number | null; khop: string | null; xu_ly: string | null; mo_ta: string | null; dong: string | null }
export interface ArRow { ma_kh: string; ky: string; so_ct: string | null; ngay_hd: string | null; ngay_den_han: string; so_tien: number; da_thu: number | null; ngay_thu_du: string | null; ngay_thu_gan_nhat: string | null }
export interface DmRow { ma_kh: string; ten_kh: string; ten_viet_tat: string; credit_term: number | null; moi: boolean }
export interface SrcFile {
  name: string; kind: SrcKind; fileKey: string;
  /** Bảng kê Be: tên công ty (lấy từ tên file) — nạp lại chỉ thay số của công ty này */
  cty?: string;
  kh?: KhRow[]; ncc?: NccRow[]; ar?: ArRow[]; dm?: DmRow[];
  /** tóm tắt để xem trước */
  rows: number; from: string | null; to: string | null; kys: string[]; total: number; totalL: string;
  notes: string[]; warns: string[];
}

/* ---------------- tiện ích ---------------- */
type Cell = unknown;
const txt = (v: Cell) => { const s = v == null ? "" : String(v).replace(/_x000d_/g, "").trim(); return s || null; };
function num(v: Cell): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, "");
  if (!s || /[a-z#]/i.test(s)) return null;
  const n = Number(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""));
  return isFinite(n) ? n : null;
}
const money = (v: Cell) => { const n = num(v); return n == null ? null : Math.round(n); };
let SSF: { parse_date_code(v: number): { y: number; m: number; d: number } | null } | null = null;
function iso(v: Cell): string | null {
  if (v == null || v === "") return null;
  const p = (y: number, m: number, d: number) => (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
  if (v instanceof Date) return p(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number") { const c = SSF?.parse_date_code(v); return c ? p(c.y, c.m, c.d) : null; }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return p(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return p(+m[3], +m[2], +m[1]);
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/.exec(s);   // "Oct 31, 2026"
  if (m) { const mo = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1].toLowerCase()); return mo >= 0 ? p(+m[3], mo + 1, +m[2]) : null; }
  return null;
}
const kyOf = (d: string) => `T${d.slice(5, 7)}.${d.slice(0, 4)}`;
/** '10/2026', Date, 'T10.2026' → 'T10.2026' */
function kyCell(v: Cell): string | null {
  if (v instanceof Date || typeof v === "number") { const d = iso(v); return d ? kyOf(d) : null; }
  const s = String(v ?? "").trim();
  let m = /^T?(\d{1,2})[./-](\d{4})$/i.exec(s);
  if (m) return `T${m[1].padStart(2, "0")}.${m[2]}`;
  m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `T${m[2]}.${m[1]}` : null;
}
const kyEndIso = (ky: string) => { const m = +ky.slice(1, 3), y = +ky.slice(4); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
/** Tên file bỏ phần ngày xuất ở cuối: nạp lại cùng kỳ đối soát thì thay dữ liệu cũ */
export const fileKeyOf = (name: string) => name.replace(/\.[^.]+$/, "").replace(/(__\d+_| \(\d+\))$/, "").replace(/_\d{8}$/, "");
const fmtTien = (v: number) => new Intl.NumberFormat("vi-VN").format(Math.round(v));

/** Tìm dòng tiêu đề có đủ các cột cần; trả về chỉ số dòng và hàm tra cột theo tên */
function header(rows: Cell[][], must: string[], scan = 15) {
  for (let i = 0; i < Math.min(scan, rows.length); i++) {
    const h = (rows[i] || []).map(norm);
    if (must.every((m) => h.includes(norm(m)))) {
      const col = (name: string, from = 0) => { const k = h.indexOf(norm(name), from); return k; };
      const starts = (prefix: string) => h.findIndex((x) => x.startsWith(norm(prefix)));
      return { i, h, col, starts };
    }
  }
  return null;
}

/* ---------------- đọc một file ---------------- */
export async function readSource(file: File, existing: Customer[], arCodes: string[] = []): Promise<SrcFile> {
  const X = await loadSheetJS();
  SSF = X.SSF;
  // CSV: đọc dạng chữ UTF-8 và giữ nguyên chữ (không để thư viện tự đoán ngày kiểu Mỹ)
  const wb = /\.csv$/i.test(file.name) ? (X.read as unknown as (d: string, o: object) => ReturnType<typeof X.read>)((await file.text()).replace(/^\uFEFF/, ""), { type: "string", raw: true }) : X.read(await file.arrayBuffer(), { type: "array" });
  const sheet = (n: string) => X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }) as Cell[][];
  const base: SrcFile = { name: file.name, kind: "unknown", fileKey: fileKeyOf(file.name), rows: 0, from: null, to: null, kys: [], total: 0, totalL: "", notes: [], warns: [] };

  // 1. Sổ công nợ phải thu: sheet CNO PTHU
  const arSheet = wb.SheetNames.find((n) => norm(n) === "cnopthu");
  if (arSheet) return readAR(base, sheet(arSheet), wb.SheetNames.find((n) => norm(n) === "khachhang") ? sheet(wb.SheetNames.find((n) => norm(n) === "khachhang") as string) : [], existing, new Set(arCodes));

  for (const n of wb.SheetNames) {
    const rows = sheet(n);
    // 2c. Bảng kê Be
    const hbe = header(rows, ["Session ID", "Transaction type", "Total amount"]);
    if (hbe) return readBe(base, rows, hbe);
    // 2b. Giá NCC trên hệ thống (Performance Dashboard)
    const hh = header(rows, ["Booking code", "Booking supplier", "Supplier total amount", "UTS total amount"]);
    if (hh) return readHt(base, rows, hh, "hotel");
    const hf = header(rows, ["Departure: Booking code", "Supplier", "Supplier total amount", "UTS total amount"]);
    if (hf) return readHt(base, rows, hf, "flight");
    // 2a. Chi khách sạn trực tiếp B1
    const hb = header(rows, ["Mã đề xuất", "Khách sạn", "Mã booking", "Số tiền", "Trạng thái chi"]);
    if (hb) return readB1(base, rows, hb);
    // 2. Đối soát NCC
    const hn = header(rows, ["Mã booking", "Bảng kê", "Ledger", "Khớp"]);
    if (hn) return readNcc(base, rows, hn);
    // 3. Bảng kê khách hàng
    const hk = header(rows, ["Tên công ty", "Ngày giao dịch", "Số hóa đơn"]);
    if (hk) return readKh(base, rows, hk);
  }
  base.warns.push("Không thấy dòng tiêu đề của bảng kê khách hàng, đối soát NCC hay sổ công nợ phải thu.");
  return base;
}

type Hdr = NonNullable<ReturnType<typeof header>>;
function summarize(f: SrcFile, dates: (string | null)[], total: number) {
  const ds = dates.filter(Boolean).sort() as string[];
  f.from = ds[0] || null; f.to = ds[ds.length - 1] || null;
  f.kys = Array.from(new Set(ds.map(kyOf))).sort();
  f.total = total;
}

function readKh(f: SrcFile, rows: Cell[][], H: Hdr): SrcFile {
  const hotel = H.col("Tên khách sạn") >= 0;
  f.kind = hotel ? "kh_hotel" : "kh_flight";
  const c = {
    cty: H.col("Tên công ty"), ngay: H.col("Ngày giao dịch"), tt: H.col("Trạng thái"), khach: H.col("Họ và tên Khách"),
    amt: hotel ? H.col("Thành tiền (đã VAT)") : H.col("Thành tiền"), tong: H.col("Tổng thành tiền"), ck: H.col("Tổng tiền chiết khấu"), phi: H.col("Tổng phí dịch vụ"),
    ma: hotel ? H.col("Mã giao dịch") : H.col("Mã giao dịch (Chiều đi)"), ma2: hotel ? -1 : H.col("Mã giao dịch (Chiều về)"),
    ve: H.col("Số vé"), hd: H.col("Số hóa đơn"), mo: hotel ? H.col("Tên khách sạn") : H.col("Tên dịch vụ (Hành trình)"),
    email: H.col("Email người đặt"),
  };
  if (c.amt < 0) { f.warns.push(`Không thấy cột ${hotel ? "Thành tiền (đã VAT)" : "Thành tiền"}`); return f; }
  const out: KhRow[] = [];
  let noDate = 0, noAmt = 0;
  const g = (r: Cell[], k: number) => (k >= 0 ? r[k] : null);
  rows.slice(H.i + 1).forEach((r) => {
    const amt = money(g(r, c.amt));
    if (amt == null) { if (txt(g(r, c.cty))) noAmt++; return; }   // dòng khách ở chung phòng: không có số tiền
    const d = iso(g(r, c.ngay));
    if (!d) { noDate++; return; }
    const hd = txt(g(r, c.hd));
    out.push({
      loai: hotel ? "hotel" : "flight", ky: kyOf(d), ngay: d, ten_cong_ty: txt(g(r, c.cty)), trang_thai: txt(g(r, c.tt)),
      ma_gd: txt(g(r, c.ma)), ma_gd2: txt(g(r, c.ma2)), so_ve: txt(g(r, c.ve)), so_hd: hd && /\d/.test(hd) ? hd : null,
      gmv: amt, tong_tt: money(g(r, c.tong)), chiet_khau: money(g(r, c.ck)), phi_dv: money(g(r, c.phi)), khach: txt(g(r, c.khach)), mo_ta: txt(g(r, c.mo)), email: txt(g(r, c.email))?.toLowerCase() || null,
    });
  });
  f.kh = out; f.rows = out.length;
  summarize(f, out.map((r) => r.ngay), out.reduce((s, r) => s + (r.tong_tt ? r.tong_tt : r.gmv), 0));
  f.totalL = `GMV (Tổng thành tiền) ${fmtTien(f.total)}`;
  if (noAmt) f.notes.push(`${noAmt} dòng không có số tiền (khách ở chung phòng / dòng phụ) — bỏ qua`);
  if (noDate) f.warns.push(`${noDate} dòng không đọc được ngày giao dịch — bỏ qua`);
  const chua = out.filter((r) => !r.so_hd).length;
  if (chua) f.notes.push(`${chua} dòng chưa cấp số hóa đơn — khách hàng nhận theo tên công ty`);
  const khongCty = out.filter((r) => !r.ten_cong_ty);
  if (khongCty.length) f.warns.push(`${khongCty.length} dòng không có Tên công ty (vd. ${khongCty.slice(0, 2).map((r) => `${r.ngay} · ${r.ma_gd || r.so_ve || "?"}${r.email ? " · " + r.email : ""}`).join("; ")}) — nhận khách theo tên miền email người đặt`);
  f.notes.push(`Nạp lại cùng kỳ (${f.kys.join(", ")}) sẽ thay bảng kê ${hotel ? "hotel" : "flight"} của kỳ đó`);
  return f;
}

function readNcc(f: SrcFile, rows: Cell[][], H: Hdr): SrcFile {
  f.kind = "ncc";
  const c = { ve: H.col("Số vé"), bk: H.col("Mã booking"), khach: H.col("Khách"), ngay: H.col("Ngày dịch vụ"), mo: H.col("Mô tả"), bke: H.col("Bảng kê"), led: H.col("Ledger"), khop: H.col("Khớp"), ncc: H.col("NCC"), xl: H.col("Xử lý"), dong: H.col("Dòng bảng kê") };
  const nameNganh = /hotel|agoda|khach.?san/i.test(f.name) ? "Hotel" : /flight|ve.?may.?bay/i.test(f.name) ? "Flight" : null;
  const out: NccRow[] = [];
  const g = (r: Cell[], k: number) => (k >= 0 ? r[k] : null);
  rows.slice(H.i + 1).forEach((r) => {
    const bke = money(g(r, c.bke)), led = money(g(r, c.led));
    if (bke == null && led == null) return;
    const nccAll = txt(g(r, c.ncc));
    const ncc = nccAll ? nccAll.split(",")[0].trim() : null;
    const nganh = ncc?.startsWith("hotel:") ? "Hotel" : ncc?.startsWith("flight:") ? "Flight" : nameNganh;
    const ve = txt(g(r, c.ve));
    const d = iso(g(r, c.ngay));
    out.push({ ncc, nganh, ma_booking: txt(g(r, c.bk)), so_ve: ve ? ve.split(/[\r\n]+/)[0].trim() || null : null, khach: txt(g(r, c.khach)), ngay_dv: d, ky: d ? kyOf(d) : null,
      bang_ke: bke, ledger: led, khop: txt(g(r, c.khop)), xu_ly: txt(g(r, c.xl)), mo_ta: txt(g(r, c.mo)), dong: txt(g(r, c.dong)) });
  });
  // Đối soát Be (không có NCC, mã booking là số 10 chữ số): không đưa vào dashboard
  if (isBeDs(out)) {
    f.ncc = []; f.rows = 0;
    summarize(f, out.map((r) => r.ngay_dv), out.reduce((s, r) => s + (r.bang_ke || 0), 0));
    f.totalL = `Bảng kê NCC ${fmtTien(f.total)}`;
    f.warns.push(`Đây là đối soát bảng kê Be (${out.length} dòng, mã booking dạng số, không có NCC) — không đưa vào dashboard`);
    return f;
  }
  // NCC trống (dòng thiếu trong hệ thống): suy theo sheet bảng kê NCC
  const inf = inferNcc(out, () => "");
  let gopX = 0;
  inf.forEach((n, r) => {
    const cu = r.ncc;
    if (cu) gopX++;
    r.ncc = n; r.nganh = n.startsWith("hotel:") ? "Hotel" : n.startsWith("flight:") ? "Flight" : r.nganh;
    r.mo_ta = [r.mo_ta, cu ? `NCC theo bảng kê ${n.replace(/^(hotel|flight):/, "")} (hệ thống ghi ${cu.replace(/^(hotel|flight):/, "")})` : `NCC suy theo sheet bảng kê ${String(r.dong || "").split("!")[0]}`].filter(Boolean).join(" · ");
  });
  f.ncc = out; f.rows = out.length;
  summarize(f, out.map((r) => r.ngay_dv), out.reduce((s, r) => s + (r.khop?.startsWith("Trùng") ? 0 : r.bang_ke || 0), 0));
  const nccs = Array.from(new Set(out.map((r) => r.ncc).filter(Boolean)));
  f.totalL = `Bảng kê NCC ${fmtTien(f.total)} · ${nccs.length ? nccs.join(", ") : "chưa rõ NCC"}`;
  const cnt = (k: string) => out.filter((r) => r.khop === k).length;
  f.notes.push(`Khớp ${cnt("Khớp")} · lệch tiền ${cnt("Lệch tiền")} · thiếu trong hệ thống ${cnt("Thiếu trong hệ thống")} · trùng ${out.filter((r) => r.khop?.startsWith("Trùng")).length}`);
  const noNcc = out.filter((r) => !r.ncc);
  if (inf.size - gopX) f.notes.push(`${inf.size - gopX} dòng thiếu NCC đã gán NCC theo sheet bảng kê NCC`);
  if (gopX) f.notes.push(`${gopX} dòng hệ thống ghi NCC "XPERISE:<mã>" nằm trên bảng kê NCC khác — gộp về NCC của bảng kê`);
  if (noNcc.length) f.warns.push(`${noNcc.length} dòng không suy được NCC (sheet bảng kê không có dòng nào đã gán NCC) — tính vào phải trả nhóm "Chưa rõ NCC"`);
  f.notes.push(`Nạp lại file cùng kỳ đối soát sẽ thay dữ liệu cũ của file này`);
  return f;
}

/** Ngày giờ trong file B1 lưu theo giờ UTC (17:00 = 0:00 ngày hôm sau giờ Việt Nam) */
function isoVN(v: Cell): string | null {
  if (typeof v === "number") return iso(v + 7 / 24);
  if (v instanceof Date) return iso(new Date(v.getTime() + 7 * 3600e3));
  return iso(v);
}
/** Bảng kê Be: gộp các dòng cùng Session ID (cước phí + phụ phí), GMV = tổng Total amount */
function readBe(f: SrcFile, rows: Cell[][], H: Hdr): SrcFile {
  f.kind = "kh_be";
  const cty = f.name.replace(/\.[^.]+$/, "").replace(/^Be_statement_/i, "").replace(/(__\d+_| \(\d+\))$/, "").replace(/_\d{8}$/, "").replace(/_/g, " ").trim();
  f.cty = cty;
  const c = { ss: H.col("Session ID"), ngay: H.starts("Ngày giao dịch"), tot: H.col("Total amount"), type: H.col("Transaction type"), st: H.starts("Trạng thái giao dịch"),
    khach: H.starts("Họ tên khách"), di: H.starts("Điểm đi"), den: H.starts("Điểm đến"), fare: H.starts("Cước phí") };
  const g = (r: Cell[], k: number) => (k >= 0 ? r[k] : null);
  const by = new Map<string, KhRow & { n: number }>();
  let skipFail = 0;
  rows.slice(H.i + 1).forEach((r) => {
    const ss = txt(g(r, c.ss)), d = iso(g(r, c.ngay));
    if (!ss || !d) return;
    const st = txt(g(r, c.st)) || "";
    if (st && !/thành công|success/i.test(st)) { skipFail++; return; }
    const tot = money(g(r, c.tot)) || 0, fare = money(g(r, c.fare)) || 0;
    const o = by.get(ss) || { loai: "transport" as const, ky: kyOf(d), ngay: d, ten_cong_ty: cty, trang_thai: null, ma_gd: ss, ma_gd2: null, so_ve: null, so_hd: null,
      gmv: 0, tong_tt: 0, chiet_khau: null, phi_dv: null, khach: txt(g(r, c.khach)), mo_ta: [txt(g(r, c.di)), txt(g(r, c.den))].filter(Boolean).join(" → ") || null, n: 0 };
    o.tong_tt = (o.tong_tt || 0) + tot; o.gmv += tot; o.n++;
    if (d < o.ngay) { o.ngay = d; o.ky = kyOf(d); }
    o.trang_thai = [o.trang_thai, txt(g(r, c.type))].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(" + ") || null;
    void fare;
    by.set(ss, o);
  });
  const all = Array.from(by.values());
  const out = all.filter((r) => r.gmv !== 0).map(({ n: _n, ...r }) => { void _n; return r; });
  // Bảng kê Be không đưa vào dashboard
  f.kh = []; f.rows = 0;
  f.warns.push("Bảng kê Be không đưa vào dashboard — file này sẽ không được ghi");
  summarize(f, out.map((r) => r.ngay), out.reduce((s, r) => s + r.gmv, 0));
  f.totalL = `GMV ${fmtTien(f.total)} · ${cty}`;
  const multi = all.filter((r) => r.n > 1).length, zero = all.length - out.length;
  f.notes.push(`${all.length} session · ${multi} session gộp nhiều dòng (cước phí + phụ phí) · ${zero} session tổng 0 (hoàn tiền) — bỏ qua`);

  if (skipFail) f.warns.push(`${skipFail} dòng trạng thái không thành công — bỏ qua`);
  return f;
}

/** Giá NCC trên hệ thống. khop = "HT: <trạng thái>", ledger = UTS total amount (giá bán trên hệ thống).
 *  Flight: mã booking ghi "chiều đi / chiều về" khi hai mã khác nhau. */
function readHt(f: SrcFile, rows: Cell[][], H: Hdr, loai: "hotel" | "flight"): SrcFile {
  f.kind = loai === "hotel" ? "ht_hotel" : "ht_flight";
  const c = loai === "hotel"
    ? { bk: H.col("Booking code"), bk2: -1, ncc: H.col("Booking supplier"), khach: H.col("Traveler name"), ngay: H.col("Check in"), bd: H.col("Booking date"), cty: H.col("Company name"), mo: H.col("Hotel name") }
    : { bk: H.col("Departure: Booking code"), bk2: H.col("Return: Booking code"), ncc: H.col("Supplier"), khach: H.col("Traveler name"), ngay: -1, bd: H.col("Booking date"), cty: H.col("Company name"), mo: H.col("Airline name") };
  const tt = H.col("Booking status"), sup = H.col("Supplier total amount"), uts = H.col("UTS total amount");
  const g = (r: Cell[], k: number) => (k >= 0 ? r[k] : null);
  const out: NccRow[] = [];
  const bds: string[] = [];
  rows.slice(H.i + 1).forEach((r) => {
    const bk = txt(g(r, c.bk)), amt = money(g(r, sup));
    if (!bk || /^null$/i.test(bk) || amt == null) return;
    const bk2 = txt(g(r, c.bk2)), st = txt(g(r, tt)) || "";
    const d = iso(g(r, c.ngay)) || iso(g(r, c.bd)), bd = iso(g(r, c.bd));
    if (bd) bds.push(bd);
    out.push({ ncc: `${loai}:${txt(g(r, c.ncc)) || "?"}`, nganh: loai === "hotel" ? "Hotel" : "Flight",
      ma_booking: bk2 && !/^null$/i.test(bk2) && bk2 !== bk ? `${bk} / ${bk2}` : bk, so_ve: null, khach: txt(g(r, c.khach)), ngay_dv: d, ky: d ? kyOf(d) : null,
      bang_ke: amt, ledger: money(g(r, uts)), khop: `HT: ${st}`, xu_ly: st || null, mo_ta: [txt(g(r, c.cty)), txt(g(r, c.mo))].filter(Boolean).join(" · "), dong: null });
  });
  f.ncc = out; f.rows = out.length;
  summarize(f, bds, out.reduce((s, r) => s + (r.bang_ke || 0), 0));
  // khóa theo loại + khoảng ngày đặt: xuất lại cùng khoảng thì thay; hai file hotel / flight cùng tên không đè nhau
  f.fileKey = `ht_${loai}|${f.from}|${f.to}`;
  const huy = out.filter((r) => /cancel/i.test(r.xu_ly || ""));
  f.totalL = `Supplier total ${fmtTien(f.total)} · UTS total ${fmtTien(out.reduce((s, r) => s + (r.ledger || 0), 0))} · ${Array.from(new Set(out.map((r) => r.ncc?.split(":")[1]))).join(", ")}`;
  f.notes.push("Chỉ dùng làm giá vốn cho dòng bảng kê chưa có số từ đối soát NCC / B1; mã booking không có trên bảng kê thì không tính vào đâu");
  if (huy.length) f.notes.push(`${huy.length} booking đã hủy: giá vốn tính theo phần khách vẫn bị thu trên bảng kê (hủy hoàn tiền thì giá vốn = 0)`);
  return f;
}

function readB1(f: SrcFile, rows: Cell[][], H: Hdr): SrcFile {
  f.kind = "b1";
  const c = { de: H.col("Mã đề xuất"), ks: H.col("Khách sạn"), bk: H.col("Mã booking"), khach: H.col("Khách"), ci: H.col("Check-in"), tien: H.col("Số tiền"),
    tt: H.col("Trạng thái chi"), ngayChi: H.col("Ngày chi"), ht: H.col("Hình thức"), hd: H.col("Có hoá đơn?") };
  const g = (r: Cell[], k: number) => (k >= 0 ? r[k] : null);
  const out: NccRow[] = [];
  rows.slice(H.i + 1).forEach((r) => {
    const tien = money(g(r, c.tien)), bk = txt(g(r, c.bk));
    if (tien == null || !bk) return;
    const ks = txt(g(r, c.ks)) || "Khách sạn trực tiếp", tt = txt(g(r, c.tt)) || "", d = isoVN(g(r, c.ci)), chi = isoVN(g(r, c.ngayChi));
    const daChi = /^đã chi/i.test(tt);
    out.push({ ncc: `hotel:${ks}`, nganh: "Hotel", ma_booking: bk, so_ve: null, khach: txt(g(r, c.khach)), ngay_dv: d, ky: d ? kyOf(d) : null,
      bang_ke: tien, ledger: null, khop: daChi ? "B1: Đã chi" : "B1: Chưa chi", xu_ly: tt || null,
      mo_ta: [daChi && chi ? `chi ${chi}` : "", txt(g(r, c.ht)), txt(g(r, c.hd)) === "Có" ? "có hoá đơn" : "chưa có hoá đơn"].filter(Boolean).join(" · "), dong: txt(g(r, c.de)) });
  });
  f.ncc = out; f.rows = out.length;
  summarize(f, out.map((r) => r.ngay_dv), out.reduce((s, r) => s + (r.bang_ke || 0), 0));
  const da = out.filter((r) => r.khop === "B1: Đã chi");
  f.totalL = `Chi khách sạn ${fmtTien(f.total)} · đã chi ${fmtTien(da.reduce((s, r) => s + (r.bang_ke || 0), 0))} · ${new Set(out.map((r) => r.ncc)).size} khách sạn`;
  f.notes.push(`${da.length} booking đã chi · ${out.length - da.length} chờ thanh toán / trong đợt chi — dùng làm giá vốn hotel, nối với bảng kê bằng mã booking`);
  f.notes.push("Nạp lại file B1 cùng tháng sẽ thay dữ liệu cũ của file này");
  return f;
}

function readAR(f: SrcFile, rows: Cell[][], kh: Cell[][], existing: Customer[], arSet: Set<string>): SrcFile {
  f.kind = "ar";
  const H = header(rows, ["Tên khách hàng", "Tên viết tắt khách hàng", "Công nợ phải thu", "Kỳ nợ phát sinh"]);
  if (!H) { f.warns.push("Sheet CNO PTHU thiếu dòng tiêu đề (Tên khách hàng, Tên viết tắt khách hàng, Công nợ phải thu, Kỳ nợ phát sinh)"); return f; }
  const c = { ten: H.col("Tên khách hàng"), vt: H.col("Tên viết tắt khách hàng"), ky: H.col("Kỳ nợ phát sinh"), tien: H.col("Công nợ phải thu"), thu: H.col("Đã thu tiền"), con: H.col("Công nợ Còn lại"),
    ngayThu: H.col("Ngày thu tiền"), hd: H.col("HOA ĐƠN"), ngayHd: H.col("Ngày hóa đơn"), term: H.col("Credit Term"), han: H.starts("Ngày đến hạn thanh toán công nợ theo hợp đồng") };

  /* Danh mục KHACH HANG: mã, tên viết tắt, tên đầy đủ, payment term */
  const master = new Map<string, { ma: string; ten: string; vt: string; term: number | null }>();
  const HK = header(kh, ["Mã khách hàng", "Tên khách hàng", "Payment term"]);
  if (HK) {
    const im = HK.col("Mã khách hàng"), iv = im + 1, it = HK.col("Tên khách hàng"), ip = HK.col("Payment term");
    kh.slice(HK.i + 1).forEach((r) => { const ma = txt(r[im]), vt = txt(r[iv]); if (ma && vt) master.set(norm(vt), { ma, ten: txt(r[it]) || vt, vt, term: num(r[ip]) }); });
  } else f.warns.push("Không thấy sheet KHACH HANG (mã khách hàng, payment term) — khách mới lấy mã theo tên viết tắt");

  /* Nhận khách theo TÊN ĐẦY ĐỦ của pháp nhân (không theo tên viết tắt — tên viết tắt có thể trùng / là mã số thuế):
     1. khách đã có trong dashboard cùng tên đầy đủ (nhiều khách cùng tên thì lấy khách đang có công nợ)
     2. mã trong sheet KHACH HANG cùng tên đầy đủ
     3. khách mới: mã = tên viết tắt (trùng mã của pháp nhân khác thì thêm hậu tố) */
  const fullBy = new Map<string, Customer[]>();
  existing.forEach((x) => { const k = norm(x.ten_kh); if (!k) return; const a = fullBy.get(k) || []; a.push(x); fullBy.set(k, a); });
  const masterFull = new Map<string, { ma: string; ten: string; vt: string; term: number | null }>();
  master.forEach((m) => { if (!masterFull.has(norm(m.ten))) masterFull.set(norm(m.ten), m); });
  const used = new Map(existing.map((x) => [x.ma_kh, norm(x.ten_kh)]));
  const dm = new Map<string, DmRow>();
  const resolve = (vt: string, ten: string | null): string => {
    const kf = norm(ten || vt);
    const es = fullBy.get(kf) || [];
    const e = es.find((x) => arSet.has(x.ma_kh)) || es[0];
    const m = masterFull.get(kf);
    let ma = e?.ma_kh || m?.ma;
    if (!ma) {
      const base = vt.toUpperCase().replace(/\s+/g, " ").trim();
      ma = base; let i = 2;
      while (used.has(ma) && used.get(ma) !== kf) ma = `${base}-${i++}`;
    }
    used.set(ma, kf);
    if (!dm.has(ma)) dm.set(ma, { ma_kh: ma, ten_kh: e?.ten_kh || ten || m?.ten || vt, ten_viet_tat: e?.ten_viet_tat || vt || m?.vt || null, credit_term: m?.term ?? e?.credit_term ?? null, moi: !e } as DmRow);
    return ma;
  };
  master.forEach((m) => resolve(m.vt, m.ten));

  const out: ArRow[] = [];
  let bad = 0, noKy = 0;
  const g = (r: Cell[], k: number) => (k >= 0 ? r[k] : null);
  rows.slice(H.i + 1).forEach((r) => {
    const vt = txt(g(r, c.vt)) || txt(g(r, c.ten));
    const tien = money(g(r, c.tien));
    if (!vt || tien == null || tien === 0) return;
    const ky = kyCell(g(r, c.ky));
    if (!ky) { noKy++; return; }
    const ngayHd = iso(g(r, c.ngayHd)), term = num(g(r, c.term));
    const han = iso(g(r, c.han)) || (term != null ? addDays(ngayHd || kyEndIso(ky), term) : ngayHd || kyEndIso(ky));
    if (!han) { bad++; return; }
    const thu = money(g(r, c.thu)), con = money(g(r, c.con)), ngayThu = iso(g(r, c.ngayThu));
    const daDu = (con != null ? con <= 1000 : (thu ?? 0) >= tien - 1000) && !!ngayThu;
    const hdRaw = g(r, c.hd);
    out.push({ ma_kh: resolve(vt, txt(g(r, c.ten))), ky, so_ct: hdRaw == null ? null : String(hdRaw).trim() || null, ngay_hd: ngayHd, ngay_den_han: han,
      so_tien: tien, da_thu: thu, ngay_thu_du: daDu ? ngayThu : null, ngay_thu_gan_nhat: ngayThu });
  });
  f.ar = out; f.dm = Array.from(dm.values()); f.rows = out.length;
  summarize(f, out.map((r) => r.ngay_hd), out.reduce((s, r) => s + r.so_tien, 0));
  f.kys = Array.from(new Set(out.map((r) => r.ky))).sort((a, b) => a.slice(4).localeCompare(b.slice(4)) || a.localeCompare(b));
  const con = out.reduce((s, r) => s + r.so_tien - (r.da_thu || 0), 0);
  f.totalL = `Phải thu ${fmtTien(f.total)} · còn lại ${fmtTien(con)}`;
  const moi = f.dm.filter((x) => x.moi);
  f.notes.push(`${f.dm.length} khách trong danh mục · ${moi.length} khách mới sẽ thêm (nhóm N1)`);
  f.notes.push("Thay toàn bộ công nợ phải thu Travel (giữ công nợ khách Mobility N2–N5). Ngày gửi bảng kê và ghi chú sửa trên web được giữ lại");
  if (noKy) f.warns.push(`${noKy} dòng không đọc được kỳ nợ phát sinh — bỏ qua`);
  if (bad) f.warns.push(`${bad} dòng thiếu ngày đến hạn — bỏ qua`);
  return f;
}

/** Gán NCC theo sheet của bảng kê NCC ghi ở cột "Dòng bảng kê" (vd. "HOTEL-DOM!57"): trong cùng một file,
 *  sheet đó thuộc NCC nào ở các dòng đã có NCC thì là bảng kê của NCC đó (NCC chiếm ≥ 60%). Áp dụng cho:
 *   · dòng "Thiếu trong hệ thống" để trống cột NCC;
 *   · dòng hệ thống ghi NCC "XPERISE:<mã khách sạn>" (hợp đồng trực tiếp) nhưng nằm trên bảng kê của NCC khác
 *     — NCC đó mới là bên tính tiền (vd. các dòng XPERISE:4273 trên bảng kê HNH → HNH).
 *  Trả về dòng → NCC gán. */
const laXperise = (n: string | null | undefined) => /^(hotel|flight):XPERISE(:|$)/i.test(String(n || "").split(",")[0].trim());
export function inferNcc<T extends { ncc: string | null; dong: string | null }>(rows: T[], fileOf: (r: T) => string): Map<T, string> {
  const sheet = (r: T) => String(r.dong || "").split(",")[0].split("!")[0].trim();
  const vote = new Map<string, Map<string, number>>();
  rows.forEach((r) => {
    if (!r.ncc || laXperise(r.ncc)) return;
    const k = fileOf(r) + "|" + sheet(r), v = vote.get(k) || new Map<string, number>();
    r.ncc.split(",").forEach((n) => { const x = n.trim(); if (x) v.set(x, (v.get(x) || 0) + 1); });
    vote.set(k, v);
  });
  const out = new Map<T, string>();
  rows.forEach((r) => {
    if ((r.ncc && !laXperise(r.ncc)) || !sheet(r)) return;
    const v = vote.get(fileOf(r) + "|" + sheet(r));
    if (!v) return;
    const tot = Array.from(v.values()).reduce((a, b) => a + b, 0), best = Array.from(v.entries()).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] / tot >= 0.6 && best[0] !== r.ncc) out.set(r, best[0]);
  });
  return out;
}

/** File đối soát của Be: không dòng nào có NCC và phần lớn mã booking là số 10 chữ số (Session / Booking ID của Be) */
export function isBeDs(rows: { ncc: string | null; ma_booking: string | null }[]): boolean {
  if (!rows.length || rows.some((r) => r.ncc)) return false;
  return rows.filter((r) => /^\d{10}$/.test(String(r.ma_booking || "").trim())).length / rows.length >= 0.8;
}
