'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { sendMail } from '@/lib/google/gmail';
import { nguoiTT, QuyenTT } from '@/lib/tuan-thu/db';
import { toChucHienTai } from '@/lib/tuan-thu/to-chuc-server';
import { themOrg } from '@/lib/tuan-thu/to-chuc';
import { docCauHinhQuyTrinh } from '@/lib/tuan-thu/cau-hinh-db';
import { bamMa, hetHan, taoMaMoi } from '@/lib/tuan-thu/loi-moi';
import { writeAudit } from '@/lib/audit';

type KQ = { ok: true; thongBao?: string } | { ok: false; loi: string };
const QUYEN_HOP_LE: QuyenTT[] = ['quan_tri', 'kich_hoat', 'xem_bao_cao'];

/** Admin mời một người qua email: gửi đường dẫn nhận lời mời, hết hạn sau 7 ngày. */
export async function moiThanhVien(email: string, phongBan: string, quyen: QuyenTT[]): Promise<KQ> {
  try {
    const n = await nguoiTT();
    if (!n || !n.laAdmin) throw new Error('Chỉ admin mời thành viên.');
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Email không hợp lệ.');
    const cau = await docCauHinhQuyTrinh();
    if (!cau.roles.some((r) => r.key === phongBan)) throw new Error('Role không có trong cấu hình.');
    const quyenHopLe = quyen.filter((q) => QUYEN_HOP_LE.includes(q));
    const toChuc = await toChucHienTai();
    const sb = supabaseAdmin();
    // Lời mời cũ còn hiệu lực cho cùng email thì thu hồi trước
    await sb.from('tt_loi_moi').update({ trang_thai: 'thu_hoi' })
      .eq('org_id', toChuc).eq('email', e).eq('trang_thai', 'dang_cho');
    const { ma, bam } = taoMaMoi();
    const { error } = await sb.from('tt_loi_moi').insert(themOrg({
      email: e, phong_ban: phongBan, quyen: quyenHopLe, ma_bam: bam, het_han: hetHan(), moi_boi: n.id,
    }, toChuc));
    if (error) throw new Error(error.message);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const link = `${appUrl}/tuan-thu/moi?ma=${ma}`;
    const role = cau.roles.find((r) => r.key === phongBan)?.ten ?? phongBan;
    await sendMail({
      to: e,
      subject: '[Tuân thủ bảng kê] Lời mời tham gia',
      html: `<p>${n.full_name || n.email} mời bạn tham gia Tuân thủ bảng kê với vai trò <b>${role}</b>.</p>` +
        `<p><a href="${link}">Nhận lời mời</a> (hết hạn sau 7 ngày). Bạn cần đăng nhập bằng đúng email này.</p>`,
    }).catch(() => {});
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.moi_thanh_vien', entity: 'tt_loi_moi', entityId: e, after: { phongBan, quyen: quyenHopLe } });
    revalidatePath('/tuan-thu/thanh-vien');
    return { ok: true, thongBao: `Đã gửi lời mời tới ${e}.` };
  } catch (err) {
    return { ok: false, loi: err instanceof Error ? err.message : String(err) };
  }
}

export async function thuHoiLoiMoi(id: string): Promise<KQ> {
  try {
    const n = await nguoiTT();
    if (!n || !n.laAdmin) throw new Error('Chỉ admin thu hồi lời mời.');
    const toChuc = await toChucHienTai();
    const { error } = await supabaseAdmin().from('tt_loi_moi').update({ trang_thai: 'thu_hoi' })
      .eq('id', id).eq('org_id', toChuc).eq('trang_thai', 'dang_cho');
    if (error) throw new Error(error.message);
    revalidatePath('/tuan-thu/thanh-vien');
    return { ok: true, thongBao: 'Đã thu hồi lời mời.' };
  } catch (err) {
    return { ok: false, loi: err instanceof Error ? err.message : String(err) };
  }
}

/** Người được mời nhận lời mời khi đã đăng nhập đúng email. */
export async function chapNhanLoiMoi(ma: string): Promise<KQ> {
  try {
    const u = await currentUser();
    if (!u) throw new Error('Hãy đăng nhập bằng email được mời.');
    const sb = supabaseAdmin();
    const { data: li } = await sb.from('tt_loi_moi').select('*').eq('ma_bam', bamMa(ma)).maybeSingle();
    if (!li) throw new Error('Lời mời không tồn tại.');
    if (li.trang_thai !== 'dang_cho') throw new Error('Lời mời này không còn hiệu lực.');
    if (new Date(li.het_han).getTime() < Date.now()) {
      await sb.from('tt_loi_moi').update({ trang_thai: 'het_han' }).eq('id', li.id);
      throw new Error('Lời mời đã hết hạn.');
    }
    if ((u.email ?? '').toLowerCase() !== String(li.email).toLowerCase()) throw new Error('Lời mời này gửi cho email khác.');
    const { data: cu } = await sb.from('tt_nguoi_to_chuc').select('org_id').eq('user_id', u.id);
    if ((cu ?? []).some((x: any) => x.org_id !== li.org_id)) throw new Error('Tài khoản này đã thuộc tổ chức khác.');
    const orgId = li.org_id as string;
    await sb.from('tt_nguoi_to_chuc').upsert({ user_id: u.id, org_id: orgId }, { ignoreDuplicates: true });
    const { error: eTv } = await sb.from('tt_thanh_vien').upsert({ user_id: u.id, phong_ban: li.phong_ban, org_id: orgId });
    if (eTv) throw new Error(eTv.message);
    for (const q of (li.quyen ?? []) as QuyenTT[]) {
      await sb.from('tt_quyen').upsert({ user_id: u.id, org_id: orgId, quyen: q, cap_boi: li.moi_boi }, { ignoreDuplicates: true });
    }
    await sb.from('tt_loi_moi').update({ trang_thai: 'da_nhan' }).eq('id', li.id);
    await writeAudit({ actorId: u.id, actorEmail: u.email, action: 'tuan_thu.nhan_loi_moi', entity: 'tt_loi_moi', entityId: li.id, after: { phong_ban: li.phong_ban } });
    revalidatePath('/tuan-thu');
    return { ok: true, thongBao: 'Đã tham gia tổ chức.' };
  } catch (err) {
    return { ok: false, loi: err instanceof Error ? err.message : String(err) };
  }
}
