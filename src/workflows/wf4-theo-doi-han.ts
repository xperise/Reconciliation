import { supabaseAdmin } from '@/lib/supabase/admin';
import { nowInVN, daysBetween } from '@/lib/period';
import { sendMail } from '@/lib/google/gmail';
import {
  refSubject, tplNhacKhach, tplMacDinhChot,
  tplNhacNoiBoUpload, tplEscalateNoiBo, tplCanQuyetDinh,
} from '@/lib/email-templates';
import { BillingGroup, RunResult, STATUS_DONE, TrackingStatus } from '@/lib/types';
import { MailLog } from '@/lib/mail-log';

/**
 * WF4 — Theo dõi hạn phản hồi
 *
 * Chạy mỗi sáng, sau WF1. Hai nhánh song song đúng nguyên tắc "escalate hai
 * chiều" của tài liệu Overview:
 *
 *   Nhánh khách   — khách quá hạn xác nhận bảng kê thì nhắc leo thang
 *                   L1 → L2 → L3, lặp theo nhóm, hết vòng thì chốt tự động
 *                   (nhóm 1) hoặc đẩy sang kế toán quyết định (nhóm 2, 3).
 *
 *   Nhánh nội bộ  — kế toán chậm upload file thì nhắc ở D+1 và escalate lên
 *                   cấp quản lý ở D+2.
 *
 * Mỗi nhóm chỉ nhận tối đa một email mỗi ngày, kiểm soát bằng ngay_remind_cuoi.
 */

/** Số cấp escalate và số vòng lặp cho phép, theo sheet "3. Quy định chung SLA". */
function escalationPolicy(nhom: number) {
  if (nhom === 1) return { maxLevel: 2, maxPasses: 1, autoChot: true };
  if (nhom === 2) return { maxLevel: 3, maxPasses: 2, autoChot: false };
  return { maxLevel: 3, maxPasses: 3, autoChot: false };
}

/** Người nhận ở mỗi cấp: cấp sau luôn CC toàn bộ cấp trước. */
function recipientsForLevel(g: BillingGroup, level: number) {
  const chain = [g.email_l1, g.email_l2, g.email_l3];
  const to = chain[level - 1] || g.email_l1;
  const cc = [
    ...chain.slice(0, level - 1),
    g.email_ke_toan,
    g.email_pm,
    g.email_cc,
  ].filter(Boolean).join(',');
  return { to: to as string, cc: cc || undefined };
}

