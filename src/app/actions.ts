'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { nowInVN, addDays } from '@/lib/period';
import { sendMail } from '@/lib/google/gmail';
import { refSubject, tplMacDinhChot } from '@/lib/email-templates';
import { TrackingStatus, FileKind } from '@/lib/types';
import { buildPath, nextVersion, removeFile, previewUrl } from '@/lib/storage';
import { guiTepChoKhach } from '@/workflows/wf3-gui-tep';

async function requireRole(...roles: string[]) {
  const user = await currentUser();
  if (!user) throw new Error('Chưa đăng nhập.');
  if (!roles.includes(user.role)) throw new Error('Vai trò của bạn không thực hiện được thao tác này.');
  return user;
}

// =====================================================================
// Duyệt phản hồi khách — thay cho nút bấm trong email của bản n8n
// =====================================================================

export type QuyetDinh = 'dong_y' | 'can_sua' | 'tu_choi';

export async function duyetPhanHoi(trackingId: string, quyetDinh: QuyetDinh, ghiChu: string) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();
  const today = nowInVN().isoDate;

  const { data: row } = await sb
    .from('tracking').select('*, billing_groups!inner(*)').eq('id', trackingId).single();
  if (!row) throw new Error('Không tìm thấy kỳ đối soát này.');

  const g = (row as any).billing_groups;
  const before = { status: row.status, ket_qua_duyet: row.ket_qua_duyet };
  let next: TrackingStatus;
  let extra: Record<string, unknown> = {};

  if (quyetDinh === 'dong_y') {
    // Có yêu cầu hồ sơ thanh toán thì còn một chặng nữa, không thì xong.
    const canHstt = Boolean(g.ho_so_thanh_toan?.trim());
    next = canHstt ? 'cho_ho_so_thanh_toan' : 'hoan_tat_cho_thanh_toan';
    extra = {
      ngay_chot: today,
      ngay_bat_dau_cho_file: canHstt ? today : null,
      escalate_level: 0,
      so_vong_remind: 0,
      ngay_remind_cuoi: null,
    };
  } else if (quyetDinh === 'can_sua') {
    next = 'can_chinh_sua';
    extra = {
      ngay_bat_dau_cho_file: today,
      ngay_remind_cuoi: null,
      // Đồng hồ nội bộ chạy, đồng hồ khách tạm dừng cho tới khi gửi bản mới
      han_chap_nhan: addDays(today, g.sla_phan_hoi_dieu_chinh ?? 2),
    };
  } else {
    next = 'can_xu_ly_tay';
  }

  await sb.from('tracking').update({
    status: next,
    ket_qua_duyet: quyetDinh,
    nguoi_duyet: user.id,
    ghi_chu: ghiChu?.trim() ? `${row.ghi_chu ?? ''}\n[Kế toán] ${ghiChu.trim()}`.trim() : row.ghi_chu,
    ...extra,
  }).eq('id', trackingId);

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'approval.decide', entity: 'tracking', entityId: trackingId,
    before, after: { status: next, ket_qua_duyet: quyetDinh }, note: ghiChu,
  });

  revalidatePath('/approvals');
  revalidatePath('/tracking');
}

/** Kết thúc một kỳ đã hết vòng escalate: chốt mặc định và báo khách. */
export async function chotMacDinh(trackingId: string) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();
  const today = nowInVN().isoDate;

  const { data: row } = await sb
    .from('tracking').select('*, billing_groups!inner(*)').eq('id', trackingId).single();
  if (!row) throw new Error('Không tìm thấy kỳ đối soát này.');
  const g = (row as any).billing_groups;

  if (g.email_l1) {
    await sendMail({
      to: g.email_l1,
      cc: [g.email_l2, g.email_ke_toan, g.email_pm].filter(Boolean).join(',') || undefined,
      subject: refSubject(row.ten_nhom, row.ky_doi_soat),
      html: tplMacDinhChot(row.ky_doi_soat),
      threadId: row.thread_id ?? undefined,
    });
  }

  await sb.from('tracking').update({
    status: 'mac_dinh_chap_thuan' as TrackingStatus,
    ket_qua_duyet: 'dong_y',
    nguoi_duyet: user.id,
    ngay_chot: today,
  }).eq('id', trackingId);

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'approval.auto_close', entity: 'tracking', entityId: trackingId,
    note: 'Chốt mặc định sau khi hết vòng escalate.',
  });

  revalidatePath('/approvals');
  revalidatePath('/tracking');
}

// =====================================================================
// Override tracking — thay cho việc sửa tay trên Google Sheets (SOP 6.1)
// =====================================================================

