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
  // Ba quyền độc lập nhau: cấp mỗi Dashboard cũng hợp lệ.
  return {
    xperise: p.xem_xperise ?? true,
    mlx: p.xem_mlx ?? true,
    dashboard: p.xem_dashboard ?? false,
  };
}

/** Tài khoản có vào được phần nào không */
export const coQuyen = (a: TabAccess) => a.xperise || a.mlx || a.dashboard;

/** Trang mặc định khi đăng nhập, theo quyền được cấp */
export function trangChu(a: TabAccess): string | null {
  if (a.xperise) return '/';
  if (a.mlx) return '/mlx';
  if (a.dashboard) return '/dashboard';
  return null;
}

export const isMlxPath = (path: string) => path === '/mlx' || path.startsWith('/mlx/');
export const isDashboardPath = (path: string) => path === '/dashboard' || path.startsWith('/dashboard/');
