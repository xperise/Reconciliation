/**
 * Quyền xem tab Xperise / MLX / Dashboard.
 * - Admin luôn xem được cả 3.
 * - Cột xem_xperise / xem_mlx chưa có (chưa chạy SQL 13) → coi như được xem, để không ai bị khoá nhầm.
 * - Cột xem_dashboard chưa có (chưa chạy SQL 14) → chỉ admin xem được.
 */
/** dbAll / dbTs / dbM: 3 phần trong tab Dashboard (Tổng quan · Travel & SaaS · Mobility). dashboard = có ít nhất 1 phần. */
export type TabAccess = { xperise: boolean; mlx: boolean; dashboard: boolean; dbAll: boolean; dbTs: boolean; dbM: boolean; guide: boolean; guideEdit: boolean };

type ProfileAccess = {
  role?: string | null; xem_xperise?: boolean | null; xem_mlx?: boolean | null; xem_dashboard?: boolean | null;
  xem_db_all?: boolean | null; xem_db_ts?: boolean | null; xem_db_m?: boolean | null;
  xem_huongdan?: boolean | null; sua_huongdan?: boolean | null;
};
export function tabAccess(p: ProfileAccess | null | undefined): TabAccess {
  if (!p) return { xperise: false, mlx: false, dashboard: false, dbAll: false, dbTs: false, dbM: false, guide: false, guideEdit: false };
  if (p.role === 'admin') return { xperise: true, mlx: true, dashboard: true, dbAll: true, dbTs: true, dbM: true, guide: true, guideEdit: true };
  // Chưa chạy SQL 22 (cột chưa có): quyền Dashboard cũ áp cho cả 3 phần
  const d = p.xem_dashboard ?? false;
  const dbAll = p.xem_db_all ?? d, dbTs = p.xem_db_ts ?? d, dbM = p.xem_db_m ?? d;
  // Các quyền độc lập nhau: cấp mỗi Dashboard (hay mỗi 1 phần của Dashboard) cũng hợp lệ.
  return {
    xperise: p.xem_xperise ?? true,
    mlx: p.xem_mlx ?? true,
    dashboard: d && (dbAll || dbTs || dbM),
    dbAll: d && dbAll, dbTs: d && dbTs, dbM: d && dbM,
    // Tab Hướng dẫn (SQL 23): chưa có cột thì ai cũng xem được, chỉ admin sửa
    guide: p.xem_huongdan ?? true,
    guideEdit: (p.xem_huongdan ?? true) && (p.sua_huongdan ?? false),
  };
}

/** Tài khoản có vào được phần nào không */
export const coQuyen = (a: TabAccess) => a.xperise || a.mlx || a.dashboard || a.guide;

/** Trang mặc định khi đăng nhập, theo quyền được cấp */
export function trangChu(a: TabAccess): string | null {
  if (a.xperise) return '/';
  if (a.mlx) return '/mlx';
  if (a.dashboard) return '/dashboard';
  if (a.guide) return '/huong-dan';
  return null;
}

export const isMlxPath = (path: string) => path === '/mlx' || path.startsWith('/mlx/');
export const isDashboardPath = (path: string) => path === '/dashboard' || path.startsWith('/dashboard/');
/** Tab Hướng dẫn: trang xem/sửa, trang in PDF, API */
export const isGuidePath = (path: string) => path === '/guide' || path === '/huong-dan' || path.startsWith('/huong-dan/') || path.startsWith('/in-huong-dan');
