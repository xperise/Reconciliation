// Chiết khấu bảng kê taxi theo rule CMS, tính trên TỔNG giao dịch của cả 3 nguồn (CMS + XPAY + Be).
// Loại CK lấy từ bảng phân loại (file THOP_AR02 "C NGUYET"): CK 4, CK 5 (lũy tiến từng phần),
// CK đặc biệt x% (phẳng), SGS (cuốc ≥ 700k CK 2%, phần còn lại 8,5%).

export type RuleKind = 'CK4' | 'CK5' | 'FLAT' | 'SGS' | 'UNKNOWN';
export type Rule = { kind: RuleKind; pct?: number; label: string; raw: string };
export type Tier = { rest: number; width: number | null; pct: number; amount: number };
export type DiscountResult = {
  rule: Rule; total: number; discount: number;
  tiers?: Tier[];                                   // CK 4 / CK 5
  t700?: number; ck1?: number; ck2?: number; trips700?: number[]; // SGS: chỉ số dòng ≥ 700k
};

const W4: [number, number][] = [[10e6, 0], [10e6, .02], [10e6, .03], [20e6, .04], [50e6, .05], [100e6, .06]];
const W5: [number, number][] = [[5e6, 0], [15e6, .02], [10e6, .03], [20e6, .04], [50e6, .05], [100e6, .06]];
const LAST = .08;

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

/** Đọc chữ trong cột "loại CK": "CK 4", "Ck Đặc biệt 7%", "cuốc đi từ 700k trở lên ck 2% (...8,5%)" … */
export function parseRule(text: string | null | undefined): Rule | null {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const f = fold(raw);
  if (/700\s*k|700\.?000/.test(f) && /2\s*%/.test(f) && /8[,.]5\s*%/.test(f)) return { kind: 'SGS', label: 'SGS: cuốc ≥ 700k CK 2%, phần còn lại 8,5%', raw };
  if (/^ck\s*4$/.test(f)) return { kind: 'CK4', label: 'CK 4 (lũy tiến)', raw };
  if (/^ck\s*5$/.test(f)) return { kind: 'CK5', label: 'CK 5 (lũy tiến)', raw };
  const m = f.match(/dac biet\s*([\d.,]+)\s*%/);
  if (m) { const pct = Number(m[1].replace(',', '.')); if (isFinite(pct)) return { kind: 'FLAT', pct, label: `CK đặc biệt ${String(pct).replace('.', ',')}%`, raw }; }
  return { kind: 'UNKNOWN', label: raw, raw };
}

/** Lũy tiến từng phần: trừ dần độ rộng từng bậc; bậc cuối 8% áp cho toàn bộ phần còn lại */
export function tiered(total: number, widths: [number, number][]): { tiers: Tier[]; discount: number } {
  let rest = total; const tiers: Tier[] = []; let sum = 0;
  for (const [w, p] of widths) { const a = Math.max(0, Math.min(rest, w)) * p; tiers.push({ rest, width: w, pct: p, amount: a }); sum += a; rest -= w; }
  const a = Math.max(0, rest) * LAST; tiers.push({ rest, width: null, pct: LAST, amount: a }); sum += a;
  return { tiers, discount: Math.round(sum) };
}

/**
 * amounts: số tiền từng cuốc (đã gộp phụ phí Be theo Session ID).
 * fallbackPct: % chiết khấu cũ trong master data — chỉ dùng khi khách chưa có loại CK.
 */
export function computeDiscount(amounts: number[], rule: Rule | null, fallbackPct = 0): DiscountResult {
  const total = amounts.reduce((s, x) => s + (x || 0), 0);
  if (!rule) {
    const r: Rule = { kind: 'FLAT', pct: fallbackPct, label: `${String(+fallbackPct.toFixed(3)).replace('.', ',')}% (master data — chưa có loại CK)`, raw: '' };
    return { rule: r, total, discount: Math.round(total * fallbackPct / 100) };
  }
  if (rule.kind === 'CK4' || rule.kind === 'CK5') { const t = tiered(total, rule.kind === 'CK4' ? W4 : W5); return { rule, total, ...t }; }
  if (rule.kind === 'FLAT') return { rule, total, discount: Math.round(total * (rule.pct || 0) / 100) };
  if (rule.kind === 'SGS') {
    const trips700 = amounts.map((x, i) => (x >= 700000 ? i : -1)).filter((i) => i >= 0);
    const t700 = trips700.reduce((s, i) => s + amounts[i], 0);
    const ck1 = Math.round(t700 * 0.02);
    const ck2 = (total - ck1) * 0.085;
    return { rule, total, discount: Math.round(ck1 + ck2), t700, ck1, ck2, trips700 };
  }
  return { rule, total, discount: 0 };
}
