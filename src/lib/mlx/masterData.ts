import { getSupabase } from './supabase';
import type { MlxCustomer } from './types';

const TABLE = 'mlx_customers';
const COLS = 'id, ma_khach_hang, ma_hop_dong, ten_cong_ty, ten_viet_tat, dia_chi, mst, chiet_khau';

export class TableMissingError extends Error {}

function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) {
    throw new TableMissingError(
      'Chưa có bảng mlx_customers trên Supabase. Chạy file supabase/migrations/11_mlx_customers.sql trong SQL Editor.',
    );
  }
  throw new Error(error.message);
}

export async function loadCustomers(): Promise<MlxCustomer[]> {
  const { data, error } = await getSupabase().from(TABLE).select(COLS).order('ten_cong_ty');
  check(error);
  return (data ?? []).map((r: MlxCustomer) => ({
    id: r.id,
    ma_khach_hang: r.ma_khach_hang ?? '',
    ma_hop_dong: r.ma_hop_dong ?? '',
    ten_cong_ty: r.ten_cong_ty ?? '',
    ten_viet_tat: r.ten_viet_tat ?? '',
    dia_chi: r.dia_chi ?? '',
    mst: r.mst ?? '',
    chiet_khau: Number(r.chiet_khau ?? 0),
  }));
}

/**
 * Lưu toàn bộ bảng: xoá dòng đã bị bỏ, cập nhật dòng cũ, thêm dòng mới.
 * Thực hiện theo thứ tự xoá → cập nhật → thêm để tránh vướng ràng buộc unique khi đổi tên.
 */
export async function saveCustomers(rows: MlxCustomer[], originalIds: string[]): Promise<void> {
  const sb = getSupabase();
  const keepIds = new Set(rows.filter((r) => r.id).map((r) => r.id as string));
  const toDelete = originalIds.filter((id) => !keepIds.has(id));

  const clean = (r: MlxCustomer) => ({
    ma_khach_hang: r.ma_khach_hang.trim(),
    ma_hop_dong: r.ma_hop_dong.trim(),
    ten_cong_ty: r.ten_cong_ty.trim(),
    ten_viet_tat: r.ten_viet_tat.trim(),
    dia_chi: r.dia_chi.trim(),
    mst: r.mst.trim(),
    chiet_khau: Number(r.chiet_khau) || 0,
  });

  if (toDelete.length) {
    const { error } = await sb.from(TABLE).delete().in('id', toDelete);
    check(error);
  }
  const existing = rows.filter((r) => r.id).map((r) => ({ id: r.id, ...clean(r) }));
  if (existing.length) {
    const { error } = await sb.from(TABLE).upsert(existing, { onConflict: 'id' });
    check(error);
  }
  const fresh = rows.filter((r) => !r.id).map(clean);
  if (fresh.length) {
    const { error } = await sb.from(TABLE).insert(fresh);
    check(error);
  }
}