export async function runWf4(): Promise<RunResult> {
  const sb = supabaseAdmin();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const today = nowInVN().isoDate;
  const detail: unknown[] = [];
  const mails = new MailLog();
  let ok = 0;
  let failed = 0;

  const { data: sla } = await sb
    .from('app_settings').select('value').eq('key', 'sla_noi_bo').maybeSingle();
  const nhacSau = sla?.value?.nhac_lan_1_sau_ngay ?? 1;
  const escalateSau = sla?.value?.escalate_sau_ngay ?? 2;

  const { data: rows, error } = await sb
    .from('tracking')
    .select('*, billing_groups!inner(*)')
    .not('status', 'in', `(${STATUS_DONE.join(',')})`);

  if (error) throw new Error(`Không đọc được tracking: ${error.message}`);
  if (!rows?.length) {
    return { ok: 0, failed: 0, summary: 'Không có kỳ nào cần theo dõi.', detail: [] };
  }

  for (const row of rows as any[]) {
    const g = row.billing_groups as BillingGroup;
    const note = (msg: string, extra: Record<string, unknown> = {}) =>
      detail.push({ nhom: row.ma_he_thong, ky: row.ky_doi_soat, msg, ...extra });

    // Đã nhắc hôm nay rồi thì thôi
    if (row.ngay_remind_cuoi === today) { note('Đã nhắc hôm nay.'); continue; }

    try {
      // =============== NHÁNH NỘI BỘ: kế toán chậm upload ===============
      const choFile: Record<string, string> = {
        cho_file_da_nhac_noi_bo: 'bảng kê bản gốc',
        can_chinh_sua: 'bảng kê bản chỉnh sửa (_v2)',
        cho_ho_so_thanh_toan: 'hồ sơ thanh toán (_HSTT)',
      };

      if (choFile[row.status as string]) {
        const moc = row.ngay_bat_dau_cho_file ?? row.ngay_gui_gan_nhat ?? today;
        const treNgay = daysBetween(moc, today);
        const viec = choFile[row.status as string];

        if (treNgay < nhacSau) { note('Chưa tới hạn nhắc nội bộ.', { treNgay }); continue; }

        const isEscalate = treNgay >= escalateSau;
        const mail = isEscalate
          ? tplEscalateNoiBo(row.ten_nhom, row.ky_doi_soat, viec, appUrl)
          : tplNhacNoiBoUpload(row.ten_nhom, row.ky_doi_soat, viec, appUrl);

        const to = g.email_ke_toan;
        if (!to) { note('Không có email kế toán để nhắc.'); failed += 1; continue; }

        const cc = [g.email_pm, isEscalate ? g.email_high_level : null, g.email_cc]
          .filter(Boolean).join(',');

        const sent = await sendMail({
          to, cc: cc || undefined, ...mail,
          threadId: row.internal_thread_id ?? undefined,
        });
        mails.ghi({
          nhom: row.ten_nhom, ky: row.ky_doi_soat,
          loai: isEscalate ? 'Escalate nội bộ D+2' : 'Nhắc nội bộ D+1',
          den: to, cc: cc || undefined, tieu_de: mail.subject,
        });

        await sb.from('tracking').update({
          ngay_remind_cuoi: today,
          internal_thread_id: row.internal_thread_id ?? sent.threadId,
        }).eq('id', row.id);

        ok += 1;
        note(isEscalate ? 'Đã escalate nội bộ D+2.' : 'Đã nhắc nội bộ D+1.', { treNgay, viec });
        continue;
      }

      // =============== NHÁNH KHÁCH: quá hạn xác nhận ==================
      if (row.status !== 'da_gui_bang_ke') { note('Không thuộc diện nhắc khách.'); continue; }
      if (!row.han_chap_nhan) { note('Chưa có hạn chấp nhận.'); continue; }
      if (daysBetween(row.han_chap_nhan, today) < 0) { note('Còn trong hạn.'); continue; }

      const { maxLevel, maxPasses, autoChot } = escalationPolicy(g.nhom_escalate);
      const level = row.escalate_level as number;
      const passes = row.so_vong_remind as number;

      // --- Còn cấp để leo trong vòng hiện tại ---
      if (level < maxLevel) {
        const next = level + 1;
        const { to, cc } = recipientsForLevel(g, next);
        if (!to) { note('Thiếu email khách để nhắc.'); failed += 1; continue; }

        const subj = refSubject(row.ten_nhom, row.ky_doi_soat);
        await sendMail({
          to, cc,
          subject: subj,
          html: tplNhacKhach(row.ky_doi_soat, next, row.ten_nhom, row.pham_vi_nhan),
          threadId: row.thread_id ?? undefined,
        });
        mails.ghi({
          nhom: row.ten_nhom, ky: row.ky_doi_soat, loai: `Nhắc khách L${next}`,
          den: to, cc, tieu_de: subj,
        });

        await sb.from('tracking').update({
          escalate_level: next,
          ngay_remind_cuoi: today,
        }).eq('id', row.id);

        ok += 1;
        note(`Đã nhắc khách cấp L${next}.`, { vong: passes + 1 });
        continue;
      }

      // --- Hết cấp: sang vòng mới hoặc kết thúc ---
      const nextPass = passes + 1;

      if (nextPass < maxPasses) {
        const { to, cc } = recipientsForLevel(g, 1);
        const subj2 = refSubject(row.ten_nhom, row.ky_doi_soat);
        await sendMail({
          to, cc,
          subject: subj2,
          html: tplNhacKhach(row.ky_doi_soat, 1, row.ten_nhom, row.pham_vi_nhan),
          threadId: row.thread_id ?? undefined,
        });
        mails.ghi({
          nhom: row.ten_nhom, ky: row.ky_doi_soat,
          loai: `Nhắc khách L1 (vòng ${nextPass + 1})`,
          den: to, cc, tieu_de: subj2,
        });

        await sb.from('tracking').update({
          escalate_level: 1,
          so_vong_remind: nextPass,
          ngay_remind_cuoi: today,
        }).eq('id', row.id);

        ok += 1;
        note(`Bắt đầu vòng nhắc thứ ${nextPass + 1}, gửi lại từ L1.`);
        continue;
      }

      // --- Hết toàn bộ vòng ---
      if (autoChot) {
        const ccChot = [g.email_l2, g.email_ke_toan, g.email_pm, g.email_cc]
          .filter(Boolean).join(',') || undefined;
        const subjChot = refSubject(row.ten_nhom, row.ky_doi_soat);
        await sendMail({
          to: g.email_l1!,
          cc: ccChot,
          subject: subjChot,
          html: tplMacDinhChot(row.ky_doi_soat, row.ten_nhom),
          threadId: row.thread_id ?? undefined,
        });
        mails.ghi({
          nhom: row.ten_nhom, ky: row.ky_doi_soat, loai: 'Thông báo chốt mặc định',
          den: g.email_l1!, cc: ccChot, tieu_de: subjChot,
        });

        await sb.from('tracking').update({
          status: 'mac_dinh_chap_thuan' as TrackingStatus,
          so_vong_remind: nextPass,
          ngay_chot: today,
          ngay_remind_cuoi: today,
          ghi_chu: 'WF4: nhóm 1 hết vòng nhắc, mặc định chấp thuận theo hợp đồng.',
        }).eq('id', row.id);

        ok += 1;
        note('Nhóm 1 hết vòng nhắc — đã tự động chốt và thông báo khách.');
        continue;
      }

      // Nhóm 2 & 3: hệ thống dừng, chuyển kế toán quyết định trên dashboard
      if (g.email_ke_toan) {
        const mail = tplCanQuyetDinh(row.ten_nhom, row.ky_doi_soat, nextPass, maxLevel, appUrl);
        const ccQd = [g.email_pm, g.email_high_level].filter(Boolean).join(',') || undefined;
        await sendMail({
          to: g.email_ke_toan,
          cc: ccQd,
          ...mail,
          threadId: row.internal_thread_id ?? undefined,
        });
        mails.ghi({
          nhom: row.ten_nhom, ky: row.ky_doi_soat, loai: 'Yêu cầu kế toán quyết định',
          den: g.email_ke_toan, cc: ccQd, tieu_de: mail.subject,
        });
      }

      await sb.from('tracking').update({
        status: 'cho_duyet_phan_loai' as TrackingStatus,
        so_vong_remind: nextPass,
        ngay_remind_cuoi: today,
        ai_de_xuat: 'het_vong_escalate',
        ai_pham_vi: 'toàn bộ',
        ghi_chu: `WF4: khách không phản hồi sau ${nextPass} vòng nhắc, cần kế toán quyết định.`,
      }).eq('id', row.id);

      ok += 1;
      note('Hết vòng nhắc — đã chuyển kế toán quyết định.');
    } catch (err) {
      failed += 1;
      note('Lỗi khi xử lý.', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    ok, failed,
    summary: ok
      ? `Đã xử lý ${ok} lượt nhắc. ${mails.tomTat()}`
      : 'Không có nhóm nào tới hạn nhắc.',
    detail,
    mails: mails.all,
  };
}