export async function overrideTracking(trackingId: string, patch: {
  status?: TrackingStatus;
  thread_id?: string;
  escalate_level?: number;
  so_vong_remind?: number;
  han_chap_nhan?: string;
  ghi_chu?: string;
  reset_remind?: boolean;
}) {
  const user = await requireRole('admin', 'pm', 'ke_toan');
  const sb = supabaseAdmin();

  const { data: before } = await sb.from('tracking').select('*').eq('id', trackingId).single();

  const update: Record<string, unknown> = {};
  for (const k of ['status', 'thread_id', 'escalate_level', 'so_vong_remind', 'han_chap_nhan', 'ghi_chu'] as const) {
    if (patch[k] !== undefined && patch[k] !== '') update[k] = patch[k];
  }
  if (patch.reset_remind) update.ngay_remind_cuoi = null;

  if (Object.keys(update).length === 0) return;

  await sb.from('tracking').update(update).eq('id', trackingId);
  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'tracking.override', entity: 'tracking', entityId: trackingId,
    before, after: update, note: 'Can thiệp thủ công từ giao diện.',
  });

  revalidatePath('/tracking');
}

// =====================================================================
// Master Data
// =====================================================================

export async function luuNhomDoiSoat(groupId: string | null, form: Record<string, any>) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();

  const num = (v: any) => (v === '' || v == null ? null : Number(v));
  const payload = {
    ma_he_thong: String(form.ma_he_thong ?? '').trim(),
    ten_nhom: String(form.ten_nhom ?? '').trim(),
    ngung_hop_tac: form.ngung_hop_tac === 'on' || form.ngung_hop_tac === true,
    diem_gmv: num(form.diem_gmv),
    diem_company_size: num(form.diem_company_size),
    diem_tranh_chap: num(form.diem_tranh_chap),
    diem_phuc_tap: num(form.diem_phuc_tap),
    nhom_escalate: num(form.nhom_escalate) ?? 2,
    ngay_gui_bang_ke_hd: num(form.ngay_gui_bang_ke_hd),
    ngay_gui_bang_ke_thuc_te: num(form.ngay_gui_bang_ke_thuc_te),
    sla_chap_nhan_hd: num(form.sla_chap_nhan_hd),
    sla_chap_nhan_thuc_te: num(form.sla_chap_nhan_thuc_te),
    sla_phan_hoi_dieu_chinh: num(form.sla_phan_hoi_dieu_chinh),
    sla_ky_bien_ban: num(form.sla_ky_bien_ban),
    sla_hstt: num(form.sla_hstt),
    payment_term: num(form.payment_term),
    email_l1: form.email_l1 || null,
    email_l2: form.email_l2 || null,
    email_l3: form.email_l3 || null,
    email_ke_toan: form.email_ke_toan || null,
    email_pm: form.email_pm || null,
    email_high_level: form.email_high_level || null,
    email_cc: form.email_cc || null,
    ho_so_thanh_toan: form.ho_so_thanh_toan || null,
    ghi_chu: form.ghi_chu || null,
  };

  if (!payload.ma_he_thong) throw new Error('Mã hệ thống không được để trống.');
  if (!payload.ten_nhom) throw new Error('Tên nhóm không được để trống.');

  if (groupId) {
    const { data: before } = await sb.from('billing_groups').select('*').eq('id', groupId).single();
    const { error } = await sb.from('billing_groups').update(payload).eq('id', groupId);
    if (error) throw new Error(error.message);
    await writeAudit({
      actorId: user.id, actorEmail: user.email,
      action: 'billing_group.update', entity: 'billing_groups', entityId: groupId,
      before, after: payload,
    });
  } else {
    const { data, error } = await sb.from('billing_groups').insert(payload).select('id').single();
    if (error) throw new Error(error.message);
    await writeAudit({
      actorId: user.id, actorEmail: user.email,
      action: 'billing_group.create', entity: 'billing_groups', entityId: data.id, after: payload,
    });
  }

  revalidatePath('/master-data');
}

// =====================================================================
// Cấu hình workflow
// =====================================================================

export async function luuLichWorkflow(key: string, form: {
  enabled: boolean;
  schedule_kind: 'daily' | 'interval';
  run_at_hhmm?: string;
  interval_minutes?: number;
}) {
  const user = await requireRole('admin');
  const sb = supabaseAdmin();

  const { data: before } = await sb.from('workflow_schedules').select('*').eq('key', key).single();

  await sb.from('workflow_schedules').update({
    enabled: form.enabled,
    schedule_kind: form.schedule_kind,
    run_at_hhmm: form.schedule_kind === 'daily' ? (form.run_at_hhmm || '08:00') : null,
    interval_minutes: form.schedule_kind === 'interval' ? (form.interval_minutes || 5) : null,
  }).eq('key', key);

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'workflow.schedule_update', entity: 'workflow_schedules', entityId: key,
    before, after: form,
  });

  revalidatePath('/workflows');
}

// =====================================================================
// Người dùng
// =====================================================================

export async function taoNguoiDung(email: string, matKhau: string, hoTen: string, vaiTro: string) {
  const user = await requireRole('admin');
  const sb = supabaseAdmin();

  const { data, error } = await sb.auth.admin.createUser({
    email: email.trim(),
    password: matKhau,
    email_confirm: true,
    user_metadata: { full_name: hoTen, role: vaiTro },
  });
  if (error) throw new Error(error.message);

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'user.create', entity: 'profiles', entityId: data.user!.id,
    note: `${email} — vai trò ${vaiTro}`,
  });

  revalidatePath('/users');
}

