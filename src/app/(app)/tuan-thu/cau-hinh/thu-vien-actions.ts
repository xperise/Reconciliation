'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { batBuoc, coQuyen } from '@/lib/tuan-thu/db';
import { toChucHienTai } from '@/lib/tuan-thu/to-chuc-server';
import { docCauHinhQuyTrinh } from '@/lib/tuan-thu/cau-hinh-db';
import { writeAudit } from '@/lib/audit';
import { luuCauHinh, type CauHinhNhap } from './cau-hinh-actions';

type KQ = { ok: true; thongBao?: string } | { ok: false; loi: string[] };

/** Dùng một mẫu (hệ thống hoặc hub): ghi cấu trúc mẫu thành cấu hình của tổ chức. Admin hoặc quản trị. */
export async function dungMau(maId: string): Promise<KQ> {
  const n = await batBuoc();
  if (!n.laAdmin && !coQuyen(n, 'quan_tri')) return { ok: false, loi: ['Chỉ admin hoặc người được cấp quyền quản trị mới dùng mẫu.'] };
  const { data: mau, error } = await supabaseAdmin().from('tt_hub_mau').select('ma, ten, cau_truc').eq('id', maId).maybeSingle();
  if (error || !mau) return { ok: false, loi: ['Không tìm thấy mẫu.'] };
  const ct = mau.cau_truc as any;
  const nhap: CauHinhNhap = {
    roles: (ct.roles ?? []).map((r: any) => ({ key: r.key, ten: r.ten, kichHoat: !!r.kichHoat })),
    buoc: (ct.buoc ?? []).map((b: any) => ({
      key: b.key, nhom: Number(b.nhom), roleKey: b.roleKey, che_do: b.che_do ?? 'any', ketQua: b.ketQua ?? ['duyet'],
      nguoi: null, suaDoi: b.suaDoi !== false, yeuCauDuyet: b.yeuCauDuyet !== false, chayKhi: b.chayKhi ?? 'luon',
    })),
  };
  const kq = await luuCauHinh(nhap);
  if (kq.ok) {
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.dung_mau', entity: 'tt_hub_mau', entityId: maId, after: { ma: mau.ma } });
    revalidatePath('/tuan-thu/cau-hinh');
    return { ok: true, thongBao: `Đã dùng mẫu "${mau.ten}". Có thể sửa tiếp từng phần.` };
  }
  return kq;
}

/** Công bố cấu hình hiện tại lên hub. Chỉ lấy cấu trúc (không có người, không có số liệu), quét trước khi lưu. */
export async function congBoLenHub(ten: string, moTa: string): Promise<KQ> {
  const n = await batBuoc();
  if (!n.laAdmin && n.phong_ban !== 'ceo' && !coQuyen(n, 'quan_tri')) return { ok: false, loi: ['Chỉ admin hoặc CEO công bố mẫu.'] };
  const tenSach = ten.trim();
  if (!tenSach) return { ok: false, loi: ['Đặt tên cho mẫu.'] };
  const cau = await docCauHinhQuyTrinh(await toChucHienTai());
  const cauTruc = {
    roles: cau.roles.map((r) => ({ key: r.key, ten: r.ten, kichHoat: r.kichHoat })),
    buoc: cau.buoc.map((b) => ({ key: b.key, nhom: b.nhom ?? b.thuTu, roleKey: b.roleKey, che_do: b.mode, ketQua: b.ketQua, yeuCauDuyet: b.yeuCauDuyet !== false, chayKhi: b.chayKhi ?? 'luon', suaDoi: b.suaDoi !== false })),
  };
  // Quét ranh giới dữ liệu: không được có email, mã UUID (người, tổ chức, hợp đồng) hay số tiền cụ thể
  const chuoi = JSON.stringify(cauTruc);
  if (/@|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(chuoi)) return { ok: false, loi: ['Cấu trúc có dữ liệu riêng của tổ chức, không công bố được.'] };
  const ma = `hub_${Date.now().toString(36)}`;
  const { error } = await supabaseAdmin().from('tt_hub_mau').insert({ ma, ten: tenSach, mo_ta: moTa.trim(), cap: 'tu_mo_ta', nguon: 'hub', kiem_dinh: false, cau_truc: cauTruc });
  if (error) return { ok: false, loi: [error.message] };
  await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.cong_bo_hub', entity: 'tt_hub_mau', entityId: ma, after: { ten: tenSach } });
  revalidatePath('/tuan-thu/cau-hinh');
  return { ok: true, thongBao: 'Đã công bố lên hub (chưa kiểm định).' };
}
