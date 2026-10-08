// Các góc nhìn cấp điều hành, tính hoàn toàn từ dữ liệu gốc đã có (không thêm bảng):
//   1. Xu hướng theo thời gian — gom tháng / quý / năm, so với kỳ trước và cùng kỳ năm trước
//   2. Lợi nhuận ròng theo từng khách — sau hoa hồng, chi phí phục vụ và chi phí vốn
//   3. LTV / CAC theo nhóm khách
//   4. Dự báo số dư tiền theo tuần, nhiều kịch bản thu tiền
//   5. Phân tích nguyên nhân cho cảnh báo (vì sao GMV hụt, vì sao thu chậm, vì sao margin thấp)
import type { GmvRow } from "./types";
import {
  Ctx, Period, AR, AP, Cash, Alert, WhyBlock, WhyItem, AlertRef,
  calcPeriod, hasActual, num, laTong, LINE_DEFS, Axis, AXIS_NAME, onTimeByGroup,
} from "./calc";
import { kyIdx, kyAdd, kyEnd, kyFromIdx, kyOfDate, addDays, days, sum, ok } from "./util";

/* ==========================================================================
   Bộ nhớ đệm — calcPeriod tốn công, nhiều góc nhìn cần cùng một kỳ
   ========================================================================== */
const cache = new WeakMap<Ctx, Map<string, unknown>>();
function memo<T>(C: Ctx, key: string, f: () => T): T {
  let m = cache.get(C);
  if (!m) { m = new Map(); cache.set(C, m); }
  if (!m.has(key)) m.set(key, f());
  return m.get(key) as T;
}
export const periodOf = (C: Ctx, ky: string): Period => memo(C, "P|" + ky, () => calcPeriod(C, ky));

const grpOf = (C: Ctx, kh: string) => C.cust.get(kh)?.nhom || "?";
const tenOf = (C: Ctx, kh: string) => { const c = C.cust.get(kh); return c?.ten_viet_tat || c?.ten_kh || kh; };
const axisOf = (C: Ctx, r: GmvRow): Axis | null => LINE_DEFS.find((l) => l.match(r, grpOf(C, r.ma_kh)))?.axis ?? null;
export const GROUPS = ["N1", "N2", "N3", "N4", "N5"];

/** Kỳ có số liệu GMV thực tế, cũ → mới */
export const actualPeriods = (C: Ctx) => C.periods.filter((p) => hasActual(C, p));

/* ---------- Số liệu một khách trong một kỳ ---------- */
export interface CustMonth {
  ma_kh: string; gmv: number; cost: number; disc: number; mgNet: number;
  mgT: number; mgM: number; mgS: number; gmvT: number; gmvM: number;
}
export function custMonth(C: Ctx, ky: string): Map<string, CustMonth> {
  return memo(C, "CM|" + ky, () => {
    const ck = num(C.D, "chiet_khau_mobility");
    const m = new Map<string, CustMonth>();
    (C.gmvByKy.get(ky) || []).forEach((r) => {
      if (laTong(r.ma_kh)) return;
      const o = m.get(r.ma_kh) || { ma_kh: r.ma_kh, gmv: 0, cost: 0, disc: 0, mgNet: 0, mgT: 0, mgM: 0, mgS: 0, gmvT: 0, gmvM: 0 };
      const disc = r.dich_vu === "Mobility" ? (r.chiet_khau != null ? r.chiet_khau : r.gmv * ck) : 0;
      const mg = r.gmv - r.gia_von - disc;
      o.gmv += r.gmv; o.cost += r.gia_von; o.disc += disc; o.mgNet += mg;
      const ax = axisOf(C, r);
      if (ax === "T") { o.mgT += r.gmv - r.gia_von; o.gmvT += r.gmv; }
      else if (ax === "M") { o.mgM += mg; o.gmvM += r.gmv; }
      else if (ax === "S") o.mgS += r.gmv - r.gia_von;
      m.set(r.ma_kh, o);
    });
    return m;
  });
}
const activeSet = (C: Ctx, ky: string) => new Set(Array.from(custMonth(C, ky).values()).filter((x) => x.gmv > 0).map((x) => x.ma_kh));

/* ==========================================================================
   1. XU HƯỚNG THEO THỜI GIAN
   ========================================================================== */
export type Gran = "m" | "q" | "y";
export interface TrendBucket {
  key: string; label: string; months: string[]; full: boolean;
  gmv: number; tgt: number; mg: number; mgPct: number | null; x: number | null;
  comm: number; opex: number | null; ebitda: number | null;
  act: number; nw: number; lost: number;
  arBilled: number; collected: number; cashIn: number | null; cashOut: number | null;
  axis: Record<Axis, number>; mgAxis: Record<Axis, number>;
}
export interface TrendCust { ma_kh: string; ten: string; nhom: string; pm: string; gmv: number[]; mg: number[]; totG: number; totM: number; first: number | null; last: number | null; growth: number | null }
export interface Trend { buckets: TrendBucket[]; prevYear: Map<string, TrendBucket>; custs: TrendCust[]; gran: Gran; from: string; to: string }

const bucketKey = (ky: string, g: Gran) => {
  const i = kyIdx(ky), y = Math.floor(i / 12), m = (i % 12) + 1;
  return g === "m" ? ky : g === "q" ? `Q${Math.ceil(m / 3)}.${y}` : String(y);
};
const bucketLabel = (key: string, g: Gran) => (g === "m" ? key.slice(0, 3) + "." + key.slice(6) : key);
const bucketSize = (g: Gran) => (g === "m" ? 1 : g === "q" ? 3 : 12);

/** Các tháng từ `from` tới `to` (gồm cả hai đầu) */
export function monthsBetween(from: string, to: string): string[] {
  const a = kyIdx(from), b = kyIdx(to);
  if (!ok(a) || !ok(b) || b < a) return [];
  const out: string[] = [];
  for (let i = a; i <= b && out.length < 120; i++) out.push(kyFromIdx(i));
  return out;
}

function monthMetrics(C: Ctx, m: string) {
  const has = hasActual(C, m);
  const P = has || C.D.targets.some((t) => t.ky === m) ? periodOf(C, m) : null;
  const cm = custMonth(C, m);
  const act = activeSet(C, m), prevAct = activeSet(C, kyAdd(m, -1));
  const firstData = actualPeriods(C)[0];
  let nw = 0, lost = 0;
  if (has && m !== firstData) {
    act.forEach((k) => { if (!prevAct.has(k)) nw++; });
    prevAct.forEach((k) => { if (!act.has(k)) lost++; });
  }
  const axis = { T: 0, M: 0, S: 0, F: 0 } as Record<Axis, number>;
  const mgAxis = { T: 0, M: 0, S: 0, F: 0 } as Record<Axis, number>;
  P?.lines.forEach((l) => { axis[l.axis] += l.act; mgAxis[l.axis] += l.mgNet; });
  const arBilled = sum(C.D.ar.filter((r) => r.ky === m), (r) => r.so_tien);
  const collected = sum(C.D.ar.filter((r) => { const d = r.ngay_thu_du || r.ngay_thu_gan_nhat; return d != null && kyOfDate(d) === m; }), (r) => r.da_thu || 0);
  const halves = C.D.cash.filter((r) => r.ky_nua_thang.startsWith(m));
  return {
    has, gmv: P?.totAct || 0, tgt: P?.totTgt || 0, mg: P?.gp || 0, comm: has && P ? P.comm : 0,
    opex: P?.opexOp ?? null, ebitda: P?.ebitda ?? null, act: act.size, nw, lost, axis, mgAxis, arBilled, collected,
    hasCash: halves.length > 0, cm,
  };
}

