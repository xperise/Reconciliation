/**
 * Quyền xem tab Xperise / MLX / Dashboard.
 * - Admin luôn xem được cả 3.
 * - Cột xem_xperise / xem_mlx chưa có (chưa chạy SQL 13) → coi như được xem, để không ai bị khoá nhầm.
 * - Cột xem_dashboard chưa có (chưa chạy SQL 14) → chỉ admin xem được.
 */
export type TabAccess = { xperise: boolean; mlx: boolean; dashboard: boolean };

export function tabAccess(p: { role?: string | null; xem_xperise?: boolean | null; xem_mlx?: boolean | null; xem_dashboard?: boolean | null } | null | undefined): TabAccess {
  if (!p) return { xperise: false, mlx: false, dashboard: false };
  if (p.role === 'admin') return { xperise: true, mlx: true, dashboard: true };
  const xperise = p.xem_xperise ?? true;
  const mlx = p.xem_mlx ?? true;
  const dashboard = p.xem_dashboard ?? false;
  // Dữ liệu lỗi (cả 2 false) → mở Xperise để admin còn vào sửa được
  return xperise || mlx ? { xperise, mlx, dashboard } : { xperise: true, mlx: false, dashboard };
}

export const isMlxPath = (path: string) => path === '/mlx' || path.startsWith('/mlx/');
export const isDashboardPath = (path: string) => path === '/dashboard' || path.startsWith('/dashboard/');
