// Số liệu bán hàng cho khách & trả nhà cung cấp — nguồn của tab Tổng quan › Điều hành và Travel & SaaS.
// Chỉ tính phần bán hàng (không có hoa hồng, lương, chi phí vận hành):
//
//   Net revenue = GMV − giá vốn
//   Margin      = Net revenue ÷ GMV   (profit margin, %)
//
// Nguồn:
//   · Travel & SaaS: bảng fin_gmv. Dòng có cột ngày thì xem được theo ngày; ngày nào chưa up số
//     thì lấy số của ngày có số gần nhất trước đó, cho tới khi được cập nhật.
//   · Mobility: giao dịch ở tab Mobility (dashboard XPAY). Giá vốn = GMV × (1 − % chiết khấu đơn vị
//     cung cấp), % cấu hình theo từng đơn vị ở tab Dữ liệu. Chưa có giao dịch thì dùng fin_gmv.
import type { DataSet } from "./types";
import { Ctx, num, SEG_DV, Seg, hasActual, laTong, onTimeByGroup, SEG_GROUPS, makeCtx, mergeEdits } from "./calc";
import { kyIdx, kyAdd, kyOfDate, kyEnd, addDays, todayIso, sum, ok } from "./util";

export type Mode = "ky" | "ngay";
export type Dim = "dv" | "kh" | "ncc";
/** Một dòng phát sinh đã chuẩn hoá. ngay = null khi nguồn chỉ có số cả tháng. */
/** gmvC = phần GMV đã có giá vốn (bảng kê chưa nối được đối soát NCC thì chưa có giá vốn) */
export interface Fact { seg: Seg; ky: string; ngay: string | null; kh: string; ncc: string; dv: string; gmv: number; gv: number; gmvC: number }
/** nr (Net revenue) = GMV đã có giá vốn − giá vốn */
export interface Sum { gmv: number; gv: number; gmvC: number; nr: number; kh: number }
export const ZERO: Sum = { gmv: 0, gv: 0, gmvC: 0, nr: 0, kh: 0 };
/** Margin = Net revenue ÷ GMV — tính trên phần GMV đã có giá vốn */
export const mgOf = (s: { gmvC: number; nr: number }) => (s.gmvC ? s.nr / s.gmvC : null);
/** Tỷ lệ GMV đã có giá vốn */
export const covOf = (s: { gmv: number; gmvC: number }) => (s.gmv ? s.gmvC / s.gmv : null);

/* ---------------- Cấu hình giá vốn Mobility ---------------- */
export const CFG_KY = "CFG";
export const MOB_DEFAULT_UNIT = "*";
export const MOB_DEFAULT_RATE = 0.1;
/** % chiết khấu đơn vị cung cấp trả lại theo đơn vị (fin_manual nhom 'cfg', khoa 'mob_ck|<đơn vị>'; '*' = mặc định) */
export function mobCfg(D: DataSet) {
  const unit = new Map<string, number>();
  (D.manual || []).forEach((x) => { if (x.nhom === "cfg" && x.ky === CFG_KY && x.gia_tri != null && x.khoa.startsWith("mob_ck|")) unit.set(x.khoa.slice(7), Number(x.gia_tri)); });
  const def = unit.get(MOB_DEFAULT_UNIT) ?? MOB_DEFAULT_RATE;
  return { unit, def, rate: (u: string) => unit.get(u) ?? def };
}

