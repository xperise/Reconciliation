import { currentUser } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { TO_CHUC_MAC_DINH_ID } from './to-chuc';

/**
 * Tổ chức của người đang đăng nhập (SQL 51).
 * Hiện mỗi người thuộc một tổ chức. Người chưa có dòng trong tt_nguoi_to_chuc
 * được coi là thuộc tổ chức mặc định. CẦN BỎ dự phòng này khi mở tổ chức thứ hai,
 * nếu không dữ liệu có thể bị ghi nhầm vào tổ chức mặc định.
 */
export async function toChucHienTai(): Promise<string> {
  const u = await currentUser();
  if (!u) return TO_CHUC_MAC_DINH_ID;
  const { data, error } = await supabaseAdmin()
    .from('tt_nguoi_to_chuc').select('org_id').eq('user_id', u.id).limit(1).maybeSingle();
  if (error) throw new Error(`Không xác định được tổ chức: ${error.message}`);
  return data?.org_id ?? TO_CHUC_MAC_DINH_ID;
}
