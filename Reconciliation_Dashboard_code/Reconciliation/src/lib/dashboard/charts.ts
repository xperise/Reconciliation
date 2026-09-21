// Biểu đồ SVG/HTML dựng dạng chuỗi (không cần thư viện). Màu lấy từ biến CSS trong dashboard.css.
import { esc, n0, pc, sum } from "./util";

const col = (c: string) => `var(--${c})`;
type Fmt = (v: number) => string;
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
export type LegendItem = [string, string, number?, boolean?, boolean?];
export function legend(items: LegendItem[]): string {
  return `<div class="legend">${items.map(([n, c, op, ln, dash]) => `<span><i class="${ln ? "ln" : ""}" style="background:${dash ? `repeating-linear-gradient(90deg,${col(c)} 0 4px,transparent 4px 7px)` : col(c)};opacity:${op ?? 1}"></i>${esc(n)}</span>`).join("")}</div>`;
}

export interface BarSeries { name: string; c: string; vals: (number | null)[]; op?: number; cf?: (v: number, j: number) => string }
export interface BarOpts { labels: string[]; series: BarSeries[]; targets?: (number | null)[]; tName?: string; h?: number; W?: number; bw?: number; stack?: boolean; showTot?: boolean; showVal?: boolean; fv?: Fmt; ft?: Fmt; fy?: Fmt; noLegend?: boolean; max?: number }
export function barChart(o: BarOpts): string {
  const W = o.W || 640, H = o.h || 230, pl = 48, pr = 8, pt = 14, pb = 30, n = o.labels.length, k = o.stack ? 1 : o.series.length;
  const tots = o.stack ? o.labels.map((_, j) => sum(o.series, (s) => s.vals[j] || 0)) : [];
  const all = (o.stack ? tots : o.series.flatMap((s) => s.vals)).concat(o.targets || []).filter((v): v is number => v != null && isFinite(v));
  const max = o.max || niceMax(Math.max(...all, 0) * 1.05 || 1), lo = Math.min(0, ...all), mn = lo < 0 ? -niceMax(-lo * 1.1) : 0;
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - mn) / (max - mn)), gw = (W - pl - pr) / Math.max(1, n), bw = Math.min(o.bw || 30, (gw * 0.72) / k);
  const ft = o.ft || n0, fy = o.fy || n0;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">`;
  for (let t = 0; t <= 4; t++) { const v = mn + ((max - mn) * t) / 4; s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 3}" text-anchor="end">${fy(v)}</text>`; }
  if (mn < 0) s += `<line x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}" style="stroke:var(--ink-3)"/>`;
  o.labels.forEach((lb, j) => {
    const cx = pl + gw * j + gw / 2, x0 = cx - (bw * k) / 2;
    if (o.stack) {
      let acc = 0;
      o.series.forEach((se) => { const v = se.vals[j] || 0; if (!v) return; s += `<rect x="${x0 + 1}" y="${y(acc + v)}" width="${bw - 2}" height="${Math.max(0, y(acc) - y(acc + v))}" style="fill:${col(se.c)};opacity:${se.op ?? 1}"><title>${esc(lb)} · ${esc(se.name)}: ${ft(v)}</title></rect>`; acc += v; });
      if (o.showTot && acc) s += `<text x="${cx}" y="${y(acc) - 4}" text-anchor="middle" style="fill:var(--ink)">${ft(acc)}</text>`;
    } else o.series.forEach((se, q) => {
      const v = se.vals[j]; if (v == null || !isFinite(v)) return;
      const x = x0 + q * bw, c = se.cf ? se.cf(v, j) : se.c, top = Math.min(y(v), y(0));
      s += `<rect x="${x + 1}" y="${top}" width="${bw - 2}" height="${Math.max(1, Math.abs(y(0) - y(v)))}" rx="3" style="fill:${col(c)};opacity:${se.op ?? 1}"><title>${esc(lb)} · ${esc(se.name)}: ${ft(v)}</title></rect>`;
      if (o.showVal) s += `<text x="${x + bw / 2}" y="${v >= 0 ? y(v) - 4 : y(v) + 11}" text-anchor="middle" style="fill:var(--ink)">${(o.fv || ft)(v)}</text>`;
    });
    const tg = o.targets?.[j];
    if (tg != null && isFinite(tg)) s += `<line x1="${x0 - 4}" x2="${x0 + bw * k + 4}" y1="${y(tg)}" y2="${y(tg)}" style="stroke:var(--ink);stroke-width:2"><title>${esc(o.tName || "Kế hoạch")}: ${ft(tg)}</title></line>`;
    s += `<text class="lbl" x="${cx}" y="${H - 10}" text-anchor="middle">${esc(lb)}</text>`;
  });
  return s + `</svg>` + (o.noLegend ? "" : legend(o.series.map((se): LegendItem => [se.name, se.c, se.op]).concat(o.targets ? [[o.tName || "Kế hoạch", "ink", 1, true]] : [])));
}