/* ---------------- Dựng các dòng phát sinh ---------------- */
const SVC_NAME: Record<string, string> = { Hotel: "Hotel", Flight: "Flight", "SaaS Travel": "SaaS", "SaaS Mobility": "SaaS Mobility", "F&B": "F&B", Mobility: "Mobility" };
export interface Facts {
  all: Fact[]; mobTab: boolean; mobUpdated: string | null;
  /** mảng có số theo ngày */
  daily: Record<Seg, boolean>;
  /** các ngày có số của từng mảng, tăng dần */
  days: Record<Seg, string[]>;
  /** ngày có số gần nhất (không vượt hôm nay) */
  lastDay: string | null;
  names: Map<string, string>;
  byDay: Map<string, Fact[]>;
}
const cache = new WeakMap<Ctx, Facts>();
export function facts(C: Ctx): Facts {
  const hit = cache.get(C);
  if (hit) return hit;
  const D = C.D, cfg = mobCfg(D);
  const all: Fact[] = [];
  const names = new Map<string, string>();
  D.customers.forEach((c) => names.set(c.ma_kh, c.ten_viet_tat || c.ten_kh));
  const mob = D.mob && D.mob.rows.length ? D.mob : null;
  D.gmv.forEach((r) => {
    const seg: Seg | null = SEG_DV.ts.includes(r.dich_vu) ? "ts" : SEG_DV.m.includes(r.dich_vu) ? "m" : null;
    if (!seg) return;
    // Mobility lấy từ tab Mobility; riêng SaaS Mobility vẫn ở fin_gmv
    if (seg === "m" && mob && r.dich_vu === "Mobility") return;
    const ngay = r.ngay && /^\d{4}-\d{2}-\d{2}$/.test(r.ngay) ? r.ngay : null;
    const gmvC = r.gmv_co_gv == null ? r.gmv : Number(r.gmv_co_gv);
    all.push({ seg, ky: ngay ? kyOfDate(ngay) : r.ky, ngay, kh: r.ma_kh, ncc: r.ma_ncc || "", dv: SVC_NAME[r.dich_vu] || r.dich_vu, gmv: r.gmv, gv: r.gia_von, gmvC });
  });
  if (mob) {
    Object.entries(mob.names).forEach(([k, n]) => { if (!names.has(k)) names.set(k, n); });
    mob.rows.forEach(([d, key, u, g]) => all.push({ seg: "m", ky: kyOfDate(d), ngay: d, kh: key, ncc: u, dv: "Mobility", gmv: g, gv: g * (1 - cfg.rate(u)), gmvC: g }));
  }
  const byDay = new Map<string, Fact[]>();
  all.forEach((f) => { if (!f.ngay) return; const k = `${f.seg}|${f.ngay}`; const a = byDay.get(k) || []; a.push(f); byDay.set(k, a); });
  const dset = (seg: Seg) => Array.from(new Set(all.filter((f) => f.seg === seg && f.ngay).map((f) => f.ngay as string))).sort();
  const days = { ts: dset("ts"), m: dset("m") };
  const today = todayIso();
  const lastDay = [...days.ts, ...days.m].filter((d) => d <= today).sort().slice(-1)[0] || null;
  const out: Facts = { all, mobTab: !!mob, mobUpdated: D.mob?.updated_at ?? null, daily: { ts: days.ts.length > 0, m: days.m.length > 0 }, days, lastDay, names, byDay };
  cache.set(C, out);
  return out;
}
/** Kỳ có số thực tế (file GMV hoặc giao dịch Mobility) */
export function hasAnyActual(C: Ctx, ky: string): boolean {
  return hasActual(C, ky) || facts(C).all.some((f) => f.ky === ky && f.gmv);
}

/** Số phát sinh của một mảng trong một ngày.
 *  Travel & SaaS: ngày SAU ngày cuối cùng đã up số → lấy số của ngày có số gần nhất (from = ngày lấy số);
 *  ngày nằm trong khoảng đã up mà không có giao dịch là 0.
 *  Mobility: giao dịch thật, ngày không có giao dịch là 0. */
export function dayFacts(C: Ctx, seg: Seg, day: string): { fs: Fact[]; from: string | null } {
  const F = facts(C);
  const own = F.byDay.get(`${seg}|${day}`);
  if (own) return { fs: own, from: day };
  if (seg !== "ts") return { fs: [], from: null };
  const ds = F.days.ts;
  if (!ds.length || day <= ds[ds.length - 1]) return { fs: [], from: day };
  let lo = 0, hi = ds.length - 1, best = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (ds[mid] < day) { best = mid; lo = mid + 1; } else hi = mid - 1; }
  if (best < 0) return { fs: [], from: null };
  return { fs: F.byDay.get(`ts|${ds[best]}`) || [], from: ds[best] };
}

export function sumOf(fs: Fact[]): Sum {
  const gmv = sum(fs, (f) => f.gmv), gv = sum(fs, (f) => f.gv), gmvC = sum(fs, (f) => f.gmvC);
  const kh = new Set(fs.filter((f) => f.gmv > 0 && !laTong(f.kh)).map((f) => f.kh)).size;
  return { gmv, gv, gmvC, nr: gmvC - gv, kh };
}
const add = (a: Sum, b: Sum): Sum => ({ gmv: a.gmv + b.gmv, gv: a.gv + b.gv, gmvC: a.gmvC + b.gmvC, nr: a.nr + b.nr, kh: a.kh + b.kh });
const scale = (s: Sum, k: number): Sum => ({ gmv: s.gmv * k, gv: s.gv * k, gmvC: s.gmvC * k, nr: s.nr * k, kh: s.kh * k });

