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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tệp thuộc tổ chức nào: đường dẫn mới là tuan-thu/<org_id>/...
 * Đường dẫn cũ (tuan-thu/<mã khách>/...) thuộc tổ chức mặc định.
 * Trả về true nếu tổ chức `org` được phép truy cập đường dẫn `path`.
 */
export function coQuyenTepCuaToChuc(path: string, org: string): boolean {
  if (!path.startsWith('tuan-thu/') || path.includes('..')) return false;
  const doan = path.split('/')[1] ?? '';
  if (UUID.test(doan)) return doan.toLowerCase() === org.toLowerCase();
  return org === TO_CHUC_MAC_DINH_ID; // đường dẫn cũ, chỉ tổ chức mặc định
}

/** Đường dẫn mới cho tệp của một tổ chức. */
export function duongDanTepTo(org: string, ...doan: string[]): string {
  return ['tuan-thu', org, ...doan].join('/');
}
