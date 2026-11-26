/**
 * Mã tổ chức mặc định (SQL 50). Dữ liệu hiện có thuộc tổ chức này.
 * Chưa được dùng để lọc truy vấn; bước tiếp theo sẽ lọc theo org_id ở mọi truy vấn tt_*.
 */
export const TO_CHUC_MAC_DINH_ID = '00000000-0000-0000-0000-000000000001';

/** Gắn org_id cho một dòng hoặc nhiều dòng trước khi insert. Nếu dòng đã có org_id thì giữ nguyên. */
export function themOrg<T extends object>(rows: T | T[], org: string): any {
  const f = (r: T) => ({ org_id: org, ...r });
  return Array.isArray(rows) ? rows.map(f) : f(rows);
}