/* ---------------- Cửa sổ thời gian ---------------- */
export interface Win {
  mode: Mode; ky: string; ngay: string;
  curL: string; prevL: string; avgL: string;
  /** kỳ đang chạy: so với cùng số ngày của kỳ trước */
  cutDom: number | null;
  /** chế độ ngày: ngày hôm qua và 7 ngày trước ngày đang xem */
  yday: string; last7: string[];
}
const dom = (d: string) => Number(d.slice(8, 10));
export function makeWin(C: Ctx, mode: Mode, ky: string, ngay?: string): Win {
  const F = facts(C);
  const day = ngay || F.lastDay || todayIso();
  const yday = addDays(day, -1), last7 = Array.from({ length: 7 }, (_, i) => addDays(day, -7 + i));
  if (mode === "ngay") return { mode, ky: kyOfDate(day), ngay: day, curL: "hôm nay", prevL: "hôm qua", avgL: "TB 7 ngày", cutDom: null, yday, last7 };
  // Kỳ đang chạy (ngày có số gần nhất chưa tới cuối kỳ): so cùng số ngày với kỳ trước
  const lastIn = F.all.reduce<string | null>((m, f) => (f.ky === ky && f.ngay && (!m || f.ngay > m) ? f.ngay : m), null);
  const running = !!lastIn && lastIn < kyEnd(ky) && kyOfDate(todayIso()) === ky;
  const cutDom = running ? dom(lastIn as string) : null;
  const p = kyAdd(ky, -1);
  return { mode, ky, ngay: day, curL: running ? `${ky} tới ${(lastIn as string).slice(8, 10)}/${(lastIn as string).slice(5, 7)}` : ky,
    prevL: running ? `cùng kỳ ${p}` : `kỳ ${p}`, avgL: "", cutDom, yday, last7 };
}

/** Các dòng của một mảng trong cửa sổ: cur = hiện tại, prev = kỳ trước / hôm qua, avg = 7 ngày (chưa chia) */
export function windowFacts(C: Ctx, W: Win, seg: Seg, which: "cur" | "prev" | "avg"): Fact[] {
  const F = facts(C);
  if (W.mode === "ngay") {
    const ds = which === "cur" ? [W.ngay] : which === "prev" ? [W.yday] : W.last7;
    return ds.flatMap((d) => dayFacts(C, seg, d).fs);
  }
  if (which === "avg") return [];
  const k = which === "cur" ? W.ky : kyAdd(W.ky, -1);
  return F.all.filter((f) => f.seg === seg && f.ky === k && (which === "cur" || W.cutDom == null || !f.ngay || dom(f.ngay) <= W.cutDom));
}
/** TB 7 ngày: tiền chia 7; số khách = trung bình số khách phát sinh mỗi ngày */
function avgSum(C: Ctx, W: Win, seg: Seg): Sum {
  let s = ZERO;
  W.last7.forEach((d) => { s = add(s, sumOf(dayFacts(C, seg, d).fs)); });
  return scale(s, 1 / 7);
}

/* ---------------- Kế hoạch ---------------- */
export interface Plan { gmv: number; nr: number; kh: number }
export function planOf(C: Ctx, seg: Seg | null, ky: string): Plan {
  const D = C.D, T = D.targets.find((t) => t.ky === ky);
  if (!T) return { gmv: 0, nr: 0, kh: 0 };
  const n = (v: number | null | undefined) => Number(v || 0), tm = (k: string) => num(D, k);
  const ts: Plan = { gmv: n(T.gmv_hotel) + n(T.gmv_flight) + n(T.gmv_saas_t) + n(T.gmv_fnb),
    nr: n(T.gmv_hotel) * tm("target_margin_hotel") + n(T.gmv_flight) * tm("target_margin_flight") + n(T.gmv_saas_t) * tm("target_margin_saas") + n(T.gmv_fnb) * tm("target_margin_fnb"),
    kh: n(T.kh_n1) };
  const mobG = n(T.gmv_n2) + n(T.gmv_n3) + n(T.gmv_n4) + n(T.gmv_n5);
  const m: Plan = { gmv: mobG + n(T.gmv_saas_m), nr: mobG * tm("target_margin_mobility") + n(T.gmv_saas_m) * tm("target_margin_saas"),
    kh: n(T.kh_n2) + n(T.kh_n3) + n(T.kh_n4) + n(T.kh_n5) };
  if (seg === "ts") return ts;
  if (seg === "m") return m;
  return { gmv: ts.gmv + m.gmv, nr: ts.nr + m.nr, kh: ts.kh + m.kh };
}
export const daysIn = (ky: string) => Number(kyEnd(ky).slice(8, 10));

