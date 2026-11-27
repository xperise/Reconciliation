'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { batBuoc, nguoiTT } from '@/lib/tuan-thu/db';
import { toChucHienTai } from '@/lib/tuan-thu/to-chuc-server';
import { writeAudit } from '@/lib/audit';

type KQ = { ok: true; thongBao?: string } | { ok: false; loi: string };

export type BuocLamLai = 'mau' | 'chot' | 'chay';

/**
 * Cho phép làm lại một bước đã xong của Hướng dẫn A→Z. Không xoá lịch sử đã gửi.
 *  • mau  : đưa mẫu bảng kê đang hiệu lực về "thay thế" (admin). Mẫu cũ vẫn còn trong lịch sử.
 *  • chot : đưa hợp đồng về "chờ chốt" và mọi quy tắc về "chờ" (admin). Chỉ khi chưa có lần chạy nào.
 *  • chay : xoá các lần chạy của hợp đồng chưa gửi khách (kế toán hoặc admin). Lần đã gửi giữ nguyên.
 */
export async function lamLaiBuoc(buoc: BuocLamLai, hopDongId: string): Promise<KQ> {
  try {
    const org = await toChucHienTai();
    const sb = supabaseAdmin();
    const { data: hd } = await sb.from('tt_hop_dong').select('id, ma_khach, trang_thai').eq('org_id', org).eq('id', hopDongId).single();
    if (!hd) throw new Error('Không tìm thấy hợp đồng.');

    if (buoc === 'mau') {
      const n = await nguoiTT();
      if (!n?.laAdmin) throw new Error('Chỉ admin làm lại mẫu bảng kê.');
      const { error } = await sb.from('tt_mau_bang_ke').update({ trang_thai: 'thay_the' })
        .eq('org_id', org).eq('ma_khach', hd.ma_khach).eq('trang_thai', 'hieu_luc');
      if (error) throw new Error(error.message);
      await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.lam_lai_mau', entity: 'tt_hop_dong', entityId: hd.id, after: { ma_khach: hd.ma_khach } });
    }

    if (buoc === 'chot') {
      const n = await nguoiTT();
      if (!n?.laAdmin) throw new Error('Chỉ admin làm lại bước chốt và kích hoạt.');
      const { count } = await sb.from('tt_lan_chay').select('id', { count: 'exact', head: true }).eq('org_id', org).eq('hop_dong_id', hd.id);
      if (count) throw new Error(`Hợp đồng đã có ${count} lần chạy; xoá các lần chạy chưa gửi trước khi làm lại bước này.`);
      const { error: e1 } = await sb.from('tt_quy_tac').update({ chot: 'cho' }).eq('org_id', org).eq('hop_dong_id', hd.id);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await sb.from('tt_hop_dong').update({ trang_thai: 'cho_chot' }).eq('org_id', org).eq('id', hd.id);
      if (e2) throw new Error(e2.message);
      await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.lam_lai_chot', entity: 'tt_hop_dong', entityId: hd.id, after: { trang_thai: 'cho_chot' } });
    }

    if (buoc === 'chay') {
      const n = await batBuoc('ke_toan');
      const { data: runs } = await sb.from('tt_lan_chay').select('id, buoc').eq('org_id', org).eq('hop_dong_id', hd.id);
      const chuaGui = (runs ?? []).filter((r: any) => r.buoc !== 'da_gui').map((r: any) => r.id);
      if ((runs ?? []).some((r: any) => r.buoc === 'da_gui')) {
        // Lần đã gửi được giữ nguyên; chỉ xoá các lần còn lại
      }
      if (chuaGui.length) {
        const { error } = await sb.from('tt_lan_chay').delete().eq('org_id', org).in('id', chuaGui);
        if (error) throw new Error(error.message);
      }
      await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.lam_lai_chay', entity: 'tt_hop_dong', entityId: hd.id, after: { xoa: chuaGui.length } });
    }

    revalidatePath('/tuan-thu/huong-dan');
    revalidatePath('/tuan-thu');
    revalidatePath('/tuan-thu/quy-tac');
    return { ok: true, thongBao: 'Đã đưa bước về trạng thái chưa làm. Bạn có thể làm lại.' };
  } catch (err) {
    return { ok: false, loi: err instanceof Error ? err.message : String(err) };
  }
}
