import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { PhongBan, ThamSoHopDong } from './types';

export const BUCKET_TT = 'bang-ke';
export type BuocDuyet = 'ke_toan' | 'demand' | 'supply' | 'ceo';
export const BUOC_DUYET: BuocDuyet[] = ['ke_toan', 'demand', 'supply', 'ceo'];
export const TEN_BUOC: Record<string, string> = {
  cho_ke_toan: 'Chờ kế toán', cho_scope: 'Chờ Demand & Supply', cho_ceo: 'Chờ CEO duyệt', da_gui: 'Đã gửi khách', huy: 'Đã hủy',
};

export type NguoiTT = {
  id: string; email: string; full_name: string;
  laAdmin: boolean;
  phong_ban: PhongBan | null;
};

/** Người dùng hiện tại trong phần Tuân thủ. Null = không có quyền vào. */
export async function nguoiTT(): Promise<NguoiTT | null> {
  const u = await currentUser();
  if (!u) return null;
  const laAdmin = u.role === 'admin';
  const { data } = await supabaseAdmin().from('tt_thanh_vien').select('phong_ban').eq('user_id', u.id).maybeSingle();
  const phong_ban = (data?.phong_ban ?? null) as PhongBan | null;
  if (!laAdmin && !phong_ban) return null;
  return { id: u.id, email: u.email, full_name: u.full_name, laAdmin, phong_ban };
}

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