/* ---------------- Một khối số liệu: hiện tại + các mốc so sánh ---------------- */
export interface Block {
  cur: Sum; prev: Sum; avg: Sum | null; plan: Plan;
  /** chế độ ngày nhưng mảng chưa có số theo ngày */
  noDaily: boolean;
  /** Travel & SaaS chế độ ngày: ngày đang xem chưa up số, đang lấy số của ngày này */
  carried: string | null;
}
export function block(C: Ctx, W: Win, seg: Seg | null): Block {
  const F = facts(C);
  const segs: Seg[] = seg ? [seg] : ["ts", "m"];
  let cur = ZERO, prev = ZERO, avg: Sum | null = W.mode === "ngay" ? ZERO : null;
  segs.forEach((s) => {
    cur = add(cur, sumOf(windowFacts(C, W, s, "cur")));
    prev = add(prev, sumOf(windowFacts(C, W, s, "prev")));
    if (avg) avg = add(avg, avgSum(C, W, s));
  });
  // số khách gộp hai mảng: đếm khách không trùng
  if (!seg) {
    const kh = (w: "cur" | "prev") => new Set(segs.flatMap((s) => windowFacts(C, W, s, w)).filter((f) => f.gmv > 0 && !laTong(f.kh)).map((f) => f.kh)).size;
    cur = { ...cur, kh: kh("cur") }; prev = { ...prev, kh: kh("prev") };
  }
  const pk = planOf(C, seg, W.ky);
  const plan = W.mode === "ngay" ? { gmv: pk.gmv / daysIn(W.ky), nr: pk.nr / daysIn(W.ky), kh: 0 } : pk;
  const noDaily = W.mode === "ngay" && !segs.some((s) => F.daily[s]);
  let carried: string | null = null;
  if (W.mode === "ngay" && segs.includes("ts") && F.daily.ts) { const d = dayFacts(C, "ts", W.ngay).from; if (d && d !== W.ngay) carried = d; }
  return { cur, prev, avg, plan, noDaily, carried };
}

/* ---------------- Chia theo mảng / khách / NCC ---------------- */
export interface DimRow { k: string; ten: string; sub: string; cur: Sum; cmp: Sum }
export function byDim(C: Ctx, W: Win, seg: Seg, dim: Dim): DimRow[] {
  const F = facts(C), sup = new Map(C.D.suppliers.map((s) => [s.ma_ncc, s]));
  const keyOf = (f: Fact) => (dim === "dv" ? f.dv : dim === "kh" ? f.kh : f.ncc || "—");
  const g = new Map<string, { c: Fact[]; p: Fact[] }>();
  const put = (fs: Fact[], w: "c" | "p") => fs.forEach((f) => { const k = keyOf(f), o = g.get(k) || { c: [], p: [] }; o[w].push(f); g.set(k, o); });
  put(windowFacts(C, W, seg, "cur"), "c");
  put(windowFacts(C, W, seg, W.mode === "ngay" ? "avg" : "prev"), "p");
  const k7 = W.mode === "ngay" ? 1 / 7 : 1;
  return Array.from(g.entries()).map(([k, o]) => {
    const c = C.cust.get(k), s = sup.get(k);
    const ten = dim === "dv" ? k : dim === "kh" ? F.names.get(k) || k : k === "—" ? "Chưa gán NCC" : s?.ten_ncc || k;
    const sub = dim === "kh" ? [c?.nhom, c?.pm ? "PM " + c.pm : ""].filter(Boolean).join(" · ") : dim === "ncc" ? s?.nganh || "" : "";
    const cmp = scale(sumOf(o.p), k7);
    if (W.mode === "ngay") cmp.kh = sumOf(o.p).kh / 7;
    return { k, ten, sub, cur: sumOf(o.c), cmp };
  }).sort((a, b) => b.cur.gmv - a.cur.gmv || b.cmp.gmv - a.cmp.gmv);
}
/** Giữ n dòng đầu, gộp phần còn lại thành một dòng */
export function topRest(rows: DimRow[], n: number, label = "Còn lại"): DimRow[] {
  if (rows.length <= n + 1) return rows;
  const rest = rows.slice(n);
  return [...rows.slice(0, n), { k: "__rest", ten: `${label} (${rest.length})`, sub: "", cur: rest.reduce((s, r) => add(s, r.cur), ZERO), cmp: rest.reduce((s, r) => add(s, r.cmp), ZERO) }];
}

