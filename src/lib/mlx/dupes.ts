// Phát hiện khách bị nhập thành nhiều dòng trong master data MLX.
// Hai dòng là "trùng" khi: cùng mã hợp đồng · cùng mã khách hàng · hoặc cùng tên sau khi chuẩn hoá
// (bỏ dấu, bỏ "công ty / TNHH / cổ phần / Co.,Ltd…", gom TP. = thành phố, VPĐD, CN…).
import type { MlxCustomer } from './types';

const fold = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
const RULES: [RegExp, string][] = [
  [/\b(thanh pho ho chi minh|tp ho chi minh|tp hcm|tphcm|ho chi minh city|hcmc|ho chi minh)\b/g, 'hcm'],
  [/\bthanh pho\b/g, 'tp'], [/\bvan phong dai dien\b/g, 'vpdd'], [/\bchi nhanh\b/g, 'cn'], [/\bviet nam\b/g, 'vn'],
];
const LEGAL = /\b(cong ty|cty|tnhh|trach nhiem huu han|co phan|cp|mtv|mot thanh vien|jsc|joint stock company|company limited|co ltd|company ltd|limited|ltd|co|inc|corp|corporation)\b/g;
/** Khoá tên dùng để so trùng: giữ chi nhánh / địa danh, bỏ loại hình doanh nghiệp */
export function nameKey(name: string): string {
  let x = fold(name).replace(/^\s*[a-z0-9]{2,12}\s*[-–_]\s*/, '').replace(/[^a-z0-9]+/g, ' ');
  for (const [re, to] of RULES) x = x.replace(re, to);
  return x.replace(LEGAL, ' ').replace(/\s+/g, ' ').trim();
}

export type Reason = 'ma_hop_dong' | 'ma_khach_hang' | 'ten';
export type DupGroup = { ids: string[]; reasons: Reason[]; label: string; strong: boolean };
type Lite = Pick<MlxCustomer, 'ma_hop_dong' | 'ma_khach_hang' | 'ten_cong_ty'> & { id?: string };

/** Gom các dòng trùng (union-find). key(): định danh dòng (id hoặc khoá tạm trên lưới) */
export function findDupes<T extends Lite>(list: T[], key: (x: T) => string = (x) => x.id ?? ''): DupGroup[] {
  const par = new Map<string, string>(), rs = new Map<string, Set<Reason>>();
  const f = (a: string): string => { const p = par.get(a)!; if (p === a) return a; const r = f(p); par.set(a, r); return r; };
  const u = (a: string, b: string, why: Reason) => { const ra = f(a), rb = f(b); if (ra !== rb) { par.set(rb, ra); const s = rs.get(ra) ?? new Set(); (rs.get(rb) ?? new Set()).forEach((x) => s.add(x)); rs.set(ra, s); } rs.get(f(a))!.add(why); };
  list.forEach((x) => { const k = key(x); if (k) { par.set(k, k); rs.set(k, new Set()); } });
  const by = (get: (x: T) => string, why: Reason) => { const m = new Map<string, string>();
    for (const x of list) { const k = key(x), v = get(x); if (!k || !v) continue; const o = m.get(v); if (o) u(o, k, why); else m.set(v, k); } };
  by((x) => String(x.ma_hop_dong ?? '').replace(/\s+/g, ''), 'ma_hop_dong');
  by((x) => String(x.ma_khach_hang ?? '').trim().toUpperCase(), 'ma_khach_hang');
  by((x) => nameKey(x.ten_cong_ty), 'ten');
  const grp = new Map<string, string[]>();
  list.forEach((x) => { const k = key(x); if (!k) return; const r = f(k); (grp.get(r) ?? grp.set(r, []).get(r)!).push(k); });
  const byKey = new Map(list.map((x) => [key(x), x]));
  return [...grp.entries()].filter(([, ids]) => ids.length > 1).map(([r, ids]) => {
    const reasons = [...(rs.get(r) ?? [])];
    // chỉ trùng tên nhưng mỗi dòng có mã hợp đồng riêng → có thể là 2 hợp đồng khác nhau: cảnh báo, không tự gộp
    const hds = new Set(ids.map((i) => String(byKey.get(i)?.ma_hop_dong ?? '').trim()).filter(Boolean));
    const strong = reasons.includes('ma_hop_dong') || reasons.includes('ma_khach_hang') || hds.size <= 1;
    return { ids, reasons, strong, label: reasons.map((x) => (x === 'ma_hop_dong' ? 'cùng mã hợp đồng' : x === 'ma_khach_hang' ? 'cùng mã khách hàng' : 'cùng tên')).join(' · ') };
  });
}

/** Dòng nên giữ trong một nhóm trùng: nhiều thông tin nhất (mã HĐ, MST, địa chỉ, loại CK…) */
export function bestOf<T extends Lite>(rows: T[]): T {
  const score = (c: T) => ['ma_hop_dong', 'ma_khach_hang', 'ten_viet_tat', 'dia_chi', 'mst', 'loai_ck', 'chiet_khau'].reduce((n, k) => n + (String((c as unknown as Record<string, unknown>)[k] ?? '').trim() ? 1 : 0), 0);
  return [...rows].sort((a, b) => score(b) - score(a))[0];
}
