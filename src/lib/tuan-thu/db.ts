import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { PhongBan, ThamSoHopDong } from './types';
import { toChucHienTai } from './to-chuc-server';

export const BUCKET_TT = 'bang-ke';
export type BuocDuyet = string; // mã role, lấy từ cấu hình
export const TEN_BUOC: Record<string, string> = {
  cho_ke_toan: 'Chờ kế toán', cho_scope: 'Chờ CEO duyệt', cho_ceo: 'Chờ CEO duyệt', da_gui: 'Đã gửi khách', huy: 'Đã hủy',
};
/** Nhãn trạng thái, kể cả trạng thái nhóm mới (cho_nhom_k) */
export const nhanBuoc = (b: string) => TEN_BUOC[b] ?? (/^cho_nhom_(\d+)$/.exec(b) ? `Chờ nhóm ${/^cho_nhom_(\d+)$/.exec(b)![1]}` : b);

export type QuyenTT = 'quan_tri' | 'kich_hoat' | 'xem_bao_cao';

export type NguoiTT = {
  id: string; email: string; full_name: string;
  laAdmin: boolean;
  quyen: QuyenTT[];
  phong_ban: PhongBan | null;
};

/** Người dùng hiện tại trong phần Tuân thủ. Null = không có quyền vào. */
export async function nguoiTT(): Promise<NguoiTT | null> {
  const u = await currentUser();
  if (!u) return null;
  const org = await toChucHienTai();
  const sb = supabaseAdmin();
  const [{ data }, { data: qs }] = await Promise.all([
    sb.from('tt_thanh_vien').select('phong_ban').eq('user_id', u.id).eq('org_id', org).maybeSingle(),
    sb.from('tt_quyen').select('quyen').eq('user_id', u.id).eq('org_id', org),
  ]);
  const phong_ban = (data?.phong_ban ?? null) as PhongBan | null;
  const quyen = ((qs ?? []).map((x: any) => x.quyen) as QuyenTT[]);
  // Admin của ứng dụng, hoặc được cấp quyền quản trị trong tổ chức (ví dụ CEO được làm thay admin)
  const laAdmin = u.role === 'admin' || quyen.includes('quan_tri');
  if (!laAdmin && !phong_ban && quyen.length === 0) return null;
  return { id: u.id, email: u.email, full_name: u.full_name, laAdmin, phong_ban, quyen };
}

/** Người dùng có quyền bổ sung này (hoặc là admin/quản trị). */
export const coQuyen = (n: NguoiTT, q: QuyenTT) => n.laAdmin || n.quyen.includes(q);

/** Có được thao tác thay phòng ban này không. Admin làm thay được mọi phòng (giai đoạn pilot), mọi thao tác đều ghi tên. */
export const duocLam = (n: NguoiTT, pb: PhongBan) => n.laAdmin || n.phong_ban === pb;

export async function batBuoc(pb?: PhongBan): Promise<NguoiTT> {
  const n = await nguoiTT();
  if (!n) throw new Error('Tài khoản chưa được cấp quyền phần Tuân thủ bảng kê.');
  if (pb && !duocLam(n, pb)) throw new Error('Thao tác này thuộc phòng ban khác.');
  return n;
}

/** Bộ tham số có hiệu lực cho tháng: phiên bản cao nhất có hieu_luc_tu ≤ tháng. */
export async function thamSoHieuLuc(hopDongId: string, thang: string): Promise<{ phien_ban: number; tham_so: ThamSoHopDong }> {
  const { data, error } = await supabaseAdmin().from('tt_bo_quy_tac')
    .select('phien_ban, tham_so, hieu_luc_tu').eq('hop_dong_id', hopDongId)
    .lte('hieu_luc_tu', thang).order('phien_ban', { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(`Chưa có bộ quy tắc hiệu lực cho tháng ${thang}.`);
  return { phien_ban: data[0].phien_ban, tham_so: data[0].tham_so as ThamSoHopDong };
}

/** Gộp sâu: dùng khi áp sửa đổi lên bộ tham số. Mảng bị thay nguyên. */
export function gopSau<T>(goc: T, them: any): T {
  if (them === null || typeof them !== 'object' || Array.isArray(them)) return them as T;
  const out: any = Array.isArray(goc) ? [...(goc as any)] : { ...(goc as any) };
  for (const k of Object.keys(them)) out[k] = gopSau((goc as any)?.[k], them[k]);
  return out;
}

export const fmtVnd = (x: number | null | undefined) =>
  x === null || x === undefined ? '—' : Math.round(Number(x)).toLocaleString('vi-VN');
export const nhanThang = (thang: string, dot?: number | null) => {
  const [y, m] = thang.split('-'); return `T${m}/${y}${dot ? ` · đợt ${dot}` : ''}`;
};

/** Các lần chặn còn hiệu lực của Demand/Supply (SQL 40). Chưa chạy SQL 40 thì coi như không có. */
export async function dsDangChan(lanId: string): Promise<any[]> {
  const { data, error } = await supabaseAdmin().from('tt_chan').select('*').eq('lan_chay_id', lanId).is('go_luc', null).order('luc');
  return error ? [] : (data ?? []);
}

/**
 * Tên file an toàn cho khóa Supabase Storage: bỏ dấu tiếng Việt, đổi khoảng trắng và ký tự lạ thành "_".
 * (Storage từ chối khóa có dấu / ký tự đặc biệt — lỗi "Invalid key".) Tên gốc giữ riêng để hiển thị và đính kèm thư.
 */
export function tenAnToan(ten: string): string {
  const cham = ten.lastIndexOf('.');
  const goc = cham > 0 ? ten.slice(0, cham) : ten, duoi = cham > 0 ? ten.slice(cham + 1) : '';
  const sach = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return `${sach(goc).slice(0, 100) || 'tep'}${duoi ? `.${sach(duoi).toLowerCase()}` : ''}`;
}