/* ---------------- Cầu nối GMV theo khách (kỳ trước → kỳ này) ---------------- */
export interface FBridge { prev: number; cur: number; nw: number; up: number; down: number; lost: number; nNew: number; nUp: number; nDown: number; nLost: number;
  by: { k: string; a: number; b: number; d: number; n: number }[] }
export function bridgeOf(C: Ctx, W: Win, seg: Seg, groupBy: (f: Fact) => string): FBridge {
  const per = (fs: Fact[]) => { const m = new Map<string, number>(); fs.forEach((f) => { if (!laTong(f.kh)) m.set(f.kh, (m.get(f.kh) || 0) + f.gmv); }); return m; };
  const cf = windowFacts(C, W, seg, "cur"), pf = windowFacts(C, W, seg, "prev");
  const cur = per(cf), prv = per(pf);
  const grp = new Map<string, string>();
  [...cf, ...pf].forEach((f) => { if (!grp.has(f.kh)) grp.set(f.kh, groupBy(f)); });
  const o: FBridge = { prev: 0, cur: 0, nw: 0, up: 0, down: 0, lost: 0, nNew: 0, nUp: 0, nDown: 0, nLost: 0, by: [] };
  const by = new Map<string, { k: string; a: number; b: number; d: number; n: number }>();
  new Set([...Array.from(cur.keys()), ...Array.from(prv.keys())]).forEach((k) => {
    const a = prv.get(k) || 0, b = cur.get(k) || 0, d = b - a;
    o.prev += a; o.cur += b;
    if (a <= 0 && b > 0) { o.nw += b; o.nNew++; } else if (a > 0 && b <= 0) { o.lost += d; o.nLost++; }
    else if (d > 0) { o.up += d; o.nUp++; } else if (d < 0) { o.down += d; o.nDown++; }
    const gk = grp.get(k) || "—", x = by.get(gk) || { k: gk, a: 0, b: 0, d: 0, n: 0 };
    x.a += a; x.b += b; x.d += d; x.n += b > 0 ? 1 : 0; by.set(gk, x);
  });
  o.by = Array.from(by.values()).sort((x, y) => x.d - y.d);
  return o;
}

/* ---------------- Net revenue theo khách trong cửa sổ hiện tại ---------------- */
export function nrByCustomer(C: Ctx, W: Win, seg: Seg): { k: string; ten: string; sub: string; gmv: number; gmvC: number; nr: number }[] {
  const F = facts(C), m = new Map<string, { gmv: number; gmvC: number; nr: number }>();
  windowFacts(C, W, seg, "cur").forEach((f) => { if (laTong(f.kh)) return; const o = m.get(f.kh) || { gmv: 0, gmvC: 0, nr: 0 }; o.gmv += f.gmv; o.gmvC += f.gmvC; o.nr += f.gmvC - f.gv; m.set(f.kh, o); });
  return Array.from(m.entries()).map(([k, o]) => { const c = C.cust.get(k); return { k, ten: F.names.get(k) || k, sub: [c?.nhom, c?.pm ? "PM " + c.pm : ""].filter(Boolean).join(" · "), ...o }; })
    .sort((a, b) => b.nr - a.nr);
}

/* ---------------- Thu đúng hạn của một mảng (kỳ nợ gần nhất đã có khoản đến hạn) ---------------- */
export function onTimeSeg(C: Ctx, ky: string, seg: Seg | null): { rate: number | null; ky: string } {
  const gs = seg ? SEG_GROUPS[seg] : ["N1", "N2", "N3", "N4", "N5"];
  for (let i = 0; i < 4; i++) {
    const k = kyAdd(ky, -i), o = onTimeByGroup(C, k);
    const os = gs.map((g) => o[g]).filter((x) => x && ok(x.rate));
    const judged = sum(os, (x) => x.billed - x.notDue);
    if (judged > 0) return { rate: sum(os, (x) => x.onTime) / judged, ky: k };
  }
  return { rate: null, ky };
}

