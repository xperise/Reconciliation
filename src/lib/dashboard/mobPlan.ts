// @ts-nocheck — đoạn RM chép nguyên văn JavaScript từ mobility.html, giữ y hệt để số khớp với tab Mobility
// Kế hoạch Mobility đúng như tab Mobility (public/dashboard/mobility.html):
// kế hoạch theo ngày lưu trong mob_state.data.plan, rồi GMV / DN active được thay bằng
// "Lộ trình KPI 26/10 → 31/12" tính ngay trong mobility.html. Đoạn RM dưới đây chép nguyên từ file đó —
// sửa lộ trình bên mobility.html thì sửa cả ở đây.
/* eslint-disable */
const addD = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const RM = (() => {
  const ACT0 = [["2026-10-01",9469000.0,8.0,503.0,10.0,19.0,28706000.0],["2026-10-02",4274000.0,6.0,503.0,11.0,20.0,32980000.0],["2026-10-03",1100000.0,4.0,503.0,12.0,21.0,34080000.0],["2026-10-04",2200000.0,2.0,503.0,13.0,23.0,36280000.0],["2026-10-05",1988000.0,5.0,503.0,13.0,23.0,38268000.0],["2026-10-06",15768000.0,16.0,503.0,18.0,30.0,54036000.0],["2026-10-07",3149000.0,4.0,503.0,18.0,31.0,57185000.0],["2026-10-08",14612000.0,16.0,503.0,19.0,34.0,71797000.0],["2026-10-09",14771000.0,17.0,503.0,23.0,40.0,86568000.0],["2026-10-10",5770000.0,11.0,503.0,25.0,42.0,92338000.0],["2026-10-11",4274000.0,8.0,503.0,26.0,44.0,96612000.0],["2026-10-12",11499000.0,17.0,503.0,30.0,48.0,108111000.0],["2026-10-13",13085700.0,19.0,503.0,32.0,52.0,121196700.0],["2026-10-14",22064000.0,20.0,534.0,35.0,59.0,143260700.0],["2026-10-15",19141000.0,24.0,534.0,37.0,62.0,162401700.0],["2026-10-16",14872000.0,28.0,534.0,42.0,69.0,176039700.0],["2026-10-17",8933000.0,20.0,534.0,45.0,74.0,184972700.0],["2026-10-18",2904000.0,8.0,558.0,45.0,75.0,187326700.0],["2026-10-19",19762000.0,39.0,559.0,49.0,79.0,205888700.0],["2026-10-20",21106000.0,34.0,564.0,54.0,88.0,226994700.0],["2026-10-21",25330000.0,53.0,564.0,61.0,100.0,251844700.0],["2026-10-22",34342000.0,59.0,564.0,66.0,110.0,286028700.0],["2026-10-23",24670000.0,55.0,564.0,75.0,123.0,310612700.0],["2026-10-24",7164000.0,27.0,564.0,75.0,126.0,315542700.0],["2026-10-25",851000.0,4.0,564.0,75.0,126.0,315045700.0]]; // [ngày, GMV, chuyến, DN có thẻ, DN active, thẻ active 30N, GMV 30N] 1–25/10
  const D0 = '2026-10-25', END = '2026-12-31', N = 67, B0 = 25042000, PT0 = 598946, CARD0 = 564, AC0 = 75, CPD0 = 126 / 75;
  const T = {card: 3000, act: 3000, cpd: 3, pt: 797680, gmv: 60e9}, fS = .25, fU = .10;
  const dAt = n => addD(D0, n), dow = d => new Date(d + 'T00:00:00Z').getUTCDay(), isWd = d => { const w = dow(d); return w !== 0 && w !== 6; };
  const fac = d => { const w = dow(d); return w === 6 ? fS : w === 0 ? fU : 1; };
  const WD = [0]; for (let n = 1; n <= N; n++) WD.push(WD[n - 1] + (isWd(dAt(n)) ? 1 : 0)); const WT = WD[N];
  const solveG = (b, t, n) => Math.pow(t / b, 1 / n) - 1;
  const decTotal = g => { let s = 0; for (let n = 37; n <= 67; n++) s += B0 * Math.pow(1 + g, n) * fac(dAt(n)); return s; };
  let lo = 0, hi = .5; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; decTotal(m) < T.gmv ? lo = m : hi = m; }
  const R = {gg: (lo + hi) / 2, gc: solveG(CARD0, T.card, WT), ga: solveG(AC0, T.act, WT), gp: solveG(CPD0, T.cpd, WT), gt: solveG(PT0, T.pt, N), fS, fU, WT};
  const rows: Record<string, any> = {}, gm: number[] = [], tr: number[] = [];
  const hg = (315045700 - 303098700) / 5; for (let k = 0; k < 5; k++) { gm.push(hg); tr.push(hg / PT0); }
  let prevCard: number | null = null;
  for (const [d, gmv, trips, card, act, c30, g30] of ACT0) { gm.push(gmv); tr.push(trips);
    rows[d] = {gmv, trips, onboard: card, newco: prevCard == null ? 0 : (card as number) - prevCard, cos30: act, cards30: c30, gmv30: g30, gpc30: g30 / act, cpd: c30 / act, pt: PT0, t30: g30 / PT0, act: 1}; prevCard = card; }
  for (let n = 1; n <= N; n++) { const d = dAt(n), wd = WD[n];
    const card = CARD0 * Math.pow(1 + R.gc, wd), act = Math.min(AC0 * Math.pow(1 + R.ga, wd), card), cpd = CPD0 * Math.pow(1 + R.gp, wd), pt = PT0 * Math.pow(1 + R.gt, n);
    const gmv = B0 * Math.pow(1 + R.gg, n) * fac(d), trips = gmv / pt; gm.push(gmv); tr.push(trips);
    let g30 = 0, t30 = 0; for (let k = gm.length - 30; k < gm.length; k++) { g30 += gm[k]; t30 += tr[k]; }
    rows[d] = {gmv, trips, onboard: Math.round(card), newco: Math.round(card) - (prevCard as number), cos30: Math.round(act), cards30: Math.round(act * cpd), gmv30: g30, gpc30: g30 / act, cpd, pt, t30}; prevCard = Math.round(card); }
  return {rows, R, T, D0, END, fac, isWd};
})();

/** [ngày, GMV kế hoạch, DN active 30 ngày kế hoạch] — kế hoạch đã lưu, thay bằng lộ trình cho các ngày lộ trình có */
export type MobPlanDay = [string, number, number];
export function mobEffectivePlan(raw: unknown): MobPlanDay[] {
  const by = new Map<string, { gmv: number; cos30: number }>();
  if (Array.isArray(raw)) for (const p of raw as Record<string, unknown>[]) {
    const d = String(p?.d || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) by.set(d, { gmv: Number(p.gmv) || 0, cos30: Number(p.cos30) || 0 });
  }
  for (const [d, r] of Object.entries(RM.rows)) by.set(d, { gmv: Number(r.gmv) || 0, cos30: Number(r.cos30) || 0 });
  return Array.from(by.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, r]) => [d, r.gmv, r.cos30]);
}
