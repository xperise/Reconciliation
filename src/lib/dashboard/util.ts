// Định dạng số & xử lý kỳ
const nf = (d: number) => new Intl.NumberFormat("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const N0 = nf(0), N1 = nf(1), N2 = nf(2);
export const ok = (v: number | null | undefined): v is number => v != null && isFinite(v);
export const ty = (v: number | null | undefined) => (ok(v) ? N2.format(v / 1e9) + " tỷ" : "—");
export const tyN = (v: number | null | undefined) => (ok(v) ? N2.format(v / 1e9) : "—");
export const tr = (v: number | null | undefined) => (ok(v) ? N1.format(v / 1e6) + " tr" : "—");
export const n0 = (v: number | null | undefined) => (ok(v) ? N0.format(Math.round(v)) : "—");
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
