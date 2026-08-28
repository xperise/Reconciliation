import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  periodForSchedule, periodFull, isDueToday, nowInVN, addDays,
} from '@/lib/period';
import { latestUnsentBatch, downloadFile, signedUrl, mimeFor } from '@/lib/storage';
import { sendMail, Attachment } from '@/lib/google/gmail';
import { refSubject, tplBangKe, tplThieuEmailL1, tplThieuFile } from '@/lib/email-templates';
import { MailLog } from '@/lib/mail-log';
import {
  BillingGroup, BillingSchedule, RunResult, STATUS_WF1_SKIP, TrackingStatus,
  effectiveSlaChapNhan,
} from '@/lib/types';

/**
 * WF1 — Gửi bảng kê
 *
 * Chạy mỗi sáng, duyệt theo **lịch gửi** chứ không theo nhóm khách. Một nhóm
 * có thể có nhiều đợt trong tháng, mỗi đợt là một lịch riêng với ngày gửi và
 * kỳ dữ liệu riêng.
 *
 * Với mỗi lịch tới hạn hôm nay:
 *   1. Bỏ qua nếu kỳ và đợt đó đã gửi rồi.
 *   2. Thiếu email đầu mối  → cảnh báo nội bộ, dừng lịch đó.
 *   3. Chưa có tệp nào      → email khẩn cho kế toán, đánh dấu chờ tệp.
 *   4. Có tệp → gửi cả lô trong một email, ghi thread và hạn chấp nhận.
 */
