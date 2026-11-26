import { supabaseAdmin } from '@/lib/supabase/admin';
import { CAU_HINH_MAC_DINH, chuanHoaMa, kiemTraCauHinh, type QuyTrinhCauHinh } from './cau-hinh';
import { TO_CHUC_MAC_DINH_ID } from './to-chuc';

/**
 * Đọc cấu hình quy trình từ bảng tt_role và tt_buoc_quy_trinh (SQL 47).
 * Dự phòng: bảng chưa có, rỗng, lỗi đọc, hoặc cấu hình không hợp lệ → dùng CAU_HINH_MAC_DINH
 * (đúng hành vi VCB hiện tại), không làm hỏng luồng bảng kê.
 */
export async function docCauHinhQuyTrinh(): Promise<QuyTrinhCauHinh> {
  try {
    const sb = supabaseAdmin();
    const [r1, r2] = await Promise.all([
      sb.from('tt_role').select('key, ten, thu_tu, kich_hoat').eq('org_id', TO_CHUC_MAC_DINH_ID).order('thu_tu').order('key'),
      sb.from('tt_buoc_quy_trinh').select('key, thu_tu, role_key, mode, ket_qua').eq('org_id', TO_CHUC_MAC_DINH_ID).order('thu_tu'),
    ]);
    if (r1.error || r2.error || !r1.data?.length || !r2.data?.length) return CAU_HINH_MAC_DINH;
    const c: QuyTrinhCauHinh = {
      roles: r1.data.map((r: any) => ({ key: chuanHoaMa(r.key), ten: r.ten, thuTu: r.thu_tu, kichHoat: !!r.kich_hoat })),
      buoc: r2.data.map((b: any) => ({ key: chuanHoaMa(b.key), thuTu: b.thu_tu, roleKey: chuanHoaMa(b.role_key), mode: b.mode, ketQua: b.ket_qua })),
      quorumSuaDoi: 'all',
    };
    const loi = kiemTraCauHinh(c);
    if (loi.length) { console.warn('[tuan-thu] cấu hình quy trình không hợp lệ, dùng mặc định:', loi); return CAU_HINH_MAC_DINH; }
    return c;
  } catch {
    return CAU_HINH_MAC_DINH;
  }
}
