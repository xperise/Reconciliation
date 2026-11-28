import { supabaseAdmin } from '@/lib/supabase/admin';
import { CAU_HINH_MAC_DINH, chuanHoaMa, kiemTraCauHinh, type QuyTrinhCauHinh } from './cau-hinh';
import { toChucHienTai } from './to-chuc-server';

/**
 * Đọc cấu hình quy trình từ bảng tt_role và tt_buoc_quy_trinh (SQL 47).
 * Dự phòng: bảng chưa có, rỗng, lỗi đọc, hoặc cấu hình không hợp lệ → dùng CAU_HINH_MAC_DINH
 * (đúng hành vi VCB hiện tại), không làm hỏng luồng bảng kê.
 */
export async function docCauHinhQuyTrinh(org?: string): Promise<QuyTrinhCauHinh> {
  try {
    const sb = supabaseAdmin();
    const o = org ?? (await toChucHienTai());
    const [r1, r2] = await Promise.all([
      sb.from('tt_role').select('key, ten, thu_tu, kich_hoat').eq('org_id', o).order('thu_tu').order('key'),
      sb.from('tt_buoc_quy_trinh').select('key, thu_tu, role_key, mode, ket_qua').eq('org_id', o).order('thu_tu'),
    ]);
    if (r1.error || r2.error || !r1.data?.length || !r2.data?.length) return CAU_HINH_MAC_DINH;
    // Nhóm và người duyệt (SQL 58). Chưa chạy SQL 58 thì bỏ qua: nhóm = thu_tu, không người cụ thể.
    const nhomCua: Record<string, number> = {}, nguoiCua: Record<string, string | null> = {}, suaDoiCua: Record<string, boolean> = {};
    const ycCua: Record<string, boolean> = {}, ckCua: Record<string, string> = {};
    const { data: ext, error: eExt } = await sb.from('tt_buoc_quy_trinh').select('key, nhom, nguoi, sua_doi, yeu_cau_duyet, chay_khi').eq('org_id', o);
    if (!eExt) for (const x of (ext ?? []) as any[]) { nhomCua[chuanHoaMa(x.key)] = x.nhom; nguoiCua[chuanHoaMa(x.key)] = x.nguoi ?? null; suaDoiCua[chuanHoaMa(x.key)] = x.sua_doi !== false; ycCua[chuanHoaMa(x.key)] = x.yeu_cau_duyet !== false; ckCua[chuanHoaMa(x.key)] = x.chay_khi ?? 'luon'; }
    else { // chưa chạy SQL 61: không có hai cột mới, giữ nguyên hành vi
      const { data: ext2 } = await sb.from('tt_buoc_quy_trinh').select('key, nhom, nguoi, sua_doi').eq('org_id', o);
      for (const x of (ext2 ?? []) as any[]) { nhomCua[chuanHoaMa(x.key)] = x.nhom; nguoiCua[chuanHoaMa(x.key)] = x.nguoi ?? null; suaDoiCua[chuanHoaMa(x.key)] = x.sua_doi !== false; }
    }
    const c: QuyTrinhCauHinh = {
      roles: r1.data.map((r: any) => ({ key: chuanHoaMa(r.key), ten: r.ten, thuTu: r.thu_tu, kichHoat: !!r.kich_hoat })),
      buoc: r2.data.map((b: any) => ({ key: chuanHoaMa(b.key), thuTu: b.thu_tu, roleKey: chuanHoaMa(b.role_key), mode: b.mode, ketQua: b.ket_qua, nhom: nhomCua[b.key] ?? b.thu_tu, nguoi: nguoiCua[b.key] ?? null, suaDoi: suaDoiCua[b.key] ?? true, yeuCauDuyet: ycCua[b.key] ?? true, chayKhi: (ckCua[b.key] ?? 'luon') as any })),
      quorumSuaDoi: 'all',
    };
    const loi = kiemTraCauHinh(c);
    if (loi.length) { console.warn('[tuan-thu] cấu hình quy trình không hợp lệ, dùng mặc định:', loi); return CAU_HINH_MAC_DINH; }
    return c;
  } catch {
    return CAU_HINH_MAC_DINH;
  }
}