export interface LineSeries { name: string; c: string; vals: (number | null)[]; dash?: boolean; nodot?: boolean; w?: number }
export function lineChart(o: { labels: string[]; series: LineSeries[]; h?: number; W?: number; max?: number; ft?: Fmt; fy?: Fmt; mark?: number; markLabel?: string }): string {
  const W = o.W || 640, H = o.h || 220, pl = 48, pr = 26, pt = 12, pb = 28, n = o.labels.length;
  const all = o.series.flatMap((s) => s.vals).filter((v): v is number => v != null && isFinite(v));
  const lo = Math.min(0, ...all), min = lo < 0 ? -niceMax(-lo * 1.1) : 0;
  const max = o.max || niceMax(Math.max(...all, 1) * 1.05);
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - min) / (max - min)), x = (j: number) => pl + (W - pl - pr) * (n <= 1 ? 0.5 : j / (n - 1));
  const ft = o.ft || n0, fy = o.fy || n0;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">`;
  for (let t = 0; t <= 4; t++) { const v = min + ((max - min) * t) / 4; s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 3}" text-anchor="end">${fy(v)}</text>`; }
  if (o.mark != null && o.mark >= 0) s += `<line x1="${x(o.mark)}" x2="${x(o.mark)}" y1="${pt}" y2="${H - pb}" style="stroke:var(--ink-3);stroke-dasharray:3 3"/><text x="${x(o.mark) + 4}" y="${pt + 9}">${esc(o.markLabel || "")}</text>`;
  o.series.forEach((se) => {
    let seg: string[] = [], path = "";
    se.vals.forEach((v, j) => { if (v == null || !isFinite(v)) { if (seg.length) path += "M" + seg.join("L"); seg = []; return; } seg.push(`${x(j)},${y(v)}`); });
    if (seg.length) path += "M" + seg.join("L");
    if (path) s += `<path d="${path}" fill="none" style="stroke:${col(se.c)};stroke-width:${se.w || 2}" ${se.dash ? 'stroke-dasharray="5 4"' : ""}/>`;
    se.vals.forEach((v, j) => { if (v != null && isFinite(v) && !se.nodot) s += `<circle cx="${x(j)}" cy="${y(v)}" r="3" style="fill:var(--surface);stroke:${col(se.c)};stroke-width:2"><title>${esc(o.labels[j])} · ${esc(se.name)}: ${ft(v)}</title></circle>`; });
  });
  o.labels.forEach((lb, j) => { s += `<text class="lbl" x="${x(j)}" y="${H - 9}" text-anchor="middle">${esc(lb)}</text>`; });
  return s + `</svg>` + legend(o.series.map((se): LegendItem => [se.name, se.c, 1, true, se.dash]));
}

export function waterfall(items: { l: string; v: number; kind?: "total" }[]): string {
  const W = 640, H = 250, pl = 50, pr = 8, pt = 14, pb = 44, n = items.length;
  let run = 0;
  const bars = items.map((it) => { if (it.kind === "total") { run = it.v; return { ...it, a: 0, b: it.v }; } const a = run; run += it.v; return { ...it, a, b: run }; });
  const max = niceMax(Math.max(...bars.map((b) => Math.max(b.a, b.b)), 1) * 1.05), lo = Math.min(0, ...bars.map((b) => Math.min(b.a, b.b))), mn = lo < 0 ? -niceMax(-lo * 1.05) : 0;
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - mn) / (max - mn)), gw = (W - pl - pr) / n, bw = gw * 0.62;
  const tm = (v: number) => n0(v / 1e6);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">`;
  for (let t = 0; t <= 4; t++) { const v = mn + ((max - mn) * t) / 4; s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 3}" text-anchor="end">${tm(v)}</text>`; }
  bars.forEach((b, j) => {
    const x = pl + gw * j + (gw - bw) / 2, top = y(Math.max(b.a, b.b)), h = Math.abs(y(b.a) - y(b.b));
    const c = b.kind === "total" ? (b.b < 0 ? "critical" : "accent") : b.v < 0 ? "critical" : "stable";
    s += `<rect x="${x}" y="${top}" width="${bw}" height="${Math.max(1, h)}" rx="3" style="fill:${col(c)};opacity:${b.kind === "total" ? 1 : 0.75}"><title>${esc(b.l)}: ${tm(b.v)} tr</title></rect>`;
    s += `<text x="${x + bw / 2}" y="${top - 4}" text-anchor="middle" style="fill:var(--ink)">${b.kind === "total" ? tm(b.v) : (b.v < 0 ? "−" : "+") + tm(Math.abs(b.v))}</text>`;
    const words = b.l.split(" "), mid = Math.ceil(words.length / 2);
    s += `<text class="lbl" x="${x + bw / 2}" y="${H - 26}" text-anchor="middle">${esc(words.slice(0, mid).join(" "))}</text><text class="lbl" x="${x + bw / 2}" y="${H - 13}" text-anchor="middle">${esc(words.slice(mid).join(" "))}</text>`;
  });
  return s + `</svg>`;
}

