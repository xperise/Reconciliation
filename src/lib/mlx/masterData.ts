import { getSupabase } from './supabase';
import type { MlxCustomer } from './types';

const TABLE = 'mlx_customers';
const COLS = 'id, ma_khach_hang, ma_hop_dong, ten_cong_ty, ten_viet_tat, dia_chi, mst, chiet_khau';

/** Giới hạn trên của số khách tải về một lần. PostgREST mặc định chỉ trả 1000 dòng. */
const MAX_ROWS = 20000;

export class TableMissingError extends Error {}

type PgError = { code?: string; message: string; details?: string; hint?: string } | null;

function check(error: PgError) {
  if (!error) return;
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) {
    throw new TableMissingError(
      'Chưa có bảng mlx_customers trên Supabase. Chạy file supabase/migrations/11_mlx_customers.sql trong SQL Editor.',
    );
  }
  throw new Error(error.message);
}

export async function loadCustomers(): Promise<MlxCustomer[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(COLS)
    .order('ten_cong_ty')
    .range(0, MAX_ROWS - 1);
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

/** Dịch lỗi của Postgres sang câu tiếng Việt nói rõ phải làm gì. */
function loiLuu(error: PgError): Error {
  const msg = error?.message ?? 'Không rõ lỗi';
  const code = error?.code;

  if (code === 'PGRST202' || code === '42883' || /mlx_luu_master_data/i.test(msg + (error?.hint ?? ''))) {
    return new Error(
      'Chưa có hàm lưu master data trên Supabase. Vào SQL Editor chạy file ' +
        'supabase/migrations/16_mlx_luu_master_data.sql rồi lưu lại.',
    );
  }
  if (code === '23505') {
    const ten = /\(([^)]*)\)\s*already exists/i.exec(error?.details ?? '')?.[1];
    return new Error(
      `Trùng tên công ty${ten ? `: "${ten}"` : ''}. Mỗi khách hàng chỉ được có một dòng — ` +
        'dùng ô tìm kiếm để tìm và xoá dòng thừa.',
    );
  }
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return new Error('Tài khoản của bạn không có quyền sửa master data MLX.');
  }
  return new Error(msg);
}

export interface KetQuaLuu {
  xoa: number;
  sua: number;
  them: number;
}

/**
 * Lưu toàn bộ bảng trong một giao dịch duy nhất (hàm mlx_luu_master_data).
 *
 * Không tự ghép nhiều lệnh rời ở đây: khi dán đè một danh sách sắp xếp khác,
 * tên công ty bị xê dịch giữa các dòng cũ nên giữa chừng có hai dòng tạm thời
 * trùng tên, Postgres chặn lại dù danh sách cuối cùng hoàn toàn hợp lệ. Hàm
 * trên Supabase xử lý việc đó và đảm bảo hoặc lưu hết, hoặc không đổi gì.
 */
export async function saveCustomers(rows: MlxCustomer[], originalIds: string[]): Promise<KetQuaLuu> {
  const payload = rows.map((r) => ({
    id: r.id ?? null, // null = khách mới
    ma_khach_hang: r.ma_khach_hang.trim(),
    ma_hop_dong: r.ma_hop_dong.trim(),
    ten_cong_ty: r.ten_cong_ty.trim(),
    ten_viet_tat: r.ten_viet_tat.trim(),
    dia_chi: r.dia_chi.trim(),
    mst: r.mst.trim(),
    chiet_khau: Number(r.chiet_khau) || 0,
  }));

  const { data, error } = await getSupabase().rpc('mlx_luu_master_data', {
    payload,
    ban_dau: originalIds,
  });
  if (error) throw loiLuu(error);

  const kq = (data ?? {}) as Partial<KetQuaLuu>;
  return { xoa: Number(kq.xoa ?? 0), sua: Number(kq.sua ?? 0), them: Number(kq.them ?? 0) };
}
