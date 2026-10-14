import { companyKey } from './normalize';
import type { MlxCustomer } from './types';

/** Các manh mối nhận dạng khách hàng đọc được từ một file tải lên */
export interface MatchHints {
  /** Tên công ty — có thể viết hoa/thường, có dấu/không dấu, hoặc chỉ một phần */
  names?: (string | null | undefined)[];
  /** Mã khách hàng / mã hợp đồng */
  codes?: (string | null | undefined)[];
  /** Mã số thuế */
  mst?: string | null;
}

/** Bỏ mã đứng đầu tên: "C493 - CÔNG TY A" hoặc "20000012 CÔNG TY A" → "CÔNG TY A" */
function boMaDauTen(s: string): string {
  return s.replace(/^\s*[A-Za-z0-9]{2,12}\s*[-–_]\s*/, '').trim();
}

const chiSo = (s: string | null | undefined) => String(s ?? '').replace(/[^0-9]/g, '');

/**
 * Tìm khách hàng trong master data.
 *
 * Chỉ cần MỘT manh mối khớp là đủ, theo thứ tự chắc chắn giảm dần:
 * MST → mã khách hàng / mã hợp đồng → tên đầy đủ → tên khớp một phần.
 * Mọi phép so đều bỏ dấu, bỏ hoa/thường và bỏ ký tự đặc biệt.
 */
export function matchCustomer(
  hints: MatchHints | string,
  customers: MlxCustomer[],
): MlxCustomer | null {
  const h: MatchHints = typeof hints === 'string' ? { names: [hints] } : hints;

  // ---- 1) MST: chắc chắn nhất, so theo phần chữ số -------------------
  const mst = chiSo(h.mst);
  if (mst.length >= 10) {
    const theoMst = customers.find((c) => chiSo(c.mst) === mst);
    if (theoMst) return theoMst;
  }

  // ---- 2) Mã khách hàng / mã hợp đồng --------------------------------
  const codes = (h.codes ?? []).map((v) => companyKey(v)).filter((v) => v.length >= 2);
  for (const code of codes) {
    const theoMa = customers.find(
      (c) =>
        companyKey(c.ma_hop_dong) === code ||
        companyKey(c.ma_khach_hang) === code ||
        companyKey(c.ten_viet_tat) === code,
    );
    if (theoMa) return theoMa;
  }

  // ---- 3) Tên công ty ------------------------------------------------
  // Mỗi tên thử cả bản gốc và bản đã bỏ mã đứng đầu
  const names: string[] = [];
  for (const raw of h.names ?? []) {
    const t = String(raw ?? '').trim();
    if (!t) continue;
    for (const v of [t, boMaDauTen(t)]) {
      const k = companyKey(v);
      if (k && !names.includes(k)) names.push(k);
    }
  }

  for (const key of names) {
    const dungY = customers.find((c) => companyKey(c.ten_cong_ty) === key);
    if (dungY) return dungY;
  }
  for (const key of names) {
    const theoVietTat = customers.find((c) => c.ten_viet_tat && companyKey(c.ten_viet_tat) === key);
    if (theoVietTat) return theoVietTat;
  }

  // ---- 4) Khớp một phần: tên này chứa tên kia, chọn tên dài nhất ------
  // Ngưỡng 6 ký tự để "CÔNG TY" hay "TNHH" không kéo nhầm khách khác.
  let tot: { c: MlxCustomer; do: number } | null = null;
  for (const key of names) {
    for (const c of customers) {
      const k = companyKey(c.ten_cong_ty);
      if (k.length < 6) continue;
      if (key.includes(k) || k.includes(key)) {
        if (!tot || k.length > tot.do) tot = { c, do: k.length };
      }
    }
  }
  return tot?.c ?? null;
}

/** Manh mối lấy từ một file đã đọc */
export function hintsFromFile(p: {
  companyFromFile: string;
  codeFromFile?: string;
  mstFromFile?: string;
  fileName?: string;
}): MatchHints {
  return {
    names: [p.companyFromFile],
    codes: [p.codeFromFile],
    mst: p.mstFromFile,
  };
}
