// Đọc file template Excel → dữ liệu chuẩn hóa + danh sách lỗi/cảnh báo.
// Chạy trên trình duyệt, dùng thư viện xlsx có sẵn trong repo.
import { SHEETS, SheetSpec, ColSpec } from "./spec";
import type { Row } from "./types";

/* ---------- SheetJS tối thiểu ---------- */
interface XlsxSheet { [cell: string]: unknown }
interface XlsxBook { SheetNames: string[]; Sheets: Record<string, XlsxSheet> }
interface XlsxLib {
  read(data: ArrayBuffer, opts: { type: "array" }): XlsxBook;
  utils: { sheet_to_json(ws: XlsxSheet, opts: { header: 1; raw: boolean; defval: null; blankrows: boolean }): unknown[][] };
  SSF: { parse_date_code(v: number): { y: number; m: number; d: number } | null };
}
/** Dùng thư viện xlsx đã có trong package.json của repo — nạp khi cần để trang tải nhanh */
export async function loadSheetJS(): Promise<XlsxLib> {
  const mod = (await import("xlsx")) as unknown as Partial<XlsxLib> & { default?: XlsxLib };
  return (typeof mod.read === "function" ? mod : mod.default) as XlsxLib;
}

/* ---------- Kết quả ---------- */
export interface Issue { sheet: string; row?: number; col?: string; msg: string; level: "error" | "warn" }
export interface ParsedSheet { spec: SheetSpec; rows: Row[]; kys: string[] }
export interface ParseResult { sheets: ParsedSheet[]; issues: Issue[]; unknownSheets: string[] }

/* ---------- Chuẩn hóa ---------- */
export const norm = (s: unknown) =>
  String(s ?? "").replace(/\*/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]/g, "");

function toNumber(v: unknown, integer: boolean): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, "");
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()\-]/g, "");
  if (integer) {
    const digits = s.split(/[.,]/);
    // "1.234.567" / "1,234,567" → số nguyên; "1234,5" → làm tròn
    const last = digits[digits.length - 1];
    const joined = digits.length > 1 && last.length !== 3 ? digits.slice(0, -1).join("") + "." + last : digits.join("");
    const n = Number(joined);
    return isFinite(n) ? (neg ? -n : n) : null;
  }
  const n = Number(s.replace(",", "."));
  return isFinite(n) ? (neg ? -n : n) : null;
}

function isoFromParts(y: number, m: number, d: number): string | null {
  if (!(y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function toDate(v: unknown, X: XlsxLib): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const p = X.SSF.parse_date_code(v);
    return p ? isoFromParts(p.y, p.m, p.d) : null;
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return isoFromParts(+m[3], +m[2], +m[1]);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return isoFromParts(+m[1], +m[2], +m[3]);
  return null;
}
function toKy(v: unknown, X: XlsxLib): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const p = X.SSF.parse_date_code(v);
    return p ? `T${String(p.m).padStart(2, "0")}.${p.y}` : null;
  }
  const s = String(v).trim().toUpperCase();
  let m = /^T?\s*(\d{1,2})[./-](\d{4})$/.exec(s);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `T${m[1].padStart(2, "0")}.${m[2]}`;
  m = /^(\d{4})[./-](\d{1,2})$/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `T${m[2].padStart(2, "0")}.${m[1]}`;
  return null;
}
function toKyHalf(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase();
  const m = /^T?\s*(\d{1,2})[./-](\d{4})\s*[-_ ]?\s*H([12])$/.exec(s);
  if (!m || +m[1] < 1 || +m[1] > 12) return null;
  return `T${m[1].padStart(2, "0")}.${m[2]}-H${m[3]}`;
}

function convert(c: ColSpec, v: unknown, X: XlsxLib): { val: string | number | null; err?: string; warn?: string } {
  if (v == null || (typeof v === "string" && v.trim() === "")) return { val: null };
  switch (c.t) {
    case "text": return { val: String(v).trim() };
    case "code": return { val: String(v).trim() };
    case "enum": {
      const hit = (c.enum || []).find((e) => norm(e) === norm(v));
      return hit ? { val: hit } : { val: null, err: `"${String(v)}" không thuộc danh sách: ${(c.enum || []).join(", ")}` };
    }
    case "money": case "int": {
      const n = toNumber(v, true);
      return n == null ? { val: null, err: `"${String(v)}" không phải số` } : { val: Math.round(n) };
    }
    case "num": {
      const n = toNumber(v, false);
      return n == null ? { val: null, err: `"${String(v)}" không phải số` } : { val: n };
    }
    case "pct": {
      const pctStr = typeof v === "string" && v.includes("%");
      let n = toNumber(typeof v === "string" ? v.replace("%", "") : v, false);
      if (n == null) return { val: null, err: `"${String(v)}" không phải tỷ lệ` };
      if (pctStr) n = n / 100;
      else if (n > 1 && n <= 100) return { val: n / 100, warn: `${n} được hiểu là ${n}%` };
      return { val: n };
    }
    case "date": {
      const d = toDate(v, X);
      return d ? { val: d } : { val: null, err: `"${String(v)}" không phải ngày (dd/mm/yyyy)` };
    }
    case "ky": {
      const k = toKy(v, X);
      return k ? { val: k } : { val: null, err: `"${String(v)}" không đúng dạng kỳ T09.2026` };
    }
    case "kyhalf": {
      const k = toKyHalf(v);
      return k ? { val: k } : { val: null, err: `"${String(v)}" không đúng dạng T09.2026-H1` };
    }
  }
}

