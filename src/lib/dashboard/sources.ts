// Đọc thẳng file nguồn (không qua file template) — chạy trên trình duyệt.
//   · Bảng kê khách hàng hotel / flight (xperise_hotel_statement / xperise_flight_statement)
//   · File đối soát NCC (Doi_soat_…): cột "Bảng kê" = số NCC (giá vốn), "Ledger" = số trên bảng kê khách hàng
//   · Sổ công nợ phải thu (sheet CNO PTHU + danh mục KHACH HANG)
// Nhận diện file theo dòng tiêu đề, không theo tên file.
import { loadSheetJS, norm } from "./parse";
import type { Customer } from "./types";

export type SrcKind = "kh_hotel" | "kh_flight" | "ncc" | "ar" | "unknown";
export const KIND_LABEL: Record<SrcKind, string> = {
  kh_hotel: "Bảng kê khách hàng · Hotel", kh_flight: "Bảng kê khách hàng · Flight", ncc: "Đối soát NCC", ar: "Công nợ phải thu", unknown: "Không nhận diện được",
};
export interface KhRow { loai: "hotel" | "flight"; ky: string; ngay: string; ten_cong_ty: string | null; trang_thai: string | null; ma_gd: string | null; ma_gd2: string | null; so_ve: string | null; so_hd: string | null; gmv: number; tong_tt: number | null; chiet_khau: number | null; phi_dv: number | null; khach: string | null; mo_ta: string | null }
export interface NccRow { ncc: string | null; nganh: string | null; ma_booking: string | null; so_ve: string | null; khach: string | null; ngay_dv: string | null; ky: string | null; bang_ke: number | null; ledger: number | null; khop: string | null; xu_ly: string | null; mo_ta: string | null; dong: string | null }
export interface ArRow { ma_kh: string; ky: string; so_ct: string | null; ngay_hd: string | null; ngay_den_han: string; so_tien: number; da_thu: number | null; ngay_thu_du: string | null; ngay_thu_gan_nhat: string | null }
export interface DmRow { ma_kh: string; ten_kh: string; ten_viet_tat: string; credit_term: number | null; moi: boolean }
export interface SrcFile {
  name: string; kind: SrcKind; fileKey: string;
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
export const fileKeyOf = (name: string) => name.replace(/\.[^.]+$/, "").replace(/_\d{8}$/, "");
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
export async function readSource(file: File, existing: Customer[]): Promise<SrcFile> {
  const X = await loadSheetJS();
  SSF = X.SSF;
  const wb = X.read(await file.arrayBuffer(), { type: "array" });
  const sheet = (n: string) => X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }) as Cell[][];
  const base: SrcFile = { name: file.name, kind: "unknown", fileKey: fileKeyOf(file.name), rows: 0, from: null, to: null, kys: [], total: 0, totalL: "", notes: [], warns: [] };

  // 1. Sổ công nợ phải thu: sheet CNO PTHU
  const arSheet = wb.SheetNames.find((n) => norm(n) === "cnopthu");
  if (arSheet) return readAR(base, sheet(arSheet), wb.SheetNames.find((n) => norm(n) === "khachhang") ? sheet(wb.SheetNames.find((n) => norm(n) === "khachhang") as string) : [], existing);

  for (const n of wb.SheetNames) {
    const rows = sheet(n);
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
      gmv: amt, tong_tt: money(g(r, c.tong)), chiet_khau: money(g(r, c.ck)), phi_dv: money(g(r, c.phi)), khach: txt(g(r, c.khach)), mo_ta: txt(g(r, c.mo)),
    });
  });
  f.kh = out; f.rows = out.length;
  summarize(f, out.map((r) => r.ngay), out.reduce((s, r) => s + r.gmv, 0));
  f.totalL = `GMV ${fmtTien(f.total)}`;
  if (noAmt) f.notes.push(`${noAmt} dòng không có số tiền (khách ở chung phòng / dòng phụ) — bỏ qua`);
  if (noDate) f.warns.push(`${noDate} dòng không đọc được ngày giao dịch — bỏ qua`);
  const chua = out.filter((r) => !r.so_hd).length;
  if (chua) f.notes.push(`${chua} dòng chưa cấp số hóa đơn — khách hàng nhận theo tên công ty`);
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
  f.ncc = out; f.rows = out.length;
  summarize(f, out.map((r) => r.ngay_dv), out.reduce((s, r) => s + (r.khop?.startsWith("Trùng") ? 0 : r.bang_ke || 0), 0));
  const nccs = Array.from(new Set(out.map((r) => r.ncc).filter(Boolean)));
  f.totalL = `Bảng kê NCC ${fmtTien(f.total)} · ${nccs.length ? nccs.join(", ") : "chưa rõ NCC"}`;
  const cnt = (k: string) => out.filter((r) => r.khop === k).length;
  f.notes.push(`Khớp ${cnt("Khớp")} · lệch tiền ${cnt("Lệch tiền")} · thiếu trong hệ thống ${cnt("Thiếu trong hệ thống")} · trùng ${out.filter((r) => r.khop?.startsWith("Trùng")).length}`);
  const noNcc = out.filter((r) => !r.ncc);
  if (noNcc.length) f.warns.push(`${noNcc.length} dòng chưa có NCC (thường là dòng "Thiếu trong hệ thống") — tính vào phải trả nhóm "Chưa rõ NCC"`);
  f.notes.push(`Nạp lại file cùng kỳ đối soát sẽ thay dữ liệu cũ của file này`);
  return f;
}

function readAR(f: SrcFile, rows: Cell[][], kh: Cell[][], existing: Customer[]): SrcFile {
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

  /* Mã khách: ưu tiên khách đã có trong dashboard (theo tên viết tắt / tên / mã), rồi tới mã trong sheet KHACH HANG */
  const ex = new Map<string, Customer>();
  existing.forEach((x) => { [x.ten_viet_tat, x.ten_kh, x.ma_kh].forEach((k) => { if (k && !ex.has(norm(k))) ex.set(norm(k), x); }); });
  const dm = new Map<string, DmRow>();
  const resolve = (vt: string, ten: string | null): string => {
    const k = norm(vt), e = ex.get(k), m = master.get(k);
    const ma = e?.ma_kh || m?.ma || vt.toUpperCase().replace(/\s+/g, " ").trim();
    if (!dm.has(ma)) dm.set(ma, { ma_kh: ma, ten_kh: e?.ten_kh || m?.ten || ten || vt, ten_viet_tat: e?.ten_viet_tat || vt, credit_term: m?.term ?? e?.credit_term ?? null, moi: !e });
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