export async function doiTrangThaiNguoiDung(userId: string, active: boolean) {
  const user = await requireRole('admin');
  await supabaseAdmin().from('profiles').update({ is_active: active }).eq('id', userId);
  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: active ? 'user.activate' : 'user.deactivate',
    entity: 'profiles', entityId: userId,
  });
  revalidatePath('/users');
}

// =====================================================================
// Tệp bảng kê — tải lên ngay trên website, không qua Google Drive
// =====================================================================

/** Nơi sẽ cất tệp. Gọi trước khi trình duyệt tải nội dung lên kho. */
export async function xinChoLuuTep(
  groupId: string, ky: string, kind: FileKind, fileName: string,
) {
  await requireRole('admin', 'ke_toan');

  const { data: g } = await supabaseAdmin()
    .from('billing_groups').select('ma_he_thong').eq('id', groupId).maybeSingle();
  if (!g) throw new Error('Không tìm thấy nhóm đối soát.');

  if (!/^T\d{2}\.\d{4}$/.test(ky)) {
    throw new Error('Kỳ đối soát phải viết dạng T07.2026.');
  }

  const version = await nextVersion(groupId, ky, kind);
  return {
    path: buildPath(g.ma_he_thong, ky, kind, version, fileName),
    version,
    maHeThong: g.ma_he_thong,
  };
}

/**
 * Ghi nhận tệp vừa được tải lên kho và, nếu được yêu cầu, gửi luôn cho khách.
 * Trình duyệt tải thẳng nội dung lên Supabase Storage nên máy chủ không phải
 * trung chuyển tệp lớn.
 */
export async function ghiNhanTep(input: {
  groupId: string;
  ky: string;
  kind: FileKind;
  version: number;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  guiNgay: boolean;
  ghiChu?: string;
}) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();

  const { data: g } = await sb
    .from('billing_groups').select('ma_he_thong').eq('id', input.groupId).single();

  const { data: file, error } = await sb.from('statement_files').insert({
    group_id: input.groupId,
    ma_he_thong: g!.ma_he_thong,
    ky_doi_soat: input.ky,
    kind: input.kind,
    version: input.version,
    storage_path: input.storagePath,
    file_name: input.fileName,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    uploaded_by: user.id,
    ghi_chu: input.ghiChu ?? null,
  }).select('id').single();

  if (error) {
    // Ghi siêu dữ liệu hỏng thì dọn luôn tệp, tránh để rác trong kho
    await removeFile(input.storagePath);
    throw new Error(`Không ghi nhận được tệp: ${error.message}`);
  }

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'file.upload', entity: 'statement_files', entityId: file.id,
    note: `${input.fileName} — ${input.ky} — bản ${input.version}`,
  });

  let ketQua = 'Đã lưu tệp. Hệ thống sẽ gửi ở lượt quét kế tiếp.';

  if (input.guiNgay) {
    try {
      const r = await guiTepChoKhach(file.id);
      ketQua = r.message;
      if (r.sent) {
        await writeAudit({
          actorId: user.id, actorEmail: user.email,
          action: 'file.send', entity: 'statement_files', entityId: file.id, note: r.message,
        });
      }
    } catch (e) {
      ketQua = `Đã lưu tệp nhưng chưa gửi được: ${e instanceof Error ? e.message : 'lỗi không rõ'}. `
        + 'Hệ thống sẽ thử lại tự động.';
    }
  }

  revalidatePath('/files');
  revalidatePath('/tracking');
  return { ketQua };
}

/** Gửi tay một tệp đã lưu nhưng chưa gửi. */
export async function guiTepNgay(fileId: string) {
  const user = await requireRole('admin', 'ke_toan');
  const r = await guiTepChoKhach(fileId);
  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'file.send', entity: 'statement_files', entityId: fileId, note: r.message,
  });
  revalidatePath('/files');
  revalidatePath('/tracking');
  return r;
}

/** Xóa tệp chưa gửi — tải nhầm thì gỡ được, đã gửi rồi thì không. */
export async function xoaTep(fileId: string) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();

  const { data: file } = await sb
    .from('statement_files').select('*').eq('id', fileId).maybeSingle();
  if (!file) throw new Error('Không tìm thấy tệp.');
  if (file.sent_at) throw new Error('Tệp đã gửi cho khách nên không xóa được. Hãy tải lên bản mới thay thế.');

  await removeFile(file.storage_path);
  await sb.from('statement_files').delete().eq('id', fileId);

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'file.delete', entity: 'statement_files', entityId: fileId,
    note: file.file_name,
  });

  revalidatePath('/files');
}

/** Liên kết xem tạm cho người dùng nội bộ, sống 5 phút. */
export async function xemTep(storagePath: string) {
  await requireRole('admin', 'ke_toan', 'pm', 'high_level');
  const url = await previewUrl(storagePath);
  if (!url) throw new Error('Không mở được tệp.');
  return url;
}
