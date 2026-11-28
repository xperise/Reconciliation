'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { nguoiTT, coQuyen } from '@/lib/tuan-thu/db';
import { toChucHienTai } from '@/lib/tuan-thu/to-chuc-server';
import { themOrg } from '@/lib/tuan-thu/to-chuc';
import { chuanHoaMa, kiemTraCauHinh, type QuyTrinhCauHinh, type KetQuaBuoc } from '@/lib/tuan-thu/cau-hinh';
import { writeAudit } from '@/lib/audit';

type KQ = { ok: true; thongBao?: string } | { ok: false; loi: string[] };
export type RoleNhap = { key: string; ten: string; kichHoat: boolean };
export type BuocNhap = { key: string; nhom: number; roleKey: string; che_do: 'any' | 'all' | 'quorum'; ketQua: KetQuaBuoc[]; nguoi?: string | null };
export type CauHinhNhap = { roles: RoleNhap[]; buoc: BuocNhap[] };

const KET_QUA_HOP_LE: KetQuaBuoc[] = ['duyet', 'tra_ve', 'chan'];

/**
 * Lưu cấu hình quy trình của tổ chức (chỉ admin hoặc người được quyền quản trị).
 * Chỉ nhận dạng đúng với máy trạng thái hiện có: tối đa hai mức bước, mỗi bước theo "bất kỳ một người".
 */
export async function luuCauHinh(nhap: CauHinhNhap): Promise<KQ> {
  const n = await nguoiTT();
  if (!n || !coQuyen(n, 'quan_tri')) return { ok: false, loi: ['Chỉ admin hoặc người được cấp quyền quản trị mới sửa được cấu hình.'] };

  const roles = nhap.roles.map((r) => ({ key: chuanHoaMa(r.key || r.ten), ten: r.ten.trim(), thuTu: 0, kichHoat: !!r.kichHoat }));
  const buoc = nhap.buoc.map((b) => ({ key: chuanHoaMa(b.key), thuTu: Number(b.nhom), roleKey: chuanHoaMa(b.roleKey), mode: b.che_do, ketQua: b.ketQua.filter((k) => KET_QUA_HOP_LE.includes(k)), nguoi: b.nguoi || null }));
  // thứ tự role theo thứ tự bước đầu tiên có role đó
  roles.forEach((r, i) => { r.thuTu = i + 1; });
  const cau: QuyTrinhCauHinh = { roles: roles.map((r) => ({ key: r.key, ten: r.ten, thuTu: r.thuTu, kichHoat: r.kichHoat })), buoc, quorumSuaDoi: 'all' };

  const loi = kiemTraCauHinh(cau);
  for (const b of buoc) if (!Number.isInteger(b.thuTu) || b.thuTu < 1) loi.push(`Bước "${b.key}": nhóm phải là số nguyên từ 1 trở lên.`);
  for (const r of roles) if (!buoc.some((b) => b.roleKey === r.key)) loi.push(`Role "${r.ten || r.key}" chưa có bước nào. Mọi role phải có bước, vì sửa đổi quy tắc cần đồng ý của tất cả role.`);
  for (const b of buoc) if (b.ketQua.length === 0) loi.push(`Bước "${b.key}" chưa chọn kết quả nào.`);
  if (loi.length) return { ok: false, loi };

  const toChuc = await toChucHienTai();
  const sb = supabaseAdmin();
  // Người duyệt cụ thể phải là thành viên của đúng role của bước
  const nguoiCanKiem = buoc.filter((b) => b.nguoi).map((b) => b.nguoi as string);
  if (nguoiCanKiem.length) {
    const { data: tvs } = await sb.from('tt_thanh_vien').select('user_id, phong_ban').eq('org_id', toChuc).in('user_id', nguoiCanKiem);
    for (const b of buoc.filter((x) => x.nguoi)) {
      if (!(tvs ?? []).some((t: any) => t.user_id === b.nguoi && t.phong_ban === b.roleKey))
        return { ok: false, loi: [`Bước "${b.key}": người được chọn không thuộc role "${b.roleKey}".`] };
    }
  }
  const { data: cuRole } = await sb.from('tt_role').select('key').eq('org_id', toChuc);
  const { data: cuBuoc } = await sb.from('tt_buoc_quy_trinh').select('key').eq('org_id', toChuc);

  const { error: e1 } = await sb.from('tt_role').upsert(roles.map((r) => themOrg({ key: r.key, ten: r.ten, thu_tu: r.thuTu, kich_hoat: r.kichHoat }, toChuc)), { onConflict: 'org_id,key' });
  if (e1) return { ok: false, loi: [e1.message] };
  const { error: e2 } = await sb.from('tt_buoc_quy_trinh').upsert(buoc.map((b) => themOrg({ key: b.key, thu_tu: b.thuTu, nhom: b.thuTu, role_key: b.roleKey, mode: b.mode, ket_qua: b.ketQua, nguoi: b.nguoi }, toChuc)), { onConflict: 'org_id,key' });
  if (e2) return { ok: false, loi: [e2.message] };

  const boBuoc = (cuBuoc ?? []).map((x: any) => x.key).filter((k: string) => !buoc.some((b) => b.key === k));
  if (boBuoc.length) { const { error } = await sb.from('tt_buoc_quy_trinh').delete().eq('org_id', toChuc).in('key', boBuoc); if (error) return { ok: false, loi: [error.message] }; }
  const boRole = (cuRole ?? []).map((x: any) => x.key).filter((k: string) => !roles.some((r) => r.key === k));
  if (boRole.length) { const { error } = await sb.from('tt_role').delete().eq('org_id', toChuc).in('key', boRole); if (error) return { ok: false, loi: [`Không xoá được role đang được dùng: ${error.message}`] }; }

  await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.luu_cau_hinh', entity: 'tt_role', entityId: toChuc, after: { roles: roles.map((r) => r.key), buoc: buoc.map((b) => b.key) } });
  revalidatePath('/tuan-thu/cau-hinh');
  revalidatePath('/tuan-thu');
  return { ok: true, thongBao: 'Đã lưu cấu hình quy trình.' };
}
