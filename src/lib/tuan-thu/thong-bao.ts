import { supabaseAdmin } from '@/lib/supabase/admin';
import { pushNotify } from '@/lib/notify';
import { sendMail } from '@/lib/google/gmail';
import { fmtVnd, nhanThang } from './db';
import { PhongBan, TEN_PHONG_BAN } from './types';
import { laBuocCuoiDuyet } from './cau-hinh';
import { docCauHinhQuyTrinh } from './cau-hinh-db';

/**
 * Báo cho head của từng phòng ban (chuông + email nội bộ). Không bao giờ ném lỗi ra ngoài:
 * thông báo hỏng không được làm gãy luồng duyệt.
 */
export async function baoChoPhongBan(lanId: string, pbs: PhongBan[], suKien: 'xu_ly' | 'cho_ceo' | 'chan' | 'go_chan', ghiChu?: string) {
  const cauHinh = await docCauHinhQuyTrinh();
  try {
    const sb = supabaseAdmin();
    const { data: lc } = await sb.from('tt_lan_chay').select('thang, dot, tong_hop, org_id, tt_hop_dong(ma_khach)').eq('id', lanId).single();
    if (!lc) return;
    const ky = `${(lc as any).tt_hop_dong?.ma_khach} ${nhanThang(lc.thang, lc.dot)}`;
    const link = `/tuan-thu/chay/${lanId}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const { data: cb } = await sb.from('tt_canh_bao').select('phong_ban, muc_do, noi_dung, so_tien').eq('lan_chay_id', lanId);
    const { data: tv } = await sb.from('tt_thanh_vien').select('user_id, phong_ban, profiles(email)').eq('org_id', lc.org_id).in('phong_ban', pbs);
    for (const t of (tv ?? []) as any[]) {
      const pb = t.phong_ban as PhongBan;
      const cua = (cb ?? []).filter((c: any) => c.phong_ban === pb && c.muc_do !== 'theo_doi');
      const chan = cua.filter((c: any) => c.muc_do === 'chan_gui').length;
      const tieuDe = suKien === 'xu_ly' ? `Bảng kê ${ky}: ${cua.length} cảnh báo thuộc ${TEN_PHONG_BAN[pb]}${chan ? ` (${chan} chặn gửi)` : ''}`
        : suKien === 'cho_ceo' ? (laBuocCuoiDuyet(cauHinh, pb) ? `Bảng kê ${ky} chờ CEO duyệt` : `Bảng kê ${ky} đã chuyển CEO — chặn ngay nếu cần`)
        : suKien === 'chan' ? `Bảng kê ${ky} đang bị chặn` : `Bảng kê ${ky} đã gỡ chặn`;
      const noiDung = suKien === 'xu_ly'
        ? cua.slice(0, 5).map((c: any) => `• ${c.noi_dung}${c.so_tien != null ? ` (${fmtVnd(c.so_tien)}đ)` : ''}`).join('\n') + (cua.length ? '\nKhông cần duyệt; chỉ chặn hoặc trả về nếu cần kiểm soát.' : '')
        : ghiChu ?? '';
      await pushNotify({ tieuDe, noiDung, muc: suKien === 'chan' || chan ? 'canh_bao' : 'info', lienKet: link, userId: t.user_id, entity: 'tt_lan_chay', entityId: lanId });
      const email = t.profiles?.email;
      if (email && (suKien !== 'xu_ly' || cua.length)) {
        await sendMail({ to: email, subject: `[Tuân thủ bảng kê] ${tieuDe}`,
          html: `<p>${tieuDe}</p>${noiDung ? `<pre style="font-family:Arial;white-space:pre-wrap">${noiDung.replace(/</g, '&lt;')}</pre>` : ''}<p><a href="${appUrl}${link}">Mở lần chạy</a></p>` }).catch(() => {});
      }
    }
    // CEO (chức vụ) và người được cấp quyền xem báo cáo: nhận việc cần quyết
    const coChanGui = (cb ?? []).some((c: any) => c.muc_do === 'chan_gui');
    const canBaoCeo = suKien === 'cho_ceo' || suKien === 'chan' || suKien === 'go_chan' || (suKien === 'xu_ly' && coChanGui);
    if (canBaoCeo) {
      const daBao = new Set((tv ?? []).map((t: any) => t.user_id));
      const [{ data: ceo }, { data: qs }] = await Promise.all([
        sb.from('tt_thanh_vien').select('user_id, profiles(email)').eq('org_id', lc.org_id).eq('phong_ban', 'ceo'),
        sb.from('tt_quyen').select('user_id').eq('org_id', lc.org_id).in('quyen', ['xem_bao_cao', 'quan_tri']),
      ]);
      const tieuDeCeo = suKien === 'xu_ly' ? `Bảng kê ${ky} có cảnh báo chặn gửi`
        : suKien === 'cho_ceo' ? `Bảng kê ${ky} chờ CEO duyệt`
        : suKien === 'chan' ? `Bảng kê ${ky} đang bị chặn` : `Bảng kê ${ky} đã gỡ chặn`;
      for (const r of [...(ceo ?? []), ...(qs ?? [])] as any[]) {
        if (daBao.has(r.user_id)) continue;
        daBao.add(r.user_id);
        await pushNotify({ tieuDe: tieuDeCeo, noiDung: ghiChu ?? '', muc: suKien === 'xu_ly' ? 'canh_bao' : (suKien === 'chan' ? 'canh_bao' : 'info'), lienKet: link, userId: r.user_id, entity: 'tt_lan_chay', entityId: lanId });
      }
      // Email cho CEO (chức vụ) khi có việc cần quyết; các trường hợp khác chỉ có chuông trong app
      if (suKien === 'cho_ceo' || suKien === 'chan' || suKien === 'go_chan') {
        const daGuiEmail = new Set((tv ?? []).filter((t: any) => t.profiles?.email).map((t: any) => t.user_id));
        for (const r of (ceo ?? []) as any[]) {
          const email = r.profiles?.email;
          if (!email || daGuiEmail.has(r.user_id)) continue;
          await sendMail({ to: email, subject: `[Tuân thủ bảng kê] ${tieuDeCeo}`,
            html: `<p>${tieuDeCeo}</p><p><a href="${appUrl}${link}">Mở lần chạy</a></p>` }).catch(() => {});
        }
      }
    }
  } catch (e) { console.error('[tuan-thu thong bao]', e); }
}