export function trendData(C: Ctx, from: string, to: string, gran: Gran, cashFn?: (m: string) => { thu: number; chi: number } | null): Trend {
  const months = monthsBetween(from, to);
  const mk = (ms: string[]) => {
    const by = new Map<string, string[]>();
    ms.forEach((m) => { const k = bucketKey(m, gran); const a = by.get(k) || []; a.push(m); by.set(k, a); });
    return Array.from(by.entries()).map(([key, mm]): TrendBucket => {
      const X = mm.map((m) => monthMetrics(C, m));
      const gmv = sum(X, (x) => x.gmv), tgt = sum(X, (x) => x.tgt), mg = sum(X, (x) => x.mg);
      const allOpex = X.filter((x) => x.has).every((x) => x.opex != null) && X.some((x) => x.has);
      const uniq = new Set<string>();
      X.forEach((x) => x.cm.forEach((v, k) => { if (v.gmv > 0) uniq.add(k); }));
      const cash = cashFn ? mm.map(cashFn).filter((c): c is { thu: number; chi: number } => c != null) : [];
      const axis = { T: 0, M: 0, S: 0, F: 0 } as Record<Axis, number>, mgAxis = { T: 0, M: 0, S: 0, F: 0 } as Record<Axis, number>;
      X.forEach((x) => (Object.keys(axis) as Axis[]).forEach((a) => { axis[a] += x.axis[a]; mgAxis[a] += x.mgAxis[a]; }));
      return {
        key, label: bucketLabel(key, gran), months: mm, full: mm.length === bucketSize(gran),
        gmv, tgt, mg, mgPct: gmv ? mg / gmv : null, x: tgt ? gmv / tgt : null,
        comm: sum(X, (x) => x.comm), opex: allOpex ? sum(X, (x) => x.opex || 0) : null,
        ebitda: allOpex ? sum(X, (x) => x.ebitda || 0) : null,
        act: uniq.size, nw: sum(X, (x) => x.nw), lost: sum(X, (x) => x.lost),
        arBilled: sum(X, (x) => x.arBilled), collected: sum(X, (x) => x.collected),
        cashIn: cash.length ? sum(cash, (c) => c.thu) : null, cashOut: cash.length ? sum(cash, (c) => c.chi) : null,
        axis, mgAxis,
      };
    });
  };
  const buckets = mk(months);
  // cùng kỳ năm trước — chỉ tính khi có dữ liệu
  const py = months.map((m) => kyAdd(m, -12)).filter((m) => hasActual(C, m));
  const prevYear = new Map<string, TrendBucket>();
  if (py.length) mk(py).forEach((b) => {
    const k = b.key.replace(/\d{4}$/, (y) => String(Number(y) + 1));
    prevYear.set(k, b);
  });
  // khách hàng theo từng mốc
  const ids = new Set<string>();
  buckets.forEach((b) => b.months.forEach((m) => custMonth(C, m).forEach((_, k) => ids.add(k))));
  const custs: TrendCust[] = Array.from(ids).map((k) => {
    const gmv = buckets.map((b) => sum(b.months, (m) => custMonth(C, m).get(k)?.gmv || 0));
    const mg = buckets.map((b) => sum(b.months, (m) => custMonth(C, m).get(k)?.mgNet || 0));
    const nz = gmv.map((v, i) => [v, i] as [number, number]).filter(([v]) => v > 0);
    const first = nz.length ? nz[0][0] : null, last = gmv[gmv.length - 1] ?? null;
    const c = C.cust.get(k);
    return {
      ma_kh: k, ten: tenOf(C, k), nhom: c?.nhom || "?", pm: c?.pm || "—", gmv, mg, totG: sum(gmv, (v) => v), totM: sum(mg, (v) => v),
      first, last, growth: gmv.length > 1 && gmv[0] > 0 ? (gmv[gmv.length - 1] - gmv[0]) / gmv[0] : null,
    };
  }).sort((a, b) => b.totG - a.totG);
  return { buckets, prevYear, custs, gran, from, to };
}

/* ==========================================================================
   2. LỢI NHUẬN RÒNG THEO TỪNG KHÁCH
   Margin net
     − hoa hồng PM (quỹ của nhóm chia theo margin net của khách trong nhóm)
     − hoa hồng Sales pool GMV (phần Travel theo margin Travel, phần Mobility theo margin net Mobility)
     − hoa hồng SaaS (theo margin SaaS)
     − Partnership (Travel theo margin Travel, Mobility theo margin net Mobility)
     − chi phí phục vụ (chi phí vận hành trừ Marketing, chia theo tham số cts_phan_bo)
     − chi phí vốn (tiền công ty phải ứng từ lúc trả NCC tới lúc thu được tiền khách)
   Thưởng hợp đồng mới để riêng, vì đó là chi phí THU HÚT khách (tính vào CAC).
   ========================================================================== */
export interface CustProfit {
  ma_kh: string; ten: string; nhom: string; pm: string; sales: string; term: number | null;
  gmv: number; mgNet: number; pmC: number; salesC: number; saasC: number; partC: number; hd: number;
  cts: number; capital: number; capDays: number | null; net: number; netPct: number | null;
}
export interface Profitability {
  ky: string; rows: CustProfit[]; tot: Omit<CustProfit, "ma_kh" | "ten" | "nhom" | "pm" | "sales" | "term" | "capDays" | "netPct">;
  rate: number; dpo: number; ctsMode: string; ctsPool: number; marketing: number; unalloc: number;
}
const share = (v: number, tot: number) => (tot > 0 ? Math.max(0, v) / tot : 0);
const CTS_EXCL = ["Marketing", "Khấu hao", "Lãi vay", "Thuế TNDN"];