export async function runWf1(): Promise<RunResult> {
  const sb = supabaseAdmin();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const today = nowInVN().isoDate;

  const detail: unknown[] = [];
  const mails = new MailLog();
  let ok = 0;
  let failed = 0;

  const { data: lichs, error } = await sb
    .from('billing_schedules')
    .select('*, billing_groups!inner(*)')
    .eq('enabled', true);

  if (error) throw new Error(`Không đọc được lịch gửi: ${error.message}`);

  const toiHan = (lichs ?? []).filter((l: any) =>
    !l.billing_groups.ngung_hop_tac && isDueToday(l.ngay_gui));

  if (toiHan.length === 0) {
    return {
      ok: 0, failed: 0,
      summary: 'Hôm nay không có lịch gửi bảng kê nào tới hạn.',
      detail: [],
    };
  }

  for (const lich of toiHan as any[]) {
    const l = lich as BillingSchedule;
    const g = lich.billing_groups as BillingGroup;
    const ky = periodForSchedule(l.ky_thuoc_thang);
    const nhanKy = periodFull(ky, l.pham_vi_nhan, l.dot);

    const note = (msg: string, extra: Record<string, unknown> = {}) =>
      detail.push({ nhom: g.ma_he_thong, ky: nhanKy, msg, ...extra });

    try {
      // --- 1. Kỳ và đợt này đã xử lý chưa ------------------------------
      const { data: existing } = await sb
        .from('tracking').select('id, status, ngay_remind_cuoi')
        .eq('group_id', g.id).eq('ky_doi_soat', ky).eq('dot', l.dot).maybeSingle();

      if (existing && STATUS_WF1_SKIP.includes(existing.status as TrackingStatus)) {
        note('Bỏ qua — kỳ này đã được xử lý.', { status: existing.status });
        continue;
      }

      const baseRow = {
        group_id: g.id,
        ma_he_thong: g.ma_he_thong,
        ten_nhom: g.ten_nhom,
        ky_doi_soat: ky,
        dot: l.dot,
        pham_vi_nhan: l.pham_vi_nhan,
      };

      // --- 2. Thiếu email đầu mối --------------------------------------
      if (!g.email_l1?.includes('@')) {
        const mail = tplThieuEmailL1(g.ten_nhom, nhanKy, appUrl);
        if (g.email_ke_toan) {
          await sendMail({ to: g.email_ke_toan, cc: g.email_pm ?? undefined, ...mail });
          mails.ghi({ nhom: g.ten_nhom, ky: nhanKy, loai: 'Cảnh báo thiếu email',
            den: g.email_ke_toan, cc: g.email_pm ?? undefined, tieu_de: mail.subject });
        }
        await sb.from('tracking').upsert(
          { ...baseRow, status: 'can_xu_ly_tay' as TrackingStatus,
            ghi_chu: 'WF1: thiếu email đầu mối khách hàng trong Master Data.' },
          { onConflict: 'group_id,ky_doi_soat,dot' },
        );
        failed += 1;
        note('Thiếu email đầu mối, đã cảnh báo nội bộ.');
        continue;
      }

      // --- 3. Tìm lô tệp kế toán đã tải lên ----------------------------
      const lo = await latestUnsentBatch(g.id, ky, 'bang_ke', l.dot);

      if (lo.length === 0) {
        const reason = 'Chưa có ai tải bảng kê của kỳ này lên hệ thống.';

        if (existing?.status === 'cho_file_da_nhac_noi_bo'
            && (existing as any).ngay_remind_cuoi === today) {
          note('Chưa có tệp, nhưng hôm nay đã nhắc nội bộ rồi.');
          continue;
        }

        const mail = tplThieuFile(g.ten_nhom, nhanKy, appUrl);
        if (g.email_ke_toan) {
          await sendMail({ to: g.email_ke_toan, cc: g.email_pm ?? undefined, ...mail });
          mails.ghi({ nhom: g.ten_nhom, ky: nhanKy, loai: 'Nhắc nội bộ thiếu tệp',
            den: g.email_ke_toan, cc: g.email_pm ?? undefined, tieu_de: mail.subject });
        }
        await sb.from('tracking').upsert(
          { ...baseRow,
            status: 'cho_file_da_nhac_noi_bo' as TrackingStatus,
            ngay_bat_dau_cho_file: today,
            ngay_remind_cuoi: today,
            ghi_chu: `WF1: ${reason}` },
          { onConflict: 'group_id,ky_doi_soat,dot' },
        );
        failed += 1;
        note('Chưa có tệp, đã nhắc nội bộ.', { reason });
        continue;
      }

      // --- 4. Gửi cả lô trong một email --------------------------------
      const attachments: Attachment[] = [];
      for (const f of lo) {
        attachments.push({
          filename: f.file_name,
          mimeType: f.mime_type ?? mimeFor(f.file_name),
          data: await downloadFile(f.storage_path),
        });
      }
      const link = await signedUrl(lo[0].storage_path, lo[0].file_name);

      const ccList = [g.email_ke_toan, g.email_cc].filter(Boolean).join(',') || undefined;
      const subject = refSubject(g.ten_nhom, nhanKy);

      const sent = await sendMail({
        to: g.email_l1,
        cc: ccList,
        subject,
        html: tplBangKe(g.ten_nhom, ky, link, l.pham_vi_nhan, lo.length),
        attachments,
      });

      const gio = new Date().toISOString();
      await sb.from('statement_files')
        .update({ sent_at: gio }).in('id', lo.map((f) => f.id));

      const slaNgay = l.sla_chap_nhan ?? effectiveSlaChapNhan(g);

      const { data: tr } = await sb.from('tracking').upsert(
        { ...baseRow,
          status: 'da_gui_bang_ke' as TrackingStatus,
          ngay_gui_gan_nhat: today,
          link_file_bang_ke: link,
          ten_file_da_gui: lo.map((f) => f.file_name).join(', '),
          thread_id: sent.threadId,
          message_id: sent.id,
          han_chap_nhan: addDays(today, slaNgay),
          escalate_level: 0,
          so_vong_remind: 0,
          version_bang_ke: lo[0].version,
          ngay_bat_dau_cho_file: null,
          ngay_remind_cuoi: null,
          ghi_chu: null },
        { onConflict: 'group_id,ky_doi_soat,dot' },
      ).select('id').single();

      await sb.from('send_log').insert({
        batch_id: lo[0].batch_id,
        file_id: lo[0].id,
        tracking_id: tr?.id ?? null,
        ma_he_thong: g.ma_he_thong,
        ky_doi_soat: ky,
        dot: l.dot,
        kind: 'bang_ke',
        version: lo[0].version,
        so_tep: lo.length,
        file_name: lo.map((f) => f.file_name).join(', '),
        den: g.email_l1,
        cc: ccList ?? null,
        la_gui_lai: false,
        nguon: 'workflow',
      });

      mails.ghi({ nhom: g.ten_nhom, ky: nhanKy, loai: `Bảng kê (${lo.length} tệp)`,
        den: g.email_l1, cc: ccList, tieu_de: subject });

      ok += 1;
      note('Đã gửi bảng kê.', { soTep: lo.length, threadId: sent.threadId });
    } catch (err) {
      failed += 1;
      note('Lỗi khi xử lý.', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    ok,
    failed,
    summary: `Gửi thành công ${ok}/${toiHan.length} lịch`
      + (failed ? `, ${failed} lịch cần xử lý` : '')
      + (mails.count ? `. Thư đã gửi: ${mails.tomTat()}` : '.'),
    detail,
    mails: mails.all,
  };
}
