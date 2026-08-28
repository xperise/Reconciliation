import { supabaseAdmin } from '@/lib/supabase/admin';
import { nowInVN, addDays, periodFull } from '@/lib/period';
import { downloadFile, signedUrl, mimeFor, filesInBatch, StatementFile } from '@/lib/storage';
import { sendMail, Attachment } from '@/lib/google/gmail';
import { refSubject, tplBangKeSuaDoi, tplHoSoThanhToan, tplBangKe } from '@/lib/email-templates';
import { RunResult, TrackingStatus, effectiveSlaChapNhan, BillingGroup } from '@/lib/types';
import { MailLog } from '@/lib/mail-log';

/**
 * WF3 — Gửi tệp đã tải lên
 *
 * Khi kế toán tải tệp lên website, hệ thống gửi cho khách ngay trong cùng
 * thao tác đó. Workflow này là lưới an toàn: nó quét những tệp còn sót lại
 * chưa gửi được — do mất mạng giữa chừng, Gmail lỗi tạm thời, hoặc người
 * tải lên chọn "để gửi sau".
 *
 * Vì mỗi tệp mang sẵn nhóm, kỳ và loại, workflow không phải suy đoán gì từ
 * tên file như bản chạy trên Drive trước đây.
 */
export async function runWf3(): Promise<RunResult> {
  const sb = supabaseAdmin();
  const detail: unknown[] = [];
  const mails = new MailLog();
  let ok = 0;
  let failed = 0;

  const { data: files, error } = await sb
    .from('statement_files')
    .select('*')
    .is('sent_at', null)
    .order('uploaded_at', { ascending: true })
    .limit(120);

  if (error) throw new Error(`Không đọc được danh sách tệp: ${error.message}`);
  if (!files?.length) {
    return { ok: 0, failed: 0, summary: 'Không có tệp nào đang chờ gửi.', detail: [] };
  }

  // Gom theo lô: nhiều tệp của cùng một bảng kê phải đi chung một email
  const theoLo = new Map<string, StatementFile[]>();
  for (const f of files as StatementFile[]) {
    const arr = theoLo.get(f.batch_id) ?? [];
    arr.push(f);
    theoLo.set(f.batch_id, arr);
  }

  for (const [batchId, lo] of theoLo) {
    const dau = lo[0];
    const note = (msg: string, extra: Record<string, unknown> = {}) =>
      detail.push({ nhom: dau.ma_he_thong, ky: dau.ky_doi_soat, msg, ...extra });

    try {
      const result = await guiLoChoKhach(batchId);
      if (result.sent) {
        ok += 1;
        note(result.message);
        if (result.mail) mails.ghi(result.mail);
      } else { note(result.message); }
    } catch (err) {
      failed += 1;
      note('Lỗi khi gửi.', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    ok, failed,
    summary: ok ? `Đã gửi ${ok} lô tệp còn tồn. ${mails.tomTat()}` : 'Không có tệp nào cần gửi lại.',
    detail,
    mails: mails.all,
  };
}

/**
 * Gửi một tệp cụ thể cho khách và cập nhật tracking.
 *
 * Dùng chung cho hai lối vào: nút "Gửi ngay" trên website và lượt quét
 * của WF3. Nhờ vậy hai lối luôn cho ra cùng một kết quả.
 */
export async function guiLoChoKhach(
  batchId: string,
): Promise<{ sent: boolean; message: string; mail?: any }> {
  const sb = supabaseAdmin();
  const today = nowInVN().isoDate;

  const lo = (await filesInBatch(batchId)).filter((f) => !f.sent_at);
  if (lo.length === 0) return { sent: false, message: 'Lô này đã gửi trước đó.' };

  const dau = lo[0];

  const { data: g } = await sb
    .from('billing_groups').select('*').eq('id', dau.group_id).maybeSingle();
  if (!g) return { sent: false, message: 'Không tìm thấy nhóm đối soát.' };
  const group = g as BillingGroup;

  if (!group.email_l1?.includes('@')) {
    return { sent: false, message: 'Nhóm này chưa khai báo email đầu mối khách hàng.' };
  }

  // Dòng tracking của kỳ và đợt. Chưa có thì tạo, vì kế toán có thể tải lên
  // sớm hơn ngày WF1 chạy.
  let { data: tr } = await sb
    .from('tracking').select('*')
    .eq('group_id', dau.group_id).eq('ky_doi_soat', dau.ky_doi_soat)
    .eq('dot', dau.dot).maybeSingle();

  if (!tr) {
    const { data: created } = await sb.from('tracking').insert({
      group_id: dau.group_id,
      ma_he_thong: dau.ma_he_thong,
      ten_nhom: group.ten_nhom,
      ky_doi_soat: dau.ky_doi_soat,
      dot: dau.dot,
      status: 'chua_gui' as TrackingStatus,
    }).select('*').single();
    tr = created;
  }

  const nhanKy = periodFull(dau.ky_doi_soat, tr?.pham_vi_nhan, dau.dot);

  const attachments: Attachment[] = [];
  for (const f of lo) {
    attachments.push({
      filename: f.file_name,
      mimeType: f.mime_type ?? mimeFor(f.file_name),
      data: await downloadFile(f.storage_path),
    });
  }
  const link = await signedUrl(dau.storage_path, dau.file_name);
  const cc = [group.email_ke_toan, group.email_cc].filter(Boolean).join(',') || undefined;

  const laHstt = dau.kind === 'hstt';
  const laBanSua = !laHstt && dau.version > 1;

  const html = laHstt
    ? tplHoSoThanhToan(group.ten_nhom, dau.ky_doi_soat, link)
    : laBanSua
      ? tplBangKeSuaDoi(group.ten_nhom, dau.ky_doi_soat, dau.version, link)
      : tplBangKe(group.ten_nhom, dau.ky_doi_soat, link, tr?.pham_vi_nhan, lo.length);

  const subject = refSubject(group.ten_nhom, nhanKy);
  const loaiThu = laHstt ? 'Hồ sơ thanh toán'
    : laBanSua ? `Bảng kê bản ${dau.version}` : 'Bảng kê';
  const mailRec = {
    nhom: group.ten_nhom, ky: nhanKy,
    loai: lo.length > 1 ? `${loaiThu} (${lo.length} tệp)` : loaiThu,
    den: group.email_l1, cc, tieu_de: subject,
  };

  const sent = await sendMail({
    to: group.email_l1,
    cc,
    subject,
    html,
    attachments,
    threadId: tr?.thread_id ?? undefined,
  });

  const gio = new Date().toISOString();
  await sb.from('statement_files').update({ sent_at: gio }).in('id', lo.map((f) => f.id));

  const tenTep = lo.map((f) => f.file_name).join(', ');

  if (laHstt) {
    await sb.from('tracking').update({
      status: 'da_gui_ho_so_thanh_toan' as TrackingStatus,
      link_file_hstt: link,
      ten_file_hstt_da_gui: tenTep,
      ngay_gui_gan_nhat: today,
      ngay_remind_cuoi: null,
      ngay_bat_dau_cho_file: null,
    }).eq('id', tr!.id);

    return {
      sent: true,
      message: `Đã gửi hồ sơ thanh toán cho ${group.ten_nhom} (${lo.length} tệp).`,
      mail: mailRec,
    };
  }

  // Gửi bảng kê, dù bản đầu hay bản sửa, đều làm đồng hồ SLA khách chạy lại.
  const soNgay = laBanSua
    ? (group.sla_phan_hoi_dieu_chinh ?? effectiveSlaChapNhan(group))
    : effectiveSlaChapNhan(group);

  await sb.from('tracking').update({
    status: 'da_gui_bang_ke' as TrackingStatus,
    link_file_bang_ke: link,
    ten_file_da_gui: tenTep,
    version_bang_ke: dau.version,
    ngay_gui_gan_nhat: today,
    han_chap_nhan: addDays(today, soNgay),
    escalate_level: 0,
    so_vong_remind: 0,
    ngay_remind_cuoi: null,
    ngay_bat_dau_cho_file: null,
    ghi_chu: null,
    ...(tr?.thread_id ? {} : { thread_id: sent.threadId, message_id: sent.id }),
  }).eq('id', tr!.id);

  return {
    sent: true,
    message: laBanSua
      ? `Đã gửi bảng kê bản ${dau.version} cho ${group.ten_nhom} (${lo.length} tệp).`
      : `Đã gửi bảng kê cho ${group.ten_nhom} (${lo.length} tệp).`,
    mail: mailRec,
  };
}

/** Gửi lô chứa một tệp cụ thể. Giữ lại cho các lối gọi cũ. */
export async function guiTepChoKhach(fileId: string) {
  const { data } = await supabaseAdmin()
    .from('statement_files').select('batch_id').eq('id', fileId).maybeSingle();
  if (!data?.batch_id) return { sent: false, message: 'Không tìm thấy tệp.' };
  return guiLoChoKhach(data.batch_id);
}
