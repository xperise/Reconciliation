// Định dạng số & xử lý kỳ
const nf = (d: number) => new Intl.NumberFormat("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const N0 = nf(0), N1 = nf(1), N2 = nf(2);
export const ok = (v: number | null | undefined): v is number => v != null && isFinite(v);

/* --------------------------------------------------------------------------
   ĐƠN VỊ HIỂN THỊ TIỀN — người dùng chọn ở thanh tab, áp cho cả dashboard.
   "VND" là số gốc, không làm tròn. Các đơn vị còn lại chia theo bội số và
   hiển thị số lẻ do người dùng chọn; số VND chính xác luôn nằm ở tooltip.
   -------------------------------------------------------------------------- */
export type UnitKey = "vnd" | "nghin" | "trieu" | "ty";
export interface UnitDef { key: UnitKey; ten: string; nhan: string; chia: number; le: number }
export const UNITS: Record<UnitKey, Omit<UnitDef, "le">> = {
  vnd: { key: "vnd", ten: "VND (số gốc)", nhan: "VND", chia: 1 },
  nghin: { key: "nghin", ten: "Nghìn VND", nhan: "nghìn", chia: 1e3 },
  trieu: { key: "trieu", ten: "Triệu VND", nhan: "tr", chia: 1e6 },
  ty: { key: "ty", ten: "Tỷ VND", nhan: "tỷ", chia: 1e9 },
};
const LE_MAC_DINH: Record<UnitKey, number> = { vnd: 0, nghin: 0, trieu: 1, ty: 2 };
let U: UnitDef = { ...UNITS.ty, le: 2 };
export function setUnit(key: UnitKey, le?: number) {
  U = { ...UNITS[key], le: le ?? LE_MAC_DINH[key] };
}
export const unit = () => U;
/** Nhãn đơn vị để ghi ở góc thẻ, ví dụ "tỷ VND" */
export const unitLabel = () => (U.key === "vnd" ? "VND" : `${U.nhan} VND`);
/** Số VND chính xác, dùng cho tooltip */
export const exact = (v: number | null | undefined) => (ok(v) ? N0.format(Math.round(v)) + " VND" : "—");

/** Số tiền theo đơn vị đang chọn, KÈM nhãn đơn vị */
export const ty = (v: number | null | undefined) => (ok(v) ? nf(U.le).format(v / U.chia) + " " + U.nhan : "—");
/** Số tiền theo đơn vị đang chọn, KHÔNG kèm nhãn (dùng trong bảng có nhãn ở tiêu đề) */
export const tyN = (v: number | null | undefined) => (ok(v) ? nf(U.le).format(v / U.chia) : "—");
/** Dùng cho các số nhỏ (hoa hồng…) — cũng chạy theo đơn vị đang chọn */
export const tr = ty;
export const trN = tyN;
/** Số nguyên không đơn vị (số khách, số ngày…) — luôn giữ nguyên, không chia */
export const n0 = (v: number | null | undefined) => (ok(v) ? N0.format(Math.round(v)) : "—");
/** Số tiền đã chia sẵn theo đơn vị (dùng cho trục biểu đồ) */
export const axisNum = (v: number | null | undefined) => (ok(v) ? nf(U.le).format(v) : "—");
/** Số lẻ vừa đủ để một dãy số nhỏ không bị hiện thành 0,00 ở đơn vị đang chọn */
export function leVua(maxVnd: number): number {
  if (U.key === "vnd") return 0;
  const x = Math.abs(maxVnd) / U.chia;
  if (!isFinite(x) || x <= 0) return U.le;
  return Math.max(U.le, x >= 1 ? 0 : x >= 0.1 ? 2 : x >= 0.01 ? 3 : 4);
}
/** Số tiền theo đơn vị đang chọn với số lẻ chỉ định */
export const tyLe = (v: number | null | undefined, le: number) => (ok(v) ? nf(le).format((v as number) / U.chia) : "—");
export const pc = (v: number | null | undefined, d = 1) => (ok(v) ? nf(d).format(v * 100) + "%" : "—");
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
export const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + (f(x) || 0), 0);

/** 'T09.2026' → số tháng tuyệt đối */
export function kyIdx(ky: string): number {
  const m = /^T(\d{2})\.(\d{4})$/.exec(ky);
  return m ? Number(m[2]) * 12 + Number(m[1]) - 1 : NaN;
}
export function kyFromIdx(i: number): string {
  const y = Math.floor(i / 12), m = (i % 12) + 1;
  return `T${String(m).padStart(2, "0")}.${y}`;
}
export const kyAdd = (ky: string, n: number) => kyFromIdx(kyIdx(ky) + n);
export const kyShort = (ky: string) => ky.slice(0, 3);
/** 'yyyy-mm-dd' → kỳ */
export const kyOfDate = (d: string) => `T${d.slice(5, 7)}.${d.slice(0, 4)}`;
/** Ngày cuối tháng của kỳ, dạng yyyy-mm-dd */
export function kyEnd(ky: string): string {
  const i = kyIdx(ky) + 1, y = Math.floor(i / 12), m = i % 12;
  const d = new Date(Date.UTC(y, m, 1) - 86400000);
  return d.toISOString().slice(0, 10);
}
export function days(a: string, b: string): number {
  return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);
}
export function addDays(a: string, n: number): string {
  return new Date(Date.parse(a + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fmtDate = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
/** Sắp xếp kỳ nửa tháng 'T09.2026-H1' */
export const halfIdx = (h: string) => kyIdx(h.slice(0, 8)) * 2 + (h.endsWith("H2") ? 1 : 0);