export function customerProfit(C: Ctx, ky: string, B?: AP): Profitability {
  return memo(C, "CP|" + ky, () => {
    const D = C.D, P = periodOf(C, ky);
    const cm = Array.from(custMonth(C, ky).values()).filter((x) => x.gmv !== 0);
    const pos = (f: (x: CustMonth) => number, rows = cm) => sum(rows, (x) => Math.max(0, f(x)));

    // --- PM: chỉ phần thực trả (nhóm không có PM phụ trách thì thuộc công ty)
    const paidG: Record<string, number> = {};
    GROUPS.forEach((g) => { paidG[g] = D.alloc.some((a) => a.nhom === g && a.so_khach > 0) ? P.groupPart[g] || 0 : 0; });
    const byG: Record<string, CustMonth[]> = {};
    cm.forEach((x) => { const g = grpOf(C, x.ma_kh); (byG[g] = byG[g] || []).push(x); });
    const mgG: Record<string, number> = {};
    Object.entries(byG).forEach(([g, rs]) => { mgG[g] = pos((x) => x.mgNet, rs); });

    // --- Sales pool GMV: tách phần đến từ quỹ Travel và quỹ Mobility
    const salesGmv = sum(P.sales, (s) => s.gmv);
    const wT = P.pT.v * num(D, "sales_ty_le_travel"), wM = P.pM.v * num(D, "sales_ty_le_mobility");
    const sT = wT + wM > 0 ? (salesGmv * wT) / (wT + wM) : 0, sM = salesGmv - sT;
    const saasPaid = sum(P.sales, (s) => s.hdSaas);
    const partT = sum(P.partners, (p) => p.travel), partM = sum(P.partners, (p) => p.mobility);
    const totT = pos((x) => x.mgT), totM = pos((x) => x.mgM), totS = pos((x) => x.mgS);

    // --- Thưởng hợp đồng trả trong kỳ (phần thực chia cho Sales)
    const fHd = sum(D.staff.filter((s) => s.team === "Sales"), (s) => s.tl_pool_hd || 0);
    const hdBy = new Map<string, number>();
    P.contracts.filter((c) => c.payKy === ky).forEach((c) => hdBy.set(c.ma_kh, (hdBy.get(c.ma_kh) || 0) + c.payout * fHd));

    // --- Chi phí phục vụ
    const opex = D.opex.filter((o) => o.ky === ky);
    const marketing = sum(opex.filter((o) => o.khoan_muc === "Marketing"), (o) => o.so_tien);
    const ctsPool = sum(opex.filter((o) => !CTS_EXCL.includes(o.khoan_muc)), (o) => o.so_tien);
    const ctsMode = (D.params.cts_phan_bo || "gmv").trim().toLowerCase();
    const totGmv = pos((x) => x.gmv), nAct = cm.filter((x) => x.gmv > 0).length || 1;
    const ctsW = (x: CustMonth) => {
      const a = share(x.gmv, totGmv), b = x.gmv > 0 ? 1 / nAct : 0;
      return ctsMode === "gmv" ? a : ctsMode === "khach" ? b : 0.5 * a + 0.5 * b;
    };

    // --- Chi phí vốn: số ngày công ty tự ứng tiền = (ngày thu − ngày hóa đơn) − DPO
    const rate = num(D, "lai_suat_von_nam");
    const dpo = ok(B?.wDpo) ? (B?.wDpo as number) : 0;
    const arBy = new Map<string, typeof D.ar>();
    D.ar.filter((r) => r.ky === ky).forEach((r) => { const a = arBy.get(r.ma_kh) || []; a.push(r); arBy.set(r.ma_kh, a); });
    const lag = num(D, "ngay_tre_gui_bk");

    const rows: CustProfit[] = cm.map((x) => {
      const c = C.cust.get(x.ma_kh), g = grpOf(C, x.ma_kh);
      const pmC = paidG[g] ? paidG[g] * share(x.mgNet, mgG[g]) : 0;
      const salesC = sT * share(x.mgT, totT) + sM * share(x.mgM, totM);
      const saasC = saasPaid * share(x.mgS, totS);
      const partC = partT * share(x.mgT, totT) + partM * share(x.mgM, totM);
      const cts = ctsPool * ctsW(x);
      let capital = 0, capDays: number | null = null;
      const ars = arBy.get(x.ma_kh) || [];
      if (ars.length) {
        let w = 0, dsum = 0;
        ars.forEach((r) => {
          const start = r.ngay_hd || addDays(kyEnd(r.ky), lag);
          const end = r.ngay_thu_du || C.asOf;
          const d = Math.max(0, days(end, start) - dpo);
          capital += (r.so_tien * d * rate) / 365; w += r.so_tien; dsum += r.so_tien * d;
        });
        capDays = w > 0 ? dsum / w : null;
      } else if (x.gmv > 0) {
        const d = Math.max(0, (c?.credit_term ?? num(D, "credit_term_chuan")) + lag - dpo);
        capital = (x.gmv * d * rate) / 365; capDays = d;
      }
      const net = x.mgNet - pmC - salesC - saasC - partC - cts - capital;
      return {
        ma_kh: x.ma_kh, ten: tenOf(C, x.ma_kh), nhom: g, pm: c?.pm || "—", sales: c?.sales || "—", term: c?.credit_term ?? null,
        gmv: x.gmv, mgNet: x.mgNet, pmC, salesC, saasC, partC, hd: hdBy.get(x.ma_kh) || 0, cts, capital, capDays,
        net, netPct: x.gmv ? net / x.gmv : null,
      };
    }).sort((a, b) => b.net - a.net);
    const S = (f: (r: CustProfit) => number) => sum(rows, f);
    const tot = { gmv: S((r) => r.gmv), mgNet: S((r) => r.mgNet), pmC: S((r) => r.pmC), salesC: S((r) => r.salesC), saasC: S((r) => r.saasC), partC: S((r) => r.partC), hd: S((r) => r.hd), cts: S((r) => r.cts), capital: S((r) => r.capital), net: S((r) => r.net) };
    return { ky, rows, tot, rate, dpo, ctsMode, ctsPool, marketing, unalloc: P.comm - tot.pmC - tot.salesC - tot.saasC - tot.partC - tot.hd };
  });
}

/* ==========================================================================
   3. LTV / CAC
   CAC   = (Marketing + Lương & nhân sự × tỷ lệ Sales + thưởng HĐ mới) ÷ số khách mới
   LTV   = đóng góp bình quân một khách / tháng × vòng đời (tháng)
           đóng góp = margin net − hoa hồng − chi phí vốn (chi phí biến đổi theo khách;
           chi phí vận hành cố định không trừ, vì thêm một khách không làm nó tăng)
   Vòng đời = 1 ÷ tỷ lệ rời bỏ bình quân tháng, tối đa ltv_thang_toi_da
   ========================================================================== */
export interface LtvRow { g: string; nw: number; spend: number; cac: number | null; contrib: number | null; churn: number | null; life: number; ltv: number | null; ratio: number | null; payback: number | null; act: number }
export interface LtvSeries { ky: string; nw: number; spend: number; mkt: number; sal: number; hd: number; cac: number | null }
export interface LtvCac { rows: LtvRow[]; all: LtvRow; series: LtvSeries[]; window: string[]; salesShare: number; salesShareAuto: boolean; cap: number; firstData: string | null; notes: string[] }

