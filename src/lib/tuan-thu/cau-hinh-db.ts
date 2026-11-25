import { supabaseAdmin } from '@/lib/supabase/admin';
import { CAU_HINH_MAC_DINH, kiemTraCauHinh, type QuyTrinhCauHinh } from './cau-hinh';

/**
 * Đọc cấu hình quy trình từ bảng tt_role và tt_buoc_quy_trinh (SQL 47).
 * Dự phòng: bảng chưa có, rỗng, lỗi đọc, hoặc cấu hình không hợp lệ → dùng CAU_HINH_MAC_DINH
 * (đúng hành vi VCB hiện tại), không làm hỏng luồng bảng kê.
 */
export async function docCauHinhQuyTrinh(): Promise<QuyTrinhCauHinh> {
  try {
    const sb = supabaseAdmin();
    const [r1, r2] = await Promise.all([
      sb.from('tt_role').select('key, ten, thu_tu').order('thu_tu'),
      sb.from('tt_buoc_quy_trinh').select('key, thu_tu, role_key, mode, ket_qua').order('thu_tu'),
    ]);
    if (r1.error || r2.error || !r1.data?.length || !r2.data?.length) return CAU_HINH_MAC_DINH;
    const c: QuyTrinhCauHinh = {
      roles: r1.data.map((r: any) => ({ key: r.key, ten: r.ten, thuTu: r.thu_tu })),
      buoc: r2.data.map((b: any) => ({ key: b.key, thuTu: b.thu_tu, roleKey: b.role_key, mode: b.mode, ketQua: b.ket_qua })),
      quorumSuaDoi: 'all',
    };
    const loi = kiemTraCauHinh(c);
    if (loi.length) { console.warn('[tuan-thu] cấu hình quy trình không hợp lệ, dùng mặc định:', loi); return CAU_HINH_MAC_DINH; }
    return c;
  } catch {
    return CAU_HINH_MAC_DINH;
  }
}