const pw = (v: number | null | undefined, m: number) => Math.min(100, Math.max(0, ((v || 0) / m) * 100)) + "%";
export interface BulletItem { l: string; sub?: string; v: number | null; t?: number | null; c?: string; txt: string; txt2?: string; vc?: string; bold?: boolean }
export function hBullet(items: BulletItem[], o: { max?: number; legend?: string } = {}): string {
  if (!items.length) return empty("Chưa có dữ liệu");
  const max = o.max || Math.max(...items.map((i) => Math.max(i.v || 0, i.t || 0))) * 1.05 || 1;
  return `<div class="hb">${items.map((i) => `<div class="hb-row ${i.bold ? "bold" : ""}"><div class="hb-lab" title="${esc(i.l)}">${esc(i.l)}${i.sub ? `<small>${esc(i.sub)}</small>` : ""}</div><div class="hb-track"><span class="fill" style="width:${pw(i.v, max)};background:${col(i.c || "accent")}"></span>${i.t != null ? `<b style="left:${pw(i.t, max)}"></b>` : ""}</div><div class="hb-val num ${i.vc ? "c-" + i.vc : ""}">${i.txt}${i.txt2 ? `<small>${i.txt2}</small>` : ""}</div></div>`).join("")}</div>${o.legend || ""}`;
}
export interface StackRow { l: string; sub?: string; parts: [number, string, string, number?][]; txt: string; txt2?: string; bold?: boolean }
export function hStack(rows: StackRow[], o: { max?: number; legend?: LegendItem[]; ft?: Fmt } = {}): string {
  if (!rows.length) return empty("Chưa có dữ liệu");
  const max = o.max || Math.max(...rows.map((r) => sum(r.parts, (p) => Math.max(0, p[0])))) || 1;
  const ft = o.ft || n0;
  return `<div class="hb">${rows.map((r) => { const tot = sum(r.parts, (p) => Math.max(0, p[0])); return `<div class="hb-row ${r.bold ? "bold" : ""}"><div class="hb-lab" title="${esc(r.l)}">${esc(r.l)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</div><div class="hb-track"><div class="hbs" style="width:${pw(tot, max)}">${r.parts.filter((p) => p[0] > 0).map((p) => `<i style="flex:${p[0]};background:${col(p[1])};opacity:${p[3] ?? 1}" title="${esc(p[2])}: ${ft(p[0])}"></i>`).join("")}</div></div><div class="hb-val num">${r.txt}${r.txt2 ? `<small>${r.txt2}</small>` : ""}</div></div>`; }).join("")}</div>${o.legend ? legend(o.legend) : ""}`;
}
export function divBars(items: { l: string; sub?: string; v: number; c: string; txt: string }[], range: number): string {
  if (!items.length) return empty("Chưa đủ dữ liệu 2 tháng liên tiếp để so sánh");
  return `<div class="hb">${items.map((i) => { const w = Math.min(50, (Math.abs(i.v) / range) * 50); return `<div class="hb-row"><div class="hb-lab" title="${esc(i.l)}">${esc(i.l)}${i.sub ? `<small>${esc(i.sub)}</small>` : ""}</div><div class="hb-track div"><span class="mid"></span><span class="fill" style="left:${i.v < 0 ? 50 - w : 50}%;width:${w}%;background:${col(i.c)}"></span></div><div class="hb-val num c-${i.c}">${i.txt}</div></div>`; }).join("")}</div>`;
}
export function donut(parts: [number, string, string][], center: string, sub: string, o: { size?: number; ft?: Fmt } = {}): string {
  const R = 58, C = 2 * Math.PI * R, tot = sum(parts, (p) => Math.max(0, p[0]));
  if (!tot) return empty("Chưa có dữ liệu");
  const ft = o.ft || n0;
  let off = 0;
  let s = `<svg viewBox="0 0 160 160" width="${o.size || 150}" height="${o.size || 150}" role="img"><circle cx="80" cy="80" r="${R}" fill="none" style="stroke:var(--line-soft);stroke-width:22"/>`;
  parts.forEach((p) => { const len = (Math.max(0, p[0]) / tot) * C; if (len <= 0) return; s += `<circle cx="80" cy="80" r="${R}" fill="none" style="stroke:${col(p[1])};stroke-width:22" stroke-dasharray="${Math.max(0, len - 1.5)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"><title>${esc(p[2])}: ${ft(p[0])}</title></circle>`; off += len; });
  s += `<text x="80" y="80" text-anchor="middle" class="dn-c">${esc(center)}</text><text x="80" y="97" text-anchor="middle">${esc(sub)}</text></svg>`;
  return `<div class="donut">${s}<div class="dn-leg">${parts.map((p) => `<div><i style="background:${col(p[1])}"></i><span>${esc(p[2])}</span><b class="num">${ft(p[0])}</b><em class="num">${pc(Math.max(0, p[0]) / tot, 0)}</em></div>`).join("")}</div></div>`;
}
export function tierChart(x: number | null, H: number, tiers: [number, number | null, string][], tierFn: (v: number) => number): string {
  const W = 640, Hh = 240, pl = 44, pr = 16, pt = 22, pb = 30, X = (v: number) => pl + ((W - pl - pr) * v) / 1.5, Y = (v: number) => pt + (Hh - pt - pb) * (1 - v / 1.7);
  let s = `<svg viewBox="0 0 ${W} ${Hh}" width="100%" role="img">`;
  tiers.forEach(([a, b], q) => { const bb = b == null ? 1.5 : b; s += `<rect x="${X(a)}" y="${pt}" width="${X(bb) - X(a)}" height="${Y(0) - pt}" style="fill:${q % 2 ? "var(--surface-2)" : "transparent"}"/><text x="${(X(a) + X(bb)) / 2}" y="${pt - 8}" text-anchor="middle">N${q + 1}</text>`; });
  [0, 0.5, 1, 1.5].forEach((v) => { s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${pl - 6}" y="${Y(v) + 3}" text-anchor="end">${v * 100}%</text>`; });
  [0, 0.3, 0.5, 0.7, 0.9, 1, 1.1, 1.3, 1.5].forEach((v) => { s += `<text x="${X(v)}" y="${Hh - 10}" text-anchor="middle">${Math.round(v * 100)}%</text>`; });
  s += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(1.5)}" y2="${Y(1.5)}" style="stroke:var(--ink-3);stroke-dasharray:3 4"/>`;
  let seg: string[] = [], prev: number | null = null, path = "";
  for (let v = 0; v <= 1.5001; v += 0.0025) { const h = tierFn(v); if (prev != null && Math.abs(h - prev) > 0.015) { path += "M" + seg.join("L"); seg = []; } seg.push(`${X(v).toFixed(1)},${Y(h).toFixed(1)}`); prev = h; }
  path += "M" + seg.join("L");
  s += `<path d="${path}" fill="none" style="stroke:var(--accent);stroke-width:2.5"/>`;
  if (x != null && isFinite(x)) {
    const xx = Math.min(x, 1.5), lx = X(xx) > W - 170 ? X(xx) - 10 : X(xx) + 10, anc = X(xx) > W - 170 ? "end" : "start";
    s += `<line x1="${X(xx)}" x2="${X(xx)}" y1="${Y(H)}" y2="${Y(0)}" style="stroke:var(--ink);stroke-dasharray:2 3"/><circle cx="${X(xx)}" cy="${Y(H)}" r="6" style="fill:var(--surface);stroke:var(--ink);stroke-width:2.5"/>`;
    s += `<text x="${lx}" y="${Y(H) - 10}" text-anchor="${anc}" style="fill:var(--ink);font-size:12px;font-weight:600">%đạt ${pc(x)} → hệ số ${pc(H, 0)}</text>`;
  }
  return s + `</svg>` + legend([["Hệ số bậc thưởng", "accent", 1, true], ["Đường 1:1 (hệ số = %đạt)", "ink-3", 1, true, true]]);
}
export const empty = (msg: string) => `<div class="empty">${esc(msg)}</div>`;
export const pill = (t: string, c: string, dot = true) => `<span class="pill ${dot ? "dot" : ""} p-${c}">${esc(t)}</span>`;
export const stCls = (x: number | null | undefined) => (x == null || !isFinite(x) ? "muted" : x >= 1 ? "stable" : x >= 0.9 ? "watch" : x >= 0.7 ? "high" : "critical");
export const xC = (x: number | null | undefined) => { const c = stCls(x); return c === "muted" ? "ink-3" : c; };