export function ltvCac(C: Ctx, ky: string, B?: AP): LtvCac {
  const D = C.D;
  const months = actualPeriods(C).filter((p) => kyIdx(p) <= kyIdx(ky));
  const firstData = months[0] || null;
  const W = Math.max(1, Math.round(num(D, "cac_so_thang")));
  const cap = Math.max(1, num(D, "ltv_thang_toi_da"));
  const notes: string[] = [];
  const staffSales = D.staff.filter((s) => s.team === "Sales").length, staffAll = D.staff.length;
  const manualShare = num(D, "tl_luong_sales");
  const salesShare = manualShare > 0 ? manualShare : staffAll ? staffSales / staffAll : 0;
  const fHd = sum(D.staff.filter((s) => s.team === "Sales"), (s) => s.tl_pool_hd || 0);

  // tháng đầu tiên có GMV của từng khách
  const firstOf = new Map<string, string>();
  months.forEach((m) => activeSet(C, m).forEach((k) => { if (!firstOf.has(k)) firstOf.set(k, m); }));
  const newIn = (m: string) => Array.from(firstOf.entries()).filter(([, f]) => f === m && m !== firstData).map(([k]) => k);

  const series: LtvSeries[] = months.map((m) => {
    const op = D.opex.filter((o) => o.ky === m);
    const mkt = sum(op.filter((o) => o.khoan_muc === "Marketing"), (o) => o.so_tien);
    const sal = sum(op.filter((o) => o.khoan_muc === "Lương & nhân sự"), (o) => o.so_tien) * salesShare;
    const hd = sum(periodOf(C, m).contracts.filter((c) => c.payKy === m), (c) => c.payout) * fHd;
    const nw = m === firstData ? 0 : newIn(m).length;
    const spend = mkt + sal + hd;
    return { ky: m, nw, spend, mkt, sal, hd, cac: nw > 0 ? spend / nw : null };
  });
  const win = months.filter((m) => m !== firstData).slice(-W);
  if (!win.length && months.length) notes.push("Mới có một tháng dữ liệu nên chưa xác định được khách mới; CAC cần ít nhất 2 tháng.");
  const winSeries = series.filter((s) => win.includes(s.ky));
  const shared = sum(winSeries, (s) => s.mkt + s.sal);

  // lợi nhuận ròng bình quân một khách / tháng, theo nhóm
  const profitWin = (win.length ? win : months.slice(-W)).map((m) => customerProfit(C, m, B));
  const churnMonths = months.filter((m) => m !== firstData).slice(-6);

  const mkRow = (g: string | null): LtvRow => {
    const inG = (k: string) => g == null || grpOf(C, k) === g;
    const nwKeys = win.flatMap((m) => newIn(m)).filter(inG);
    const nwAll = win.flatMap((m) => newIn(m)).length;
    const hdG = sum(win, (m) => sum(periodOf(C, m).contracts.filter((c) => c.payKy === m && (g == null || c.nhom === g)), (c) => c.payout) * fHd);
    const spend = (nwAll > 0 ? (shared * nwKeys.length) / nwAll : g == null ? shared : 0) + hdG;
    const cac = nwKeys.length ? spend / nwKeys.length : null;
    // đóng góp = lợi nhuận ròng cộng lại chi phí phục vụ (chi phí cố định không đổi theo số khách)
    const contribs = profitWin.map((pf) => { const rs = pf.rows.filter((r) => inG(r.ma_kh) && r.gmv > 0); return rs.length ? sum(rs, (r) => r.net + r.cts) / rs.length : null; }).filter(ok);
    const contrib = contribs.length ? sum(contribs, (x) => x) / contribs.length : null;
    const churns = churnMonths.map((m) => {
      const prev = Array.from(activeSet(C, kyAdd(m, -1))).filter(inG), cur = activeSet(C, m);
      return prev.length ? prev.filter((k) => !cur.has(k)).length / prev.length : null;
    }).filter(ok);
    const churn = churns.length ? sum(churns, (x) => x) / churns.length : null;
    const life = churn && churn > 0 ? Math.min(cap, 1 / churn) : cap;
    const ltv = ok(contrib) ? contrib * life : null;
    const act = Array.from(activeSet(C, ky)).filter(inG).length;
    return { g: g || "Tổng", nw: nwKeys.length, spend, cac, contrib, churn, life, ltv, ratio: ok(ltv) && ok(cac) && cac > 0 ? ltv / cac : null, payback: ok(cac) && ok(contrib) && contrib > 0 ? cac / contrib : null, act };
  };
  if (!salesShare) notes.push("Chưa xác định được phần lương thuộc Sales (DM_NHAN_SU trống và chưa khai tl_luong_sales) nên CAC chỉ gồm Marketing và thưởng hợp đồng.");
  if (!sum(series, (s) => s.mkt)) notes.push("Sheet CHI_PHI chưa có khoản Marketing — CAC đang thấp hơn thực tế.");
  return { rows: GROUPS.map((g) => mkRow(g)), all: mkRow(null), series, window: win, salesShare, salesShareAuto: !(manualShare > 0), cap, firstData, notes };
}

/* ==========================================================================
   4. DỰ BÁO SỐ DƯ TIỀN THEO TUẦN — NHIỀU KỊCH BẢN THU TIỀN
   Tiền vào: công nợ phải thu còn mở (theo ngày đến hạn) + bảng kê sẽ phát hành của
             các tháng chưa có trong sổ (ước theo bình quân 3 kỳ gần nhất).
             Mỗi khoản: phần "đúng hạn" về đúng ngày đến hạn, phần còn lại về trễ
             theo số ngày trễ bình quân lịch sử × hệ số kịch bản.
   Tiền ra:  công nợ phải trả còn mở theo ngày đến hạn + hóa đơn NCC ước tính các
             tháng sau + chi phí vận hành bình quân (trừ khấu hao) + hoa hồng.
   ========================================================================== */
export interface Scenario { key: string; name: string; rate: number; delay: number; loss: number; c: string }
export interface FcWeek { i: number; from: string; to: string; inAr: number; inEst: number; outAp: number; outEst: number; outOpex: number; outComm: number; net: number; bal: number }
export interface FcResult { sc: Scenario; weeks: FcWeek[]; min: number; minWeek: number; firstNeg: number | null; end: number }
export interface Forecast {
  start: number; startNote: string; asOf: string; baseRate: number; baseDelay: number; results: FcResult[];
  assumptions: { avgBill: number; avgAp: number; opexMonth: number; commMonth: number; arOpen: number; arOverdue: number; apOpen: number; lastArKy: string | null };
}
export function scenarios(baseRate: number, custom: number | null): Scenario[] {
  // Kịch bản cảnh báo luôn xấu hơn lịch sử: 70% nếu lịch sử đang tốt hơn, nếu không thì thấp hơn lịch sử 15 điểm
  const warn = baseRate > 0.75 ? 0.7 : Math.max(0.2, baseRate - 0.15);
  const bad = Math.max(0.1, Math.min(0.5, warn - 0.2));
  const good = Math.max(Math.min(0.98, baseRate + 0.15), 0.95);
  const p = (x: number) => Math.round(x * 100) + "%";
  const s: Scenario[] = [
    { key: "tot", name: `Thuận lợi — thu đúng hạn ${p(good)}`, rate: good, delay: 0.8, loss: 0, c: "stable" },
    { key: "base", name: `Cơ sở — theo lịch sử ${p(baseRate)}`, rate: baseRate, delay: 1, loss: 0, c: "accent" },
    { key: "warn", name: `Cảnh báo cao — thu đúng hạn ${p(warn)}`, rate: warn, delay: 1.3, loss: 0, c: "high" },
    { key: "bad", name: `Xấu — thu đúng hạn ${p(bad)}, 10% nợ trễ không thu được`, rate: bad, delay: 2, loss: 0.1, c: "critical" },
  ];
  if (custom != null && isFinite(custom)) s.push({ key: "custom", name: `Tùy chọn — thu đúng hạn ${Math.round(custom * 100)}%`, rate: custom, delay: custom >= baseRate ? 1 : 1 + (baseRate - custom), loss: 0, c: "color-display-blue-default" });
  return s;
}

