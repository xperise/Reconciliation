import { companyKey } from './normalize';
import type { MlxCustomer } from './types';

/**
 * Tìm khách hàng trong master data theo tên lấy từ file.
 * Thứ tự: khớp chính xác tên → khớp tên viết tắt → tên này chứa tên kia (chọn tên dài nhất).
 */
export function matchCustomer(nameFromFile: string, customers: MlxCustomer[]): MlxCustomer | null {
  const key = companyKey(nameFromFile);
  if (!key) return null;

  const exact = customers.find((c) => companyKey(c.ten_cong_ty) === key);
  if (exact) return exact;

  const byShort = customers.find((c) => c.ten_viet_tat && companyKey(c.ten_viet_tat) === key);
  if (byShort) return byShort;

  const partial = customers
    .filter((c) => {
      const k = companyKey(c.ten_cong_ty);
      return k.length >= 6 && (key.includes(k) || k.includes(key));
    })
    .sort((a, b) => companyKey(b.ten_cong_ty).length - companyKey(a.ten_cong_ty).length);
  return partial[0] ?? null;
}