/* ---------------- Xuất hóa đơn & thu tiền theo tháng (phải thu) ---------------- */
export interface InvMonth { ky: string; inv: number; col: number; bal: number }
export interface InvCol { months: InvMonth[]; totInv: number; totCol: number; noDate: number; day: { inv: number; col: number; avgInv: number; avgCol: number } | null }
/** Ngày xuất hóa đơn: ngày hóa đơn → ngày gửi bảng kê → ngày đầu tháng sau kỳ nợ */
const invDate = (r: { ngay_hd: string | null; ngay_gui_bk: string | null; ky: string }) => r.ngay_hd || r.ngay_gui_bk || addDays(kyEnd(r.ky), 1);
/** Ngày thu: ngày thu đủ → ngày thu gần nhất */
const colDate = (r: { ngay_thu_du: string | null; ngay_thu_gan_nhat: string | null }) => r.ngay_thu_du || r.ngay_thu_gan_nhat || null;
export function invCol(C: Ctx, toKy: string, n = 6, W?: Win): InvCol {
  const rows = C.D.ar.filter((r) => r.so_tien > 0);
  const kys = Array.from({ length: n }, (_, i) => kyAdd(toKy, i - n + 1));
  const col = rows.map((r) => ({ d: colDate(r), v: Math.min(r.da_thu || 0, r.so_tien) })).filter((x) => x.v > 0);
  const noDate = sum(col.filter((x) => !x.d), (x) => x.v);
  const months = kys.map((k) => {
    const end = kyEnd(k);
    return {
      ky: k,
      inv: sum(rows.filter((r) => kyOfDate(invDate(r)) === k), (r) => r.so_tien),
      col: sum(col.filter((x) => x.d && kyOfDate(x.d) === k), (x) => x.v),
      bal: sum(rows.filter((r) => invDate(r) <= end), (r) => r.so_tien) - sum(col.filter((x) => x.d && x.d <= end), (x) => x.v),
    };
  });
  let day: InvCol["day"] = null;
  if (W && W.mode === "ngay") {
    const d = W.ngay, a = W.last7[0], y = W.yday;
    day = {
      inv: sum(rows.filter((r) => invDate(r) === d), (r) => r.so_tien), col: sum(col.filter((x) => x.d === d), (x) => x.v),
      avgInv: sum(rows.filter((r) => invDate(r) >= a && invDate(r) <= y), (r) => r.so_tien) / 7,
      avgCol: sum(col.filter((x) => x.d && x.d >= a && x.d <= y), (x) => x.v) / 7,
    };
  }
  return { months, totInv: sum(rows, (r) => r.so_tien), totCol: sum(col, (x) => x.v), noDate, day };
}

/** Kỳ gần nhất (không vượt tháng hiện tại) có số thực tế */
export function latestActualKy(C: Ctx): string | null {
  const now = kyIdx(kyOfDate(todayIso()));
  return C.periods.filter((p) => kyIdx(p) <= now && hasAnyActual(C, p)).slice(-1)[0] || null;
}

/* ---------------- Dựng ngữ cảnh cho dashboard ----------------
   Bọc makeCtx(mergeEdits(D)) với hai quy tắc thêm:
   1. Ngày gửi bảng kê luôn lấy theo bảng tổng (sửa ở mức kỳ), kể cả khi có số sửa riêng của một hóa đơn.
   2. Danh sách kỳ có thêm các tháng có giao dịch ở tab Mobility. */
export function dashCtx(D0: DataSet): Ctx {
  const D = mergeEdits(D0);
  const kyLevel = new Map(D0.arEdits.filter((e) => !e.so_ct && !e.tu_tao && !e.xoa && e.ngay_gui_bk).map((e) => [`${e.ma_kh}|${e.ky}`, e.ngay_gui_bk as string]));
  const ar = kyLevel.size ? D.ar.map((r) => { const g = kyLevel.get(`${r.ma_kh}|${r.ky}`); return g && g !== r.ngay_gui_bk ? { ...r, ngay_gui_bk: g, nguonBK: "web" as const } : r; }) : D.ar;
  const C = makeCtx({ ...D, ar });
  const mobKys = Array.from(new Set((D0.mob?.rows || []).map((r) => kyOfDate(r[0]))));
  const periods = Array.from(new Set([...C.periods, ...mobKys])).filter((k) => ok(kyIdx(k))).sort((a, b) => kyIdx(a) - kyIdx(b));
  return { ...C, periods };
}