export function cashForecast(C: Ctx, A: AR, B: AP, CS: Cash, weeks = 12, custom: number | null = null): Forecast {
  const D = C.D, asOf = C.asOf, end = addDays(asOf, weeks * 7);
  // số dư xuất phát
  const lastAct = CS.halves.filter((h) => h.hasAct).slice(-1)[0];
  let start = 0, startNote = "";
  if (lastAct && CS.hasOpen) { start = lastAct.bal; startNote = `số dư cuối nửa tháng ${lastAct.h} (có số thực hiện)`; }
  else if (CS.hasOpen) { start = CS.open; startNote = "số dư tiền đầu kỳ khai trong THAM_SO"; }
  else startNote = "chưa có số dư tiền đầu kỳ (THAM_SO → so_du_tien_dau_ky) — đường số dư đang tính từ 0";

  // tỷ lệ thu đúng hạn lịch sử (theo giá trị) và số ngày trễ bình quân
  const judged = D.ar.filter((r) => r.so_tien > 0 && r.ngay_den_han <= asOf);
  const onT = sum(judged.filter((r) => r.ngay_thu_du && r.ngay_thu_du <= r.ngay_den_han && (r.da_thu ?? r.so_tien) >= r.so_tien - 1), (r) => r.so_tien);
  const baseRate = judged.length && sum(judged, (r) => r.so_tien) > 0 ? onT / sum(judged, (r) => r.so_tien) : num(D, "nguong_dung_han");
  const lateRows = D.ar.filter((r) => r.ngay_thu_du && r.ngay_thu_du > r.ngay_den_han);
  const lw = sum(lateRows, (r) => r.so_tien);
  const baseDelay = lw > 0 ? Math.max(5, sum(lateRows, (r) => days(r.ngay_thu_du as string, r.ngay_den_han) * r.so_tien) / lw) : 20;

  // GMV và giá vốn của một tháng: thực tế nếu có, không thì kế hoạch, không nữa thì bình quân 3 tháng gần nhất
  const act3 = actualPeriods(C).slice(-3);
  const avgG = act3.length ? sum(act3, (k) => periodOf(C, k).totAct) / act3.length : 0;
  const costRatio = act3.length && avgG ? sum(act3, (k) => sum(C.gmvByKy.get(k) || [], (r) => r.gia_von)) / (avgG * act3.length) : 0.9;
  const gmvOf = (k: string) => (hasActual(C, k) ? periodOf(C, k).totAct : periodOf(C, k).totTgt || avgG);
  const costOf = (k: string) => (hasActual(C, k) ? sum(C.gmvByKy.get(k) || [], (r) => r.gia_von) : gmvOf(k) * costRatio);

  // bảng kê sẽ phát hành cho các tháng chưa có trong sổ phải thu = GMV tháng × tỷ lệ bảng kê / GMV lịch sử
  const arKys = Array.from(new Set(D.ar.map((r) => r.ky))).filter((k) => ok(kyIdx(k))).sort((a, b) => kyIdx(a) - kyIdx(b));
  const lastArKy = arKys.slice(-1)[0] || null;
  const both = arKys.filter((k) => hasActual(C, k)).slice(-3);
  const bRaw = both.length ? sum(D.ar.filter((r) => both.includes(r.ky)), (r) => r.so_tien) / Math.max(1, sum(both, (k) => periodOf(C, k).totAct)) : 1;
  const billRatio = Math.min(1.5, Math.max(0.3, bRaw || 1));
  const withHd = D.ar.filter((r) => r.ngay_hd && both.includes(r.ky));
  const billLag = withHd.length ? sum(withHd, (r) => days(r.ngay_hd as string, kyEnd(r.ky))) / withHd.length : num(D, "ngay_tre_gui_bk");
  const termAr = withHd.length ? sum(withHd, (r) => days(r.ngay_den_han, r.ngay_hd as string)) / withHd.length : num(D, "credit_term_chuan");
  const futBills: { due: string; amt: number }[] = [];
  const startK = lastArKy ? kyAdd(lastArKy, 1) : kyAdd(kyOfDate(asOf), -1);
  for (let k = startK; kyEnd(k) <= end; k = kyAdd(k, 1)) futBills.push({ due: addDays(addDays(kyEnd(k), Math.round(billLag)), Math.round(termAr)), amt: gmvOf(k) * billRatio });
  const avgBill = futBills.length ? sum(futBills, (x) => x.amt) / futBills.length : 0;

  // hóa đơn NCC ước tính cho các tháng sau tháng cuối có trong sổ phải trả = giá vốn × tỷ lệ phải trả / giá vốn lịch sử
  const apMonth = (r: (typeof D.ap)[number]) => r.ky || kyOfDate(r.ngay_hd);
  const apKys = Array.from(new Set(D.ap.map(apMonth))).filter((k) => ok(kyIdx(k))).sort((a, b) => kyIdx(a) - kyIdx(b));
  const apBoth = apKys.filter((k) => hasActual(C, k)).slice(-3);
  const aRaw = apBoth.length ? sum(D.ap.filter((r) => apBoth.includes(apMonth(r))), (r) => r.so_tien) / Math.max(1, sum(apBoth, costOf)) : 1;
  const apRatio = Math.min(1.5, Math.max(0.1, aRaw || 1));
  const termAp = D.ap.length ? sum(D.ap, (r) => days(r.ngay_den_han, r.ngay_hd)) / D.ap.length : 30;
  const futAp: { due: string; amt: number }[] = [];
  const lastApKy = apKys.slice(-1)[0];
  const apStart = lastApKy ? kyAdd(lastApKy, 1) : kyOfDate(asOf);
  for (let k = apStart; kyEnd(k) <= addDays(end, 31); k = kyAdd(k, 1)) {
    // hóa đơn NCC phát sinh rải đều trong tháng → chia 4 lần, mỗi lần cách 7 ngày
    const amt = costOf(k) * apRatio;
    [7, 14, 21, 28].forEach((d) => futAp.push({ due: addDays(addDays(kyEnd(kyAdd(k, -1)), d), Math.round(termAp)), amt: amt / 4 }));
  }
  const avgAp = futAp.length ? (sum(futAp, (x) => x.amt) * 4) / futAp.length : 0;
  // chi phí vận hành và hoa hồng bình quân tháng
  const opKys = Array.from(new Set(D.opex.map((o) => o.ky))).filter((k) => ok(kyIdx(k))).sort((a, b) => kyIdx(a) - kyIdx(b)).slice(-3);
  const opexMonth = opKys.length ? sum(D.opex.filter((o) => opKys.includes(o.ky) && o.khoan_muc !== "Khấu hao"), (o) => o.so_tien) / opKys.length : 0;
  const cKys = actualPeriods(C).slice(-3);
  const commMonth = cKys.length ? sum(cKys, (k) => periodOf(C, k).comm) / cKys.length : 0;

  const arOpen = D.ar.map((r) => ({ due: r.ngay_den_han, amt: r.so_tien - (r.da_thu || 0) })).filter((x) => x.amt > 0);
  const apOpen = D.ap.map((r) => ({ due: r.ngay_den_han, amt: r.so_tien - (r.da_tra || 0) })).filter((x) => x.amt > 0);
  const weekOf = (d: string) => Math.floor(days(d, asOf) / 7);

  const run = (sc: Scenario): FcResult => {
    const W: FcWeek[] = Array.from({ length: weeks }, (_, i) => ({ i, from: addDays(asOf, i * 7 + 1), to: addDays(asOf, i * 7 + 7), inAr: 0, inEst: 0, outAp: 0, outEst: 0, outOpex: 0, outComm: 0, net: 0, bal: 0 }));
    const put = (d: string, amt: number, f: keyof FcWeek) => { const i = Math.max(0, weekOf(d)); if (i < weeks) (W[i][f] as number) += amt; };
    const delay = Math.round(baseDelay * sc.delay);
    const inflow = (due: string, amt: number, f: "inAr" | "inEst") => {
      if (due < asOf) {
        // đã quá hạn: phần "đúng hạn" coi như thu trong tuần đầu, phần còn lại sau số ngày trễ
        put(addDays(asOf, 3), amt * sc.rate, f);
        put(addDays(asOf, Math.max(7, delay - days(asOf, due))), amt * (1 - sc.rate) * (1 - sc.loss), f);
      } else {
        put(due, amt * sc.rate, f);
        put(addDays(due, delay), amt * (1 - sc.rate) * (1 - sc.loss), f);
      }
    };
    arOpen.forEach((x) => inflow(x.due, x.amt, "inAr"));
    futBills.forEach((x) => inflow(x.due, x.amt, "inEst"));
    apOpen.forEach((x) => put(x.due < asOf ? addDays(asOf, 3) : x.due, x.amt, "outAp"));
    futAp.forEach((x) => put(x.due, x.amt, "outEst"));
    W.forEach((w) => { w.outOpex = (opexMonth * 7) / 30.4; });
    // hoa hồng chi vào ngày 10 tháng sau kỳ phát sinh
    for (let k = kyOfDate(asOf); kyEnd(k) <= end; k = kyAdd(k, 1)) put(addDays(kyEnd(k), 10), commMonth, "outComm");
    let bal = start, min = start, minWeek = -1, firstNeg: number | null = null;
    W.forEach((w) => {
      w.net = w.inAr + w.inEst - w.outAp - w.outEst - w.outOpex - w.outComm;
      bal += w.net; w.bal = bal;
      if (bal < min) { min = bal; minWeek = w.i; }
      if (bal < 0 && firstNeg == null) firstNeg = w.i;
    });
    return { sc, weeks: W, min, minWeek, firstNeg, end: bal };
  };
  return {
    start, startNote, asOf, baseRate, baseDelay, results: scenarios(baseRate, custom).map(run),
    assumptions: { avgBill, avgAp, opexMonth, commMonth, arOpen: sum(arOpen, (x) => x.amt), arOverdue: sum(arOpen.filter((x) => x.due < asOf), (x) => x.amt), apOpen: sum(apOpen, (x) => x.amt), lastArKy },
  };
}

