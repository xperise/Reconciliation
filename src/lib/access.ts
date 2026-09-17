/**
 * Quyền xem tab Xperise / MLX.
 * - Admin luôn xem được cả 2.
 * - Cột chưa có (chưa chạy SQL 13) → coi như được xem cả 2, để không ai bị khoá nhầm.
 */
export type TabAccess = { xperise: boolean; mlx: boolean };

export function tabAccess(p: { role?: string | null; xem_xperise?: boolean | null; xem_mlx?: boolean | null } | null | undefined): TabAccess {
  if (!p) return { xperise: false, mlx: false };
  if (p.role === 'admin') return { xperise: true, mlx: true };
  const xperise = p.xem_xperise ?? true;
  const mlx = p.xem_mlx ?? true;
  // Dữ liệu lỗi (cả 2 false) → mở Xperise để admin còn vào sửa được
  return xperise || mlx ? { xperise, mlx } : { xperise: true, mlx: false };
}

export const isMlxPath = (path: string) => path === '/mlx' || path.startsWith('/mlx/');