/* ---------- Đọc 1 sheet ---------- */
function parseSheet(spec: SheetSpec, raw: unknown[][], X: XlsxLib, issues: Issue[]): ParsedSheet | null {
  const want = spec.cols.map((c) => norm(c.h));
  let hr = -1, best = 0;
  for (let r = 0; r < Math.min(8, raw.length); r++) {
    const hits = (raw[r] || []).filter((x) => want.includes(norm(x))).length;
    if (hits > best) { best = hits; hr = r; }
  }
  if (hr < 0 || best === 0) return null;
  const header = (raw[hr] || []).map(norm);
  const pos = spec.cols.map((c) => header.indexOf(norm(c.h)));
  spec.cols.forEach((c, i) => {
    if (pos[i] < 0 && c.req) issues.push({ sheet: spec.sheet, col: c.h, msg: `Thiếu cột bắt buộc "${c.h}"`, level: "error" });
  });
  if (spec.cols.some((c, i) => c.req && pos[i] < 0)) return { spec, rows: [], kys: [] };

  const rows: Row[] = [];
  const seen = new Map<string, number>();
  for (let r = hr + 1; r < raw.length; r++) {
    const line = raw[r] || [];
    if (line.every((x) => x == null || String(x).trim() === "")) continue;
    const first = norm(line[0]);
    if (first.startsWith("tong") || first.startsWith("total")) continue;
    const out: Row = {};
    let bad = false;
    spec.cols.forEach((c, i) => {
      const v = pos[i] >= 0 ? line[pos[i]] : null;
      // THAM_SO: giá trị ngày trong ô số → chuyển sang yyyy-mm-dd
      if (spec.sheet === "THAM_SO" && c.f === "value" && typeof v === "number" && String(out.key).startsWith("ngay_")) {
        out[c.f] = toDate(v, X); return;
      }
      if (spec.sheet === "THAM_SO" && c.f === "value" && typeof v === "number") { out[c.f] = String(v); return; }
      const res = convert(c, v, X);
      if (res.err) { issues.push({ sheet: spec.sheet, row: r + 1, col: c.h, msg: res.err, level: "error" }); bad = true; }
      if (res.warn) issues.push({ sheet: spec.sheet, row: r + 1, col: c.h, msg: res.warn, level: "warn" });
      if (res.val == null && c.req && !res.err) { issues.push({ sheet: spec.sheet, row: r + 1, col: c.h, msg: "Ô bắt buộc đang trống", level: "error" }); bad = true; }
      out[c.f] = res.val;
    });
    if (spec.sheet === "THAM_SO" && (out.value == null || out.value === "")) continue;
    if (bad) continue;
    if (spec.mode === "upsert" && spec.key.length) {
      const k = spec.key.map((f) => String(out[f])).join("|");
      if (seen.has(k)) {
        issues.push({ sheet: spec.sheet, row: r + 1, msg: `Trùng mã ${k} với dòng ${seen.get(k)} — lấy dòng sau`, level: "warn" });
        const idx = rows.findIndex((x) => spec.key.map((f) => String(x[f])).join("|") === k);
        if (idx >= 0) rows.splice(idx, 1);
      }
      seen.set(k, r + 1);
    }
    rows.push(out);
  }
  const kys = spec.mode === "replace_by_ky" ? Array.from(new Set(rows.map((x) => String(x.ky)))).sort() : [];
  return { spec, rows, kys };
}

/* ---------- Đọc cả file ---------- */
export async function parseWorkbook(buf: ArrayBuffer): Promise<ParseResult> {
  const X = await loadSheetJS();
  const wb = X.read(buf, { type: "array" });
  const issues: Issue[] = [];
  const sheets: ParsedSheet[] = [];
  const byNorm = new Map(SHEETS.map((s) => [norm(s.sheet), s]));
  const unknownSheets: string[] = [];
  for (const name of wb.SheetNames) {
    const spec = byNorm.get(norm(name));
    if (!spec) { if (norm(name) !== "huongdan") unknownSheets.push(name); continue; }
    const raw = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
    const ps = parseSheet(spec, raw, X, issues);
    if (ps && ps.rows.length) sheets.push(ps);
  }
  return { sheets, issues, unknownSheets };
}

/** Kiểm tra chéo: mã KH / mã NCC phải có trong danh mục (DB hiện có + file đang upload) */
export function crossCheck(res: ParseResult, dbCustomers: string[], dbSuppliers: string[]): void {
  const custs = new Set(dbCustomers);
  const sups = new Set(dbSuppliers);
  res.sheets.find((s) => s.spec.sheet === "DM_KHACH_HANG")?.rows.forEach((r) => custs.add(String(r.ma_kh)));
  res.sheets.find((s) => s.spec.sheet === "DM_NCC")?.rows.forEach((r) => sups.add(String(r.ma_ncc)));
  const check = (sheet: string, field: string, set: Set<string>, level: "error" | "warn", label: string) => {
    const ps = res.sheets.find((s) => s.spec.sheet === sheet);
    if (!ps) return;
    const missing = new Map<string, number>();
    ps.rows.forEach((r) => { const v = r[field]; if (v != null && !set.has(String(v))) missing.set(String(v), (missing.get(String(v)) || 0) + 1); });
    if (missing.size) {
      const list = Array.from(missing.keys()).slice(0, 8).join(", ");
      res.issues.push({ sheet, level, msg: `${missing.size} ${label} chưa có trong danh mục: ${list}${missing.size > 8 ? "…" : ""}` + (level === "error" ? " — bổ sung vào sheet danh mục rồi upload lại" : "") });
    }
  };
  check("GMV", "ma_kh", custs, "error", "mã KH");
  check("HOP_DONG", "ma_kh", custs, "error", "mã KH");
  check("CONG_NO_PHAI_THU", "ma_kh", custs, "warn", "mã KH");
  check("GMV", "ma_ncc", sups, "warn", "mã NCC");
  check("CONG_NO_PHAI_TRA", "ma_ncc", sups, "warn", "mã NCC");
}