/* ==========================================================================
   5. PHÂN TÍCH NGUYÊN NHÂN
   ========================================================================== */
type Fmt = { tien: (v: number) => string; pc: (v: number | null | undefined, d?: number) => string };

/** Cầu nối GMV kỳ trước → kỳ này: khách mới, khách tăng, khách giảm, khách mất */
export interface Bridge { prev: number; cur: number; nw: number; up: number; down: number; lost: number; nNew: number; nLost: number; nUp: number; nDown: number;
  byCust: { ma_kh: string; ten: string; pm: string; sales: string; nhom: string; a: number; b: number; d: number }[];
  byPm: { pm: string; a: number; b: number; d: number; n: number }[] }
export function gmvBridge(C: Ctx, ky: string, pred: (r: GmvRow, g: string) => boolean): Bridge {
  const agg = (k: string) => {
    const m = new Map<string, number>();
    (C.gmvByKy.get(k) || []).forEach((r) => { if (!laTong(r.ma_kh) && pred(r, grpOf(C, r.ma_kh))) m.set(r.ma_kh, (m.get(r.ma_kh) || 0) + r.gmv); });
    return m;
  };
  const cur = agg(ky), prv = agg(kyAdd(ky, -1));
  const ids = Array.from(new Set([...Array.from(cur.keys()), ...Array.from(prv.keys())]));
  const o: Bridge = { prev: 0, cur: 0, nw: 0, up: 0, down: 0, lost: 0, nNew: 0, nLost: 0, nUp: 0, nDown: 0, byCust: [], byPm: [] };
  const pm = new Map<string, { pm: string; a: number; b: number; d: number; n: number }>();
  ids.forEach((k) => {
    const a = prv.get(k) || 0, b = cur.get(k) || 0, d = b - a, c = C.cust.get(k);
    o.prev += a; o.cur += b;
    if (a <= 0 && b > 0) { o.nw += b; o.nNew++; }
    else if (a > 0 && b <= 0) { o.lost += d; o.nLost++; }
    else if (d > 0) { o.up += d; o.nUp++; }
    else if (d < 0) { o.down += d; o.nDown++; }
    o.byCust.push({ ma_kh: k, ten: tenOf(C, k), pm: c?.pm || "—", sales: c?.sales || "—", nhom: grpOf(C, k), a, b, d });
    const p = pm.get(c?.pm || "—") || { pm: c?.pm || "—", a: 0, b: 0, d: 0, n: 0 };
    p.a += a; p.b += b; p.d += d; p.n += b > 0 ? 1 : 0; pm.set(p.pm, p);
  });
  o.byCust.sort((x, y) => x.d - y.d);
  o.byPm = Array.from(pm.values()).sort((x, y) => x.d - y.d);
  return o;
}

