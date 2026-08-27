import { supabaseAdmin } from '@/lib/supabase/admin';
import { readThread, ourAddress, threadExists, sendMail } from '@/lib/google/gmail';
import { classifyReply } from '@/lib/ai';
import { tplKhachYeuCauSua, tplThreadMat } from '@/lib/email-templates';
import { RunResult, TrackingStatus } from '@/lib/types';
import { MailLog } from '@/lib/mail-log';

/** Trạng thái mà khách còn có thể phản hồi thêm. */
const DANG_CHO_KHACH: TrackingStatus[] = [
  'da_gui_bang_ke',
  'da_nhan_phan_hoi',
  'can_chinh_sua',
  'da_gui_ho_so_thanh_toan',
];

/**
 * WF2 — Nhận phản hồi khách hàng
 *
 * Chạy mỗi phút. Với mỗi kỳ đang chờ khách trả lời, đọc thread Gmail và
 * tìm tin nhắn mới nhất KHÔNG do hệ thống gửi. Nếu tin đó chưa được xử lý
 * (message_id khác với cái đã lưu), đưa qua AI phân loại rồi chuyển sang
 * trạng thái chờ kế toán duyệt trên dashboard.
 *
 * Hai điểm khác WF2 cũ:
 *   • Nút duyệt không nằm trong email nữa — kế toán quyết định trên web,
 *     nên mỗi lượt phản hồi luôn được ghi nhận, không phụ thuộc email.
 *   • Khách reply thêm khi đang ở "Cần chỉnh sửa" sẽ được nối vào ghi chú
 *     và đẩy lại hàng chờ duyệt, thay vì im lặng như trước.
 */
export async function runWf2(): Promise<RunResult> {
  const sb = supabaseAdmin();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const detail: unknown[] = [];
  const mails = new MailLog();
  let ok = 0;
  let failed = 0;

  const { data: rows, error } = await sb
    .from('tracking')
    .select('*, billing_groups!inner(ten_nhom, email_ke_toan, email_pm)')
    .in('status', DANG_CHO_KHACH)
    .not('thread_id', 'is', null);

  if (error) throw new Error(`Không đọc được tracking: ${error.message}`);
  if (!rows?.length) {
    return { ok: 0, failed: 0, summary: 'Không có kỳ nào đang chờ khách phản hồi.', detail: [] };
  }

  const me = await ourAddress();

  for (const row of rows as any[]) {
    const g = row.billing_groups;
    const note = (msg: string, extra: Record<string, unknown> = {}) =>
      detail.push({ nhom: row.ma_he_thong, ky: row.ky_doi_soat, msg, ...extra });

    try {
      if (!(await threadExists(row.thread_id))) {
        const mail = tplThreadMat(row.ten_nhom, row.ky_doi_soat, row.thread_id, appUrl);
        if (g.email_ke_toan) {
          await sendMail({ to: g.email_ke_toan, cc: g.email_pm ?? undefined, ...mail });
          mails.ghi({ nhom: row.ten_nhom, ky: row.ky_doi_soat, loai: 'Cảnh báo mất thread',
            den: g.email_ke_toan, cc: g.email_pm ?? undefined, tieu_de: mail.subject });
        }
        await sb.from('tracking').update({
          status: 'can_xu_ly_tay',
          ghi_chu: `WF2: thread ${row.thread_id} không còn trên Gmail.`,
        }).eq('id', row.id);
        failed += 1;
        note('Thread biến mất, đã cảnh báo và chuyển xử lý tay.');
        continue;
      }

      const messages = await readThread(row.thread_id, me);
      const fromCustomer = messages.filter((m) => !m.isFromUs);
      const latest = fromCustomer[fromCustomer.length - 1];

      if (!latest) { note('Khách chưa trả lời.'); continue; }
      if (latest.id === row.message_id) { note('Không có phản hồi mới.'); continue; }

      const cls = await classifyReply(latest.body || latest.snippet);

      // Khách nói thêm khi đang chờ bản sửa: nối vào ghi chú, không reset version
      const boSung = row.status === 'can_chinh_sua';
      const ghiChu = boSung
        ? `${row.ghi_chu ?? ''}\n[Bổ sung ${new Date().toISOString().slice(0, 10)}] ${cls.tom_tat}`.trim()
        : cls.tom_tat;

      await sb.from('tracking').update({
        status: 'cho_duyet_phan_loai' as TrackingStatus,
        message_id: latest.id,
        ai_de_xuat: cls.action,
        ai_pham_vi: cls.pham_vi,
        ai_do_tin_cay: cls.do_tin_cay,
        email_khach_goc: (latest.body || latest.snippet).slice(0, 5000),
        ghi_chu: ghiChu,
        ket_qua_duyet: null,
        nguoi_duyet: null,
      }).eq('id', row.id);

      // Báo kế toán có việc cần duyệt. Thread nội bộ tách khỏi thread khách.
      if (g.email_ke_toan) {
        const mail = tplKhachYeuCauSua(row.ten_nhom, row.ky_doi_soat, cls.tom_tat, cls.pham_vi, appUrl);
        const sent = await sendMail({
          to: g.email_ke_toan,
          cc: g.email_pm ?? undefined,
          ...mail,
          threadId: row.internal_thread_id ?? undefined,
        });
        if (!row.internal_thread_id) {
          await sb.from('tracking').update({ internal_thread_id: sent.threadId }).eq('id', row.id);
        }
        mails.ghi({ nhom: row.ten_nhom, ky: row.ky_doi_soat, loai: 'Báo kế toán duyệt',
          den: g.email_ke_toan, cc: g.email_pm ?? undefined, tieu_de: mail.subject });
      }

      ok += 1;
      note('Đã phân loại và chuyển kế toán duyệt.', {
        action: cls.action, do_tin_cay: cls.do_tin_cay, nguon: cls.nguon,
      });
    } catch (err) {
      failed += 1;
      note('Lỗi khi xử lý.', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    ok,
    failed,
    summary: ok
      ? `Nhận ${ok} phản hồi mới của khách. ${mails.tomTat()}`
      : 'Không có phản hồi mới.',
    detail,
    mails: mails.all,
  };
}
