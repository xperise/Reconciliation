import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentPeriod, isDueToday, nowInVN, addDays } from '@/lib/period';
import { latestUnsent, downloadFile, signedUrl, mimeFor } from '@/lib/storage';
import { sendMail } from '@/lib/google/gmail';
import { refSubject, tplBangKe, tplThieuEmailL1, tplThieuFile } from '@/lib/email-templates';
import { MailLog } from '@/lib/mail-log';
import {
  BillingGroup, RunResult, STATUS_WF1_SKIP, TrackingStatus,
  effectiveDueDay, effectiveSlaChapNhan,
} from '@/lib/types';

/**
 * WF1 — Gửi bảng kê
 *
 * Chạy mỗi sáng. Với mỗi nhóm đối soát đến hạn gửi trong hôm nay:
 *   1. Bỏ qua nếu kỳ này đã gửi rồi (tránh gửi trùng khi chạy lại).
 *   2. Thiếu email đầu mối  → cảnh báo nội bộ, dừng nhóm đó.
 *   3. Chưa có tệp nào được tải lên → email khẩn cho kế toán, đánh dấu chờ tệp.
 *   4. Có tệp → gửi cho khách, ghi thread_id và hạn chấp nhận vào tracking.
 *
 * Tệp lấy từ bảng statement_files, tức là thứ kế toán đã tải lên website và
 * gắn sẵn nhóm với kỳ. Không còn khâu dò tên file như bản chạy trên Drive.
 */
export async function runWf1(): Promise<RunResult> {
  const sb = supabaseAdmin();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const ky = currentPeriod();
  const today = nowInVN().isoDate;

  const detail: unknown[] = [];
  const mails = new MailLog();
  let ok = 0;
  let failed = 0;

  const { data: groups, error } = await sb
    .from('billing_groups').select('*').eq('ngung_hop_tac', false);
  if (error) throw new Error(`Không đọc được nhóm đối soát: ${error.message}`);

  const dueToday = (groups as BillingGroup[]).filter((g) => {
    const day = effectiveDueDay(g);
    return day != null && isDueToday(day);
  });

  if (dueToday.length === 0) {
    return { ok: 0, failed: 0, summary: `Hôm nay không có nhóm nào đến hạn gửi bảng kê kỳ ${ky}.`, detail: [] };
  }

  for (const g of dueToday) {
    const note = (msg: string, extra: Record<string, unknown> = {}) =>
      detail.push({ nhom: g.ma_he_thong, ky, msg, ...extra });

    try {
      // --- 1. Kỳ này đã xử lý chưa -------------------------------------
      const { data: existing } = await sb
        .from('tracking').select('id, status')
        .eq('group_id', g.id).eq('ky_doi_soat', ky).maybeSingle();

      if (existing && STATUS_WF1_SKIP.includes(existing.status as TrackingStatus)) {
        note('Bỏ qua — kỳ này đã được xử lý.', { status: existing.status });
        continue;
      }

      const baseRow = {
        group_id: g.id,
        ma_he_thong: g.ma_he_thong,
        ten_nhom: g.ten_nhom,
        ky_doi_soat: ky,
      };

      // --- 2. Thiếu email đầu mối --------------------------------------
      if (!g.email_l1?.includes('@')) {
        const mail = tplThieuEmailL1(g.ten_nhom, ky, appUrl);
        if (g.email_ke_toan) {
          await sendMail({ to: g.email_ke_toan, cc: g.email_pm ?? undefined, ...mail });
          mails.ghi({ nhom: g.ten_nhom, ky, loai: 'Cảnh báo thiếu email',
            den: g.email_ke_toan, cc: g.email_pm ?? undefined, tieu_de: mail.subject });
        }
        await sb.from('tracking').upsert(
          { ...baseRow, status: 'can_xu_ly_tay' as TrackingStatus,
            ghi_chu: 'WF1: thiếu email đầu mối khách hàng trong Master Data.' },
          { onConflict: 'group_id,ky_doi_soat' },
        );
        failed += 1;
        note('Thiếu email đầu mối, đã cảnh báo nội bộ.');
        continue;
      }

      // --- 3. Tìm tệp kế toán đã tải lên --------------------------------
      const file = await latestUnsent(g.id, ky, 'bang_ke');

      if (!file) {
        const reason = 'Chưa có ai tải bảng kê của kỳ này lên hệ thống.';
        const mail = tplThieuFile(g.ten_nhom, ky, appUrl);
        if (g.email_ke_toan) {
          await sendMail({ to: g.email_ke_toan, cc: g.email_pm ?? undefined, ...mail });
          mails.ghi({ nhom: g.ten_nhom, ky, loai: 'Nhắc nội bộ thiếu tệp',
            den: g.email_ke_toan, cc: g.email_pm ?? undefined, tieu_de: mail.subject });
        }
        await sb.from('tracking').upsert(
          { ...baseRow,
            status: 'cho_file_da_nhac_noi_bo' as TrackingStatus,
            ngay_bat_dau_cho_file: today,
            ghi_chu: `WF1: ${reason}` },
          { onConflict: 'group_id,ky_doi_soat' },
        );
        failed += 1;
        note('Chưa có tệp, đã nhắc nội bộ.', { reason });
        continue;
      }

      // --- 4. Gửi cho khách --------------------------------------------
      const buffer = await downloadFile(file.storage_path);
      const link = await signedUrl(file.storage_path);

      const ccList = [g.email_ke_toan, g.email_cc].filter(Boolean).join(',') || undefined;
      const subject = refSubject(g.ten_nhom, ky);
      const sent = await sendMail({
        to: g.email_l1,
        cc: ccList,
        subject,
        html: tplBangKe(g.ten_nhom, ky, link),
        attachments: [{
          filename: file.file_name,
          mimeType: file.mime_type ?? mimeFor(file.file_name),
          data: buffer,
        }],
      });

      await sb.from('statement_files')
        .update({ sent_at: new Date().toISOString() }).eq('id', file.id);

      await sb.from('tracking').upsert(
        { ...baseRow,
          status: 'da_gui_bang_ke' as TrackingStatus,
          ngay_gui_gan_nhat: today,
          link_file_bang_ke: link,
          ten_file_da_gui: file.file_name,
          thread_id: sent.threadId,
          message_id: sent.id,
          han_chap_nhan: addDays(today, effectiveSlaChapNhan(g)),
          escalate_level: 0,
          so_vong_remind: 0,
          version_bang_ke: file.version,
          ngay_bat_dau_cho_file: null,
          ghi_chu: null },
        { onConflict: 'group_id,ky_doi_soat' },
      );

      mails.ghi({ nhom: g.ten_nhom, ky, loai: 'Bảng kê',
        den: g.email_l1, cc: ccList, tieu_de: subject });

      ok += 1;
      note('Đã gửi bảng kê.', { file: file.file_name, threadId: sent.threadId });
    } catch (err) {
      failed += 1;
      note('Lỗi khi xử lý.', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    ok,
    failed,
    summary: `Kỳ ${ky}: gửi thành công ${ok}/${dueToday.length} nhóm`
      + (failed ? `, ${failed} nhóm cần xử lý` : '')
      + (mails.count ? `. Thư đã gửi: ${mails.tomTat()}` : '.'),
    detail,
    mails: mails.all,
  };
}