function bridgeWhy(C: Ctx, ky: string, title: string, b: Bridge, tgt: number, F: Fmt): WhyBlock {
  const items: WhyItem[] = [];
  const sg = (v: number) => (Math.abs(v) < 0.5 ? "0" : (v > 0 ? "+" : "−") + F.tien(Math.abs(v)));
  const hasPrev = hasActual(C, kyAdd(ky, -1));
  const gap = tgt - b.cur;
  let lead = `${title}: thực tế ${F.tien(b.cur)}` + (tgt ? `, kế hoạch ${F.tien(tgt)} — hụt ${F.tien(gap)}.` : ".");
  if (hasPrev) {
    lead += ` So với kỳ trước ${b.cur >= b.prev ? "tăng" : "giảm"} ${F.tien(Math.abs(b.cur - b.prev))}.`;
    items.push({
      t: `Cầu nối GMV kỳ trước → kỳ này: ${b.nNew} khách mới ${sg(b.nw)}, ${b.nUp} khách tăng ${sg(b.up)}, ${b.nDown} khách giảm ${sg(b.down)}, ${b.nLost} khách ngừng phát sinh ${sg(b.lost)}.`,
      sev: -(b.down + b.lost) > b.nw + b.up ? "high" : "neutral",
      bars: [
        { l: "Khách mới", v: b.nw, txt: sg(b.nw), c: "stable" },
        { l: "Khách tăng", v: b.up, txt: sg(b.up), c: "stable" },
        { l: "Khách giảm", v: b.down, txt: sg(b.down), c: "high" },
        { l: "Khách ngừng phát sinh", v: b.lost, txt: sg(b.lost), c: "critical" },
      ],
    });
    const drop = b.byCust.filter((x) => x.d < 0).slice(0, 6);
    const totDrop = -(b.down + b.lost);
    if (drop.length) {
      const top3 = -sum(drop.slice(0, 3), (x) => x.d);
      items.push({
        t: `${drop.length >= 3 ? "3 khách giảm nhiều nhất" : "Khách giảm"} chiếm ${F.pc(totDrop ? top3 / totDrop : null, 0)} tổng mức giảm` + (totDrop && top3 / totDrop > 0.5 ? " — vấn đề tập trung ở vài khách, xử lý từng khách là đủ." : " — giảm dàn trải, cần nhìn lại cả nhóm."),
        sev: "high",
        bars: drop.map((x) => ({ l: x.ten, sub: `${x.nhom} · PM ${x.pm} · ${F.tien(x.a)} → ${F.tien(x.b)}`, v: x.d, txt: "−" + F.tien(-x.d), c: x.b <= 0 ? "critical" : "high" })),
      });
    }
    const pms = b.byPm.filter((p) => p.d < 0);
    if (pms.length) {
      const worst = pms[0];
      items.push({
        t: `Theo PM: ${worst.pm} có mức giảm lớn nhất ${F.tien(-worst.d)} (${F.pc(totDrop ? -worst.d / totDrop : null, 0)} tổng mức giảm)` + (pms.length > 1 ? `, tiếp theo ${pms[1].pm} ${F.tien(-pms[1].d)}.` : "."),
        sev: totDrop && -worst.d / totDrop > 0.5 ? "high" : "watch",
        bars: b.byPm.slice(0, 6).map((p) => ({ l: "PM " + p.pm, sub: `${p.n} khách phát sinh · ${F.tien(p.a)} → ${F.tien(p.b)}`, v: p.d, txt: (p.d >= 0 ? "+" : "−") + F.tien(Math.abs(p.d)), c: p.d < 0 ? "high" : "stable" })),
      });
    }
  } else {
    lead += " Chưa có số liệu kỳ trước để so sánh, phần dưới xếp theo đóng góp hiện tại.";
    const top = b.byCust.slice().sort((x, y) => y.b - x.b).slice(0, 6);
    if (top.length) items.push({ t: `${b.byCust.filter((x) => x.b > 0).length} khách phát sinh GMV, 6 khách lớn nhất chiếm ${F.pc(b.cur ? sum(top, (x) => x.b) / b.cur : null, 0)}.`, bars: top.map((x) => ({ l: x.ten, sub: `${x.nhom} · PM ${x.pm}`, v: x.b, txt: F.tien(x.b) })) });
  }
  return { lead, items };
}

/** Vì sao một nhóm thu đúng hạn thấp: theo PM, theo Sales, gửi bảng kê trễ, điều khoản lỏng */
export function whyOnTime(C: Ctx, ky: string, g: string, F: Fmt): WhyBlock {
  const D = C.D, asOf = C.asOf;
  const chuan = num(D, "credit_term_chuan"), lag = num(D, "ngay_tre_gui_bk");
  const rs = D.ar.filter((r) => r.ky === ky && grpOf(C, r.ma_kh) === g && r.so_tien > 0);
  const full = (r: (typeof rs)[number]) => r.ngay_thu_du != null && (r.da_thu == null || r.da_thu >= r.so_tien);
  const late = rs.filter((r) => !(full(r) && (r.ngay_thu_du as string) <= r.ngay_den_han) && !(!full(r) && r.ngay_den_han > asOf));
  const lateV = sum(late, (r) => r.so_tien);
  const o = onTimeByGroup(C, ky)[g];
  const lead = `Nhóm ${g} kỳ ${ky}: ${F.tien(o?.billed || 0)} bảng kê, ${F.tien(lateV)} không thu đủ đúng hạn (${late.length} khoản). Thu đúng hạn ${F.pc(o?.rate ?? null, 0)}.`;
  const items: WhyItem[] = [];
  // phân loại nguyên nhân cho từng khoản trễ
  const cause = (r: (typeof rs)[number]) => {
    const c = C.cust.get(r.ma_kh);
    const bkLate = !r.ngay_gui_bk || days(r.ngay_gui_bk, kyEnd(r.ky)) > lag;
    const loose = (c?.credit_term ?? 0) > chuan || (r.ngay_hd != null && days(r.ngay_den_han, r.ngay_hd) > chuan);
    return bkLate ? "bk" : loose ? "term" : "kh";
  };
  const cat = { bk: 0, term: 0, kh: 0 };
  late.forEach((r) => { cat[cause(r) as keyof typeof cat] += r.so_tien; });
  items.push({
    t: cat.bk >= cat.term && cat.bk >= cat.kh
      ? `Nguyên nhân lớn nhất là NỘI BỘ: ${F.pc(lateV ? cat.bk / lateV : null, 0)} giá trị trễ có bảng kê gửi muộn hơn ${lag} ngày sau cuối kỳ hoặc chưa ghi ngày gửi.`
      : cat.term >= cat.kh
        ? `Nguyên nhân lớn nhất là ĐIỀU KHOẢN: ${F.pc(lateV ? cat.term / lateV : null, 0)} giá trị trễ thuộc khách được cho credit term dài hơn chuẩn ${chuan} ngày.`
        : `Nguyên nhân lớn nhất là KHÁCH: ${F.pc(lateV ? cat.kh / lateV : null, 0)} giá trị trễ dù bảng kê gửi đúng hạn và điều khoản chuẩn — khách chủ động trả chậm.`,
    sev: "high",
    bars: [
      { l: "Gửi bảng kê trễ / chưa gửi", v: cat.bk, txt: F.tien(cat.bk), c: "high" },
      { l: `Credit term > ${chuan} ngày`, v: cat.term, txt: F.tien(cat.term), c: "watch" },
      { l: "Khách trả chậm", v: cat.kh, txt: F.tien(cat.kh), c: "critical" },
    ],
  });
  const agg = (key: (r: (typeof rs)[number]) => string) => {
    const m = new Map<string, { v: number; tot: number; n: number }>();
    rs.forEach((r) => { const k = key(r); const x = m.get(k) || { v: 0, tot: 0, n: 0 }; x.tot += r.so_tien; m.set(k, x); });
    late.forEach((r) => { const k = key(r); const x = m.get(k) as { v: number; tot: number; n: number }; x.v += r.so_tien; x.n++; });
    return Array.from(m.entries()).map(([k, x]) => ({ k, ...x, r: x.tot ? x.v / x.tot : 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  };
  const byPm = agg((r) => C.cust.get(r.ma_kh)?.pm || "—");
  if (byPm.length) items.push({
    t: `Theo PM: ${byPm[0].k} chiếm ${F.pc(lateV ? byPm[0].v / lateV : null, 0)} giá trị trễ, ${F.pc(byPm[0].r, 0)} danh mục của PM này không thu đúng hạn.`,
    sev: byPm[0].v / (lateV || 1) > 0.5 ? "high" : "watch",
    bars: byPm.slice(0, 6).map((x) => ({ l: "PM " + x.k, sub: `${x.n} khoản trễ · ${F.pc(x.r, 0)} danh mục`, v: x.v, txt: F.tien(x.v), c: "high" })),
  });
  const bySales = agg((r) => C.cust.get(r.ma_kh)?.sales || "—");
  const loose = rs.filter((r) => (C.cust.get(r.ma_kh)?.credit_term ?? 0) > chuan);
  if (bySales.length) items.push({
    t: `Theo Sales ký hợp đồng: ${bySales[0].k} có ${F.tien(bySales[0].v)} trễ.` + (loose.length ? ` ${new Set(loose.map((r) => r.ma_kh)).size} khách của nhóm đang được cho credit term dài hơn ${chuan} ngày.` : ""),
    sev: "watch",
    bars: bySales.slice(0, 5).map((x) => ({ l: "Sales " + x.k, sub: `${x.n} khoản trễ`, v: x.v, txt: F.tien(x.v), c: "watch" })),
  });
  const byCust = agg((r) => r.ma_kh).slice(0, 6);
  if (byCust.length) items.push({
    t: `Khách trễ lớn nhất: ${byCust.slice(0, 3).map((x) => tenOf(C, x.k)).join(", ")}.`,
    bars: byCust.map((x) => { const c = C.cust.get(x.k); return { l: tenOf(C, x.k), sub: `PM ${c?.pm || "—"} · term ${c?.credit_term ?? "—"} ngày`, v: x.v, txt: F.tien(x.v), c: "critical" }; }),
  });
  return { lead, items };
}

/** Vì sao %margin của một trục dưới target: NCC nào và khách nào kéo xuống */
export function whyMargin(C: Ctx, ky: string, ax: "T" | "M", F: Fmt): WhyBlock {
  const D = C.D, rows = (C.gmvByKy.get(ky) || []).filter((r) => axisOf(C, r) === ax);
  const ck = num(D, "chiet_khau_mobility");
  const mg = (r: GmvRow) => r.gmv - r.gia_von;
  const tgtOf = (r: GmvRow) => ax === "M" ? num(D, "target_margin_mobility") : r.dich_vu === "Flight" ? num(D, "target_margin_flight") : num(D, "target_margin_hotel");
  const gmv = sum(rows, (r) => r.gmv), act = sum(rows, mg);
  const lead = `Margin gross ${AXIS_NAME[ax]} ${F.pc(gmv ? act / gmv : null, 2)} trên ${F.tien(gmv)} GMV. Mức hụt so với target = Σ GMV × (target − %margin thực tế) của từng nguồn.`;
  const by = (key: (r: GmvRow) => string, lab: (k: string) => string) => {
    const m = new Map<string, { g: number; m: number; gap: number }>();
    rows.forEach((r) => { const k = key(r); const x = m.get(k) || { g: 0, m: 0, gap: 0 }; x.g += r.gmv; x.m += mg(r); x.gap += r.gmv * tgtOf(r) - mg(r); m.set(k, x); });
    return Array.from(m.entries()).map(([k, x]) => ({ k, l: lab(k), ...x })).filter((x) => x.gap > 0).sort((a, b) => b.gap - a.gap);
  };
  const sup = new Map(D.suppliers.map((s) => [s.ma_ncc, s.ten_ncc]));
  const bySup = by((r) => r.ma_ncc || "—", (k) => (k === "—" ? "Chưa ghi NCC" : sup.get(k) || k));
  const byCust = by((r) => r.ma_kh, (k) => tenOf(C, k));
  const totGap = sum(bySup, (x) => x.gap);
  const items: WhyItem[] = [];
  if (bySup.length) items.push({
    t: `Theo nhà cung cấp: ${bySup[0].l} đóng góp ${F.pc(totGap ? bySup[0].gap / totGap : null, 0)} phần hụt margin (margin ${F.pc(bySup[0].g ? bySup[0].m / bySup[0].g : null, 2)} trên ${F.tien(bySup[0].g)}). Điều hướng GMV khỏi các NCC này hoặc đàm phán lại giá.`,
    sev: "high",
    bars: bySup.slice(0, 6).map((x) => ({ l: x.l, sub: `GMV ${F.tien(x.g)} · margin ${F.pc(x.g ? x.m / x.g : null, 2)}`, v: x.gap, txt: F.tien(x.gap), c: "high" })),
  });
  if (byCust.length) items.push({
    t: `Theo khách: ${byCust.slice(0, 3).map((x) => x.l).join(", ")} có margin thấp nhất so với target — cân nhắc lại giá bán hoặc cơ cấu dịch vụ.`,
    sev: "watch",
    bars: byCust.slice(0, 6).map((x) => ({ l: x.l, sub: `GMV ${F.tien(x.g)} · margin ${F.pc(x.g ? x.m / x.g : null, 2)}`, v: x.gap, txt: F.tien(x.gap), c: "watch" })),
  });
  if (ax === "M") {
    const dRows = rows.filter((r) => r.chiet_khau != null && r.gmv > 0 && r.chiet_khau / r.gmv > ck * 1.2);
    if (dRows.length) items.push({ t: `${new Set(dRows.map((r) => r.ma_kh)).size} khách đang được chiết khấu cao hơn mức chuẩn ${F.pc(ck, 0)} hơn 20% — làm margin net thấp thêm ${F.tien(sum(dRows, (r) => (r.chiet_khau as number) - r.gmv * ck))}.`, sev: "watch" });
  }
  return { lead, items };
}

/** Gắn phần "Vì sao?" cho các cảnh báo có tham chiếu */
export function explain(C: Ctx, P: Period, AL: Alert[], F: Fmt): Alert[] {
  const why = (ref: AlertRef): WhyBlock | undefined => {
    if (ref.k === "gmvtot") {
      const b = gmvBridge(C, P.ky, () => true);
      const w = bridgeWhy(C, P.ky, "GMV tổng công ty", b, P.totTgt, F);
      const gaps = P.lines.filter((l) => l.tgt > 0).map((l) => ({ l, g: l.tgt - l.act })).filter((x) => x.g > 0).sort((a, b) => b.g - a.g);
      const totGap = sum(gaps, (x) => x.g);
      if (gaps.length) w.items.unshift({
        t: `Theo mảng: ${gaps[0].l.name} hụt nhiều nhất ${F.tien(gaps[0].g)} (${F.pc(totGap ? gaps[0].g / totGap : null, 0)} tổng phần hụt).`,
        sev: "high",
        bars: gaps.slice(0, 6).map((x) => ({ l: x.l.name, sub: `đạt ${F.pc(x.l.act / x.l.tgt, 0)}`, v: x.g, txt: F.tien(x.g), c: x.l.act / x.l.tgt < 0.7 ? "critical" : "high" })),
      });
      return w;
    }
    if (ref.k === "line") {
      const L = LINE_DEFS.find((l) => l.k === ref.id), ln = P.lines.find((l) => l.k === ref.id);
      if (!L || !ln) return undefined;
      return bridgeWhy(C, P.ky, ln.name, gmvBridge(C, P.ky, (r, g) => L.match(r, g)), ln.tgt, F);
    }
    if (ref.k === "ontime") return whyOnTime(C, P.ky, ref.g, F);
    if (ref.k === "margin") return whyMargin(C, P.ky, ref.ax, F);
    return undefined;
  };
  return AL.map((a) => (a.ref ? { ...a, why: why(a.ref) } : a));
}
