'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { nowInVN, addDays, periodFull } from '@/lib/period';
import { sendMail } from '@/lib/google/gmail';
import {
  refSubject, tplMacDinhChot, tplNhacChuanBiHstt, tplNhacSuaChungTu, tplTraLoiKhach,
} from '@/lib/email-templates';
import { TrackingStatus, FileKind } from '@/lib/types';
import {
  buildPath, nextVersion, removeFile, previewUrl, mimeFor,
  downloadFile as taiTepVe,
} from '@/lib/storage';
import { pushNotify } from '@/lib/notify';
import { guiTepChoKhach, guiLoChoKhach } from '@/workflows/wf3-gui-tep';

async function requireRole(...roles: string[]) {
  const user = await currentUser();
  if (!user) throw new Error('Chưa đăng nhập.');
  if (!roles.includes(user.role)) throw new Error('Vai trò của bạn không thực hiện được thao tác này.');
  return user;
}

/** Tên hiển thị của người thao tác, rơi về email khi chưa khai họ tên. */
function tenNguoi(u: { full_name?: string | null; email: string }): string {
  return u.full_name?.trim() || u.email;
}

// =====================================================================
// Duyệt phản hồi khách — thay cho nút bấm trong email của bản n8n
// =====================================================================

export type QuyetDinh = 'dong_y' | 'can_sua' | 'tu_choi' | 'bo_qua';

export type CanSua = 'bang_ke' | 'hoa_don' | 'ca_hai';

const NHAN_CAN_SUA: Record<CanSua, string> = {
  bang_ke: 'bảng kê',
  hoa_don: 'hóa đơn điều chỉnh',
  ca_hai: 'bảng kê và hóa đơn điều chỉnh',
};

export async function duyetPhanHoi(
  trackingId: string, quyetDinh: QuyetDinh, ghiChu: string, canSua?: CanSua,
) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();
  const today = nowInVN().isoDate;

  if (quyetDinh === 'tu_choi' && !ghiChu?.trim()) {
    throw new Error('Từ chối bắt buộc phải ghi lý do, vì hệ thống sẽ dừng và người sau cần biết vì sao.');
  }

  const { data: row } = await sb
    .from('tracking').select('*, billing_groups!inner(*)').eq('id', trackingId).single();
  if (!row) throw new Error('Không tìm thấy kỳ đối soát này.');

  const g = (row as any).billing_groups;
  const before = { status: row.status, ket_qua_duyet: row.ket_qua_duyet };
  const canHstt = Boolean(g.ho_so_thanh_toan?.trim());

  // Khách vừa phản hồi về cái gì. WF2 ghi cột này lúc phát hiện thư mới.
  const veHstt = row.doi_tuong_duyet === 'hstt';

  let next: TrackingStatus;
  let extra: Record<string, unknown> = {};

  if (quyetDinh === 'bo_qua') {
    // Khách mới báo đã nhận, chưa có ý kiến thực chất. Trả kỳ về đúng trạng
    // thái trước đó để đồng hồ SLA chạy tiếp, không coi như đã xử lý xong.
    next = veHstt ? 'cho_xac_nhan_hstt' : 'da_gui_bang_ke';
    extra = { ket_qua_duyet: 'bo_qua' };
  } else if (quyetDinh === 'dong_y' && veHstt) {
    // Khách xác nhận hồ sơ thanh toán là chặng cuối, kỳ đóng lại.
    next = 'hoan_tat_cho_thanh_toan';
    extra = {
      ngay_chot: row.ngay_chot ?? today,
      han_xac_nhan_hstt: null,
      doi_tuong_duyet: null,
      ngay_remind_cuoi: null,
    };
  } else if (quyetDinh === 'dong_y') {
    next = canHstt ? 'cho_ho_so_thanh_toan' : 'hoan_tat_cho_thanh_toan';
    extra = {
      ngay_chot: today,
      ngay_bat_dau_cho_file: canHstt ? today : null,
      escalate_level: 0,
      so_vong_remind: 0,
      ngay_remind_cuoi: null,
    };
  } else if (quyetDinh === 'can_sua') {
    // Khách đang góp ý về hồ sơ thanh toán thì vòng sửa là vòng của hồ sơ,
    // không kéo kỳ ngược về giai đoạn bảng kê đã chốt xong.
    next = veHstt ? 'can_chinh_sua_hstt' : 'can_chinh_sua';
    extra = {
      ngay_bat_dau_cho_file: today,
      ngay_remind_cuoi: null,
      noi_dung_can_sua: veHstt
        ? 'hồ sơ thanh toán'
        : NHAN_CAN_SUA[canSua ?? 'bang_ke'],
      ...(veHstt ? {} : { han_chap_nhan: addDays(today, g.sla_phan_hoi_dieu_chinh ?? 2) }),
    };
  } else {
    next = 'can_xu_ly_tay';
  }

  await sb.from('tracking').update({
    status: next,
    ket_qua_duyet: quyetDinh,
    nguoi_duyet: user.id,
    ngay_duyet: new Date().toISOString(),
    ghi_chu: ghiChu?.trim()
      ? `${row.ghi_chu ?? ''}\n[${tenNguoi(user)}] ${ghiChu.trim()}`.trim()
      : row.ghi_chu,
    ...extra,
  }).eq('id', trackingId);

  const NHAN_QD: Record<string, string> = {
    dong_y: 'Đồng ý — chốt bảng kê',
    can_sua: 'Cần sửa — chờ bản mới',
    tu_choi: 'Từ chối — chuyển xử lý tay',
    bo_qua: 'Bỏ qua — giữ nguyên trạng thái',
  };

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'approval.decide', entity: 'tracking', entityId: trackingId,
    before, after: { status: next, ket_qua_duyet: quyetDinh },
    note: `${tenNguoi(user)} duyệt ${row.ten_nhom} ${row.ky_doi_soat}: `
      + `${NHAN_QD[quyetDinh] ?? quyetDinh}`
      + (ghiChu?.trim() ? ` — ${ghiChu.trim()}` : ''),
  });

  // Chốt xong mà khách cần hồ sơ thanh toán thì báo kế toán ngay, kèm danh
  // mục giấy tờ lấy từ Master Data, để không phải nhớ hay tra lại.
  let nhacHstt: string | null = null;
  if (quyetDinh === 'dong_y' && canHstt && g.email_ke_toan) {
    try {
      const mail = tplNhacChuanBiHstt(
        g.ten_nhom, row.ky_doi_soat, g.ho_so_thanh_toan,
        g.sla_hstt ?? null, process.env.NEXT_PUBLIC_APP_URL ?? '');
      await sendMail({
        to: g.email_ke_toan,
        cc: g.email_pm ?? undefined,
        ...mail,
        threadId: row.internal_thread_id ?? undefined,
      });
      nhacHstt = g.ho_so_thanh_toan;
    } catch (e) {
      console.error('[duyet] không gửi được thư nhắc HSTT:', e);
    }
  }

  if (quyetDinh === 'dong_y' && canHstt) {
    await pushNotify({
      tieuDe: `${row.ten_nhom} ${row.ky_doi_soat} cần hồ sơ thanh toán`,
      noiDung: `Giấy tờ cần chuẩn bị: ${g.ho_so_thanh_toan}`,
      muc: 'canh_bao', lienKet: '/hstt',
      roles: ['admin', 'ke_toan'],
      entity: 'tracking', entityId: trackingId,
    });
  }
  if (quyetDinh === 'can_sua') {
    const viec = veHstt ? 'hồ sơ thanh toán' : NHAN_CAN_SUA[canSua ?? 'bang_ke'];

    if (g.email_ke_toan) {
      try {
        const mail = tplNhacSuaChungTu(
          row.ten_nhom, row.ky_doi_soat, viec, process.env.NEXT_PUBLIC_APP_URL ?? '');
        await sendMail({
          to: g.email_ke_toan, cc: g.email_pm ?? undefined, ...mail,
          threadId: row.internal_thread_id ?? undefined,
        });
      } catch (e) {
        console.error('[duyet] không gửi được thư nhắc sửa:', e);
      }
    }

    await pushNotify({
      tieuDe: `${row.ten_nhom} ${row.ky_doi_soat} cần chỉnh sửa ${viec}`,
      noiDung: 'Tải bản mới lên ở mục Tệp bảng kê, hệ thống gửi cho khách ngay.',
      muc: 'canh_bao', lienKet: '/files',
      roles: ['admin', 'ke_toan'],
      entity: 'tracking', entityId: trackingId,
    });
  }

  revalidatePath('/approvals');
  revalidatePath('/tracking');
  revalidatePath('/hstt');

  return { status: next, canHstt: canHstt && !veHstt, veHstt, hoSo: g.ho_so_thanh_toan ?? null, nhacHstt };
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
      html: tplMacDinhChot(row.ky_doi_soat, row.ten_nhom),
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
  message_id?: string;
  internal_thread_id?: string;
  han_chap_nhan?: string;
  ngay_gui_gan_nhat?: string;
  ngay_chot?: string;
  ngay_bat_dau_cho_file?: string;
  escalate_level?: number;
  so_vong_remind?: number;
  version_bang_ke?: number;
  link_file_bang_ke?: string;
  link_file_hstt?: string;
  ai_de_xuat?: string;
  ai_pham_vi?: string;
  ket_qua_duyet?: string;
  ghi_chu?: string;
  ly_do?: string;
  reset_remind?: boolean;
}) {
  const user = await requireRole('admin', 'pm', 'ke_toan');
  const sb = supabaseAdmin();

  const { data: before } = await sb.from('tracking').select('*').eq('id', trackingId).single();

  const FIELDS = [
    'status', 'thread_id', 'message_id', 'internal_thread_id',
    'han_chap_nhan', 'ngay_gui_gan_nhat', 'ngay_chot', 'ngay_bat_dau_cho_file',
    'escalate_level', 'so_vong_remind', 'version_bang_ke',
    'link_file_bang_ke', 'link_file_hstt',
    'ai_de_xuat', 'ai_pham_vi', 'ket_qua_duyet', 'ghi_chu',
  ] as const;

  const update: Record<string, unknown> = {};
  for (const k of FIELDS) {
    const v = patch[k];
    if (v !== undefined && v !== '') update[k] = v;
  }
  if (patch.reset_remind) update.ngay_remind_cuoi = null;

  if (Object.keys(update).length === 0) return;

  const { error } = await sb.from('tracking').update(update).eq('id', trackingId);
  if (error) throw new Error(error.message);

  // Chỉ ghi lại đúng những trường thực sự đổi, để nhật ký đọc được
  const changed: Record<string, { tu: unknown; thanh: unknown }> = {};
  for (const [k, v] of Object.entries(update)) {
    if (before && (before as any)[k] !== v) {
      changed[k] = { tu: (before as any)[k], thanh: v };
    }
  }

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'tracking.override', entity: 'tracking', entityId: trackingId,
    before, after: { thay_doi: changed },
    note: patch.ly_do?.trim()
      || `Sửa tay ${Object.keys(changed).length} trường`,
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

/**
 * Sửa đúng một ô trong lưới Master Data.
 *
 * Danh sách cột cho phép sửa được liệt kê tường minh chứ không nhận bừa tên
 * cột từ trình duyệt — nếu không, một request tự chế có thể ghi vào cột bất kỳ.
 */
const O_SUA_DUOC = {
  ma_he_thong: 'text', ten_nhom: 'text',
  ngung_hop_tac: 'bool',
  diem_gmv: 'int', diem_company_size: 'int', diem_tranh_chap: 'int', diem_phuc_tap: 'int',
  nhom_escalate: 'int',
  ngay_gui_bang_ke_hd: 'int', ngay_gui_bang_ke_thuc_te: 'int',
  sla_chap_nhan_hd: 'int', sla_chap_nhan_thuc_te: 'int',
  sla_phan_hoi_dieu_chinh: 'int', sla_ky_bien_ban: 'int', sla_hstt: 'int',
  payment_term: 'int',
  email_l1: 'text', email_l2: 'text', email_l3: 'text',
  email_ke_toan: 'text', email_pm: 'text', email_high_level: 'text', email_cc: 'text',
  ho_so_thanh_toan: 'text', ghi_chu: 'text',
} as const;

export type OMasterData = keyof typeof O_SUA_DUOC;

export async function capNhatO(groupId: string, cot: OMasterData, giaTri: unknown) {
  const user = await requireRole('admin', 'ke_toan');
  const kieu = O_SUA_DUOC[cot];
  if (!kieu) throw new Error(`Không sửa được cột "${cot}".`);

  const sb = supabaseAdmin();
  let v: unknown;

  if (kieu === 'bool') {
    v = Boolean(giaTri);
  } else if (kieu === 'int') {
    const s = String(giaTri ?? '').trim();
    if (s === '') v = null;
    else {
      const n = Number(s);
      if (!Number.isFinite(n)) throw new Error('Giá trị phải là số.');
      v = Math.trunc(n);
    }
  } else {
    const s = String(giaTri ?? '').trim();
    v = s === '' ? null : s;
  }

  // Hai cột này là khoá nghiệp vụ, không cho để trống
  if ((cot === 'ma_he_thong' || cot === 'ten_nhom') && !v) {
    throw new Error(cot === 'ma_he_thong'
      ? 'Mã hệ thống không được để trống.'
      : 'Tên nhóm không được để trống.');
  }
  if (cot === 'nhom_escalate' && v !== null && ![1, 2, 3].includes(v as number)) {
    throw new Error('Nhóm escalate chỉ nhận 1, 2 hoặc 3.');
  }

  const { data: before } = await sb
    .from('billing_groups').select(`id, ma_he_thong, ${cot}`).eq('id', groupId).single();

  const { error } = await sb.from('billing_groups').update({ [cot]: v }).eq('id', groupId);
  if (error) {
    if (error.code === '23505') throw new Error('Mã hệ thống này đã tồn tại ở nhóm khác.');
    throw new Error(error.message);
  }

  // Vài cột có bản sao ở bảng khác. Sửa một chỗ mà chỗ kia đứng yên là cách
  // nhanh nhất để hệ thống chạy theo dữ liệu cũ mà không ai biết.
  const lanToa: string[] = [];

  if (cot === 'ngung_hop_tac') {
    await sb.from('customers').update({ ngung_hop_tac: v as boolean }).eq('group_id', groupId);
    await sb.from('billing_schedules').update({ enabled: !(v as boolean) }).eq('group_id', groupId);
    lanToa.push('pháp nhân trực thuộc', 'lịch gửi');
  }

  if (cot === 'ma_he_thong') {
    await sb.from('tracking').update({ ma_he_thong: v as string }).eq('group_id', groupId);
    await sb.from('statement_files').update({ ma_he_thong: v as string }).eq('group_id', groupId);
    lanToa.push('các kỳ đang theo dõi', 'tệp đã tải lên');
  }

  if (cot === 'ten_nhom') {
    await sb.from('tracking').update({ ten_nhom: v as string }).eq('group_id', groupId);
    lanToa.push('các kỳ đang theo dõi');
  }

  // Ngày gửi và SLA thật nằm ở bảng lịch. Nhóm chỉ có một đợt thì đồng bộ
  // sang đợt đó, để hai màn hình không nói hai con số khác nhau.
  if (cot === 'ngay_gui_bang_ke_thuc_te' || cot === 'sla_chap_nhan_thuc_te') {
    const { data: lichs } = await sb
      .from('billing_schedules').select('id').eq('group_id', groupId);
    if (lichs?.length === 1) {
      const patch = cot === 'ngay_gui_bang_ke_thuc_te'
        ? { ngay_gui: v as number }
        : { sla_chap_nhan: v as number | null };
      if (cot !== 'ngay_gui_bang_ke_thuc_te' || v != null) {
        await sb.from('billing_schedules').update(patch).eq('id', lichs[0].id);
        lanToa.push('lịch gửi đợt 1');
      }
    }
  }

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'billing_group.update', entity: 'billing_groups', entityId: groupId,
    before, after: { [cot]: v },
    note: `${tenNguoi(user)} sửa ${cot} của ${before?.ma_he_thong ?? ''}`
      + (lanToa.length ? `, đồng bộ sang ${lanToa.join(', ')}` : ''),
  });

  revalidatePath('/master-data');
  revalidatePath('/tracking');
  return { ok: true, giaTri: v, lanToa };
}

/** Xoá một nhóm chưa từng phát sinh kỳ đối soát nào. */
export async function xoaNhom(groupId: string) {
  const user = await requireRole('admin');
  const sb = supabaseAdmin();

  const { count } = await sb.from('tracking')
    .select('id', { count: 'exact', head: true }).eq('group_id', groupId);
  if (count && count > 0) {
    throw new Error(`Nhóm này đã có ${count} kỳ đối soát nên không xoá được. `
      + 'Dùng "Ngưng hợp tác" để workflow bỏ qua.');
  }

  const { data: before } = await sb.from('billing_groups').select('*').eq('id', groupId).single();
  const { error } = await sb.from('billing_groups').delete().eq('id', groupId);
  if (error) throw new Error(error.message);

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'billing_group.delete', entity: 'billing_groups', entityId: groupId,
    before, note: `Xoá nhóm ${before?.ma_he_thong ?? ''}`,
  });

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

  const { data: sau, error } = await sb.from('workflow_schedules').update({
    enabled: form.enabled,
    schedule_kind: form.schedule_kind,
    run_at_hhmm: form.schedule_kind === 'daily' ? (form.run_at_hhmm || '08:00') : null,
    interval_minutes: form.schedule_kind === 'interval' ? (form.interval_minutes || 5) : null,
  }).eq('key', key).select('enabled, schedule_kind, run_at_hhmm, interval_minutes').single();

  if (error) throw new Error(`Không ghi được lịch: ${error.message}`);
  if (!sau) throw new Error('Không tìm thấy workflow này trong cơ sở dữ liệu.');

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'workflow.schedule_update', entity: 'workflow_schedules', entityId: key,
    before, after: form,
  });

  revalidatePath('/workflows');

  // Đọc lại từ database rồi mới báo thành công, để không bao giờ nói "đã lưu"
  // trong khi thực tế chưa ghi được gì
  return {
    xacNhan: sau.enabled
      ? (sau.schedule_kind === 'daily'
          ? `Đã lưu: bật, chạy ${sau.run_at_hhmm} hằng ngày.`
          : `Đã lưu: bật, chạy mỗi ${sau.interval_minutes} phút.`)
      : 'Đã lưu: workflow đang tắt.',
  };
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
  dot = 1, version?: number,
) {
  await requireRole('admin', 'ke_toan');

  const { data: g } = await supabaseAdmin()
    .from('billing_groups').select('ma_he_thong').eq('id', groupId).maybeSingle();
  if (!g) throw new Error('Không tìm thấy nhóm đối soát.');

  if (!/^T\d{2}\.\d{4}$/.test(ky)) {
    throw new Error('Kỳ đối soát phải viết dạng T07.2026.');
  }

  // Tệp thứ hai trở đi trong cùng một lô dùng lại số bản của tệp đầu, để cả
  // lô cùng một bản và đi chung một email.
  const ban = version ?? await nextVersion(groupId, ky, kind, dot);
  return {
    path: buildPath(g.ma_he_thong, ky, kind, ban, fileName, dot),
    version: ban,
    maHeThong: g.ma_he_thong,
  };
}

/**
 * Kiểm tra trước khi tải lên, trả về những cảnh báo cần hỏi lại người dùng.
 *
 * Ba tình huống đáng dừng lại: loại tệp này đã gửi rồi, kỳ đã chốt mà lại
 * định gửi bản sửa, và hồ sơ thanh toán đã gửi mà gửi tiếp.
 */
export async function kiemTraTruocKhiGui(
  groupId: string, ky: string, kind: FileKind, dot = 1,
) {
  await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();

  const [{ data: daGui }, { data: tr }] = await Promise.all([
    sb.from('statement_files')
      .select('file_name, version, sent_at')
      .eq('group_id', groupId).eq('ky_doi_soat', ky)
      .eq('kind', kind).eq('dot', dot)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('tracking').select('status, ngay_chot, ket_qua_duyet, ten_file_hstt_da_gui')
      .eq('group_id', groupId).eq('ky_doi_soat', ky).eq('dot', dot).maybeSingle(),
  ]);

  const CHOT = ['da_chot', 'hoan_tat_cho_thanh_toan', 'mac_dinh_chap_thuan',
    'cho_ho_so_thanh_toan', 'da_gui_ho_so_thanh_toan'];

  const canhBao: { loai: string; tieuDe: string; noiDung: string }[] = [];

  if (kind === 'bang_ke' && tr && CHOT.includes(tr.status)) {
    canhBao.push({
      loai: 'da_chot',
      tieuDe: 'Kỳ này đã chốt rồi',
      noiDung: `Kỳ này đã chốt ngày ${tr.ngay_chot ?? '—'}`
        + `${tr.ket_qua_duyet === 'dong_y' ? ' với kết quả Đồng ý' : ''}. `
        + 'Gửi bản chỉnh sửa sẽ mở lại đồng hồ SLA và đưa kỳ về trạng thái chờ '
        + 'khách xác nhận lại từ đầu.',
    });
  }

  if (kind === 'hstt' && tr?.status === 'da_gui_ho_so_thanh_toan') {
    canhBao.push({
      loai: 'hstt_da_gui',
      tieuDe: 'Hồ sơ thanh toán đã gửi rồi',
      noiDung: `Đã gửi hồ sơ thanh toán cho khách này`
        + `${tr.ten_file_hstt_da_gui ? ` (${tr.ten_file_hstt_da_gui})` : ''}.`,
    });
  }

  if (daGui) {
    canhBao.push({
      loai: 'trung_loai',
      tieuDe: 'Loại tệp này đã gửi rồi',
      noiDung: `Bạn đã gửi ${daGui.file_name} (bản ${daGui.version}) vào ngày `
        + `${new Date(daGui.sent_at as string).toLocaleDateString('vi-VN')}.`,
    });
  }

  return { canhBao, coCanhBao: canhBao.length > 0 };
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
  dot?: number;
  batchId: string;
  version: number;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  guiNgay: boolean;
  ghiChu?: string;
  /** Người dùng đã xác nhận muốn gửi dù loại tệp này từng gửi rồi. */
  chapNhanGuiLai?: { lyDo: string };
  /** Chỉ dùng cho hồ sơ thanh toán: khách có phải xác nhận lại không. */
  hsttCanXacNhan?: boolean;
}) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();

  const { data: g } = await sb
    .from('billing_groups').select('ma_he_thong').eq('id', input.groupId).single();

  const { data: file, error } = await sb.from('statement_files').insert({
    group_id: input.groupId,
    ma_he_thong: g!.ma_he_thong,
    ky_doi_soat: input.ky,
    dot: input.dot ?? 1,
    batch_id: input.batchId,
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
      const r = await guiLoChoKhach(input.batchId, input.hsttCanXacNhan);
      if (r.sent) {
        const { data: tr } = await sb.from('tracking').select('id')
          .eq('group_id', input.groupId).eq('ky_doi_soat', input.ky).maybeSingle();
        await sb.from('send_log').insert({
          file_id: file.id, tracking_id: tr?.id ?? null,
          ma_he_thong: g!.ma_he_thong, ky_doi_soat: input.ky,
          kind: input.kind, version: input.version, file_name: input.fileName,
          den: (r.mail as any)?.den ?? null, cc: (r.mail as any)?.cc ?? null,
          la_gui_lai: Boolean(input.chapNhanGuiLai),
          ly_do_gui_lai: input.chapNhanGuiLai?.lyDo ?? null,
          nguoi_gui: user.id, nguon: 'thu_cong',
        });
      }
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
  return { ketQua, fileId: file.id as string };
}

/**
 * Kiểm tra xem loại tệp này đã từng gửi cho khách chưa.
 * Dùng để hỏi lại trước khi gửi trùng, thay vì lặng lẽ gửi lần hai.
 */
export async function kiemTraDaGui(groupId: string, ky: string, kind: FileKind) {
  await requireRole('admin', 'ke_toan');
  const { data } = await supabaseAdmin()
    .from('statement_files')
    .select('file_name, version, sent_at')
    .eq('group_id', groupId).eq('ky_doi_soat', ky).eq('kind', kind)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1).maybeSingle();

  if (!data) return { daGui: false as const };
  return {
    daGui: true as const,
    ngay: data.sent_at as string,
    tenTep: data.file_name as string,
    ban: data.version as number,
  };
}

/** Gửi tay một tệp đã lưu. Gửi lại phải nêu lý do. */
export async function guiTepNgay(fileId: string, guiLai?: { lyDo: string }) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();

  const { data: file } = await sb
    .from('statement_files').select('*').eq('id', fileId).maybeSingle();
  if (!file) throw new Error('Không tìm thấy tệp.');

  const daGuiTruoc = Boolean(file.sent_at);
  if (daGuiTruoc && !guiLai?.lyDo?.trim()) {
    throw new Error('Tệp này đã gửi rồi. Muốn gửi lại phải nêu lý do.');
  }

  // Cho gửi lại bằng cách xoá dấu đã gửi, nhưng lưu lại dấu vết ở send_log
  if (daGuiTruoc) {
    await sb.from('statement_files').update({ sent_at: null }).eq('id', fileId);
  }

  const r = await guiTepChoKhach(fileId);

  if (r.sent) {
    const { data: tr } = await sb.from('tracking').select('id')
      .eq('group_id', file.group_id).eq('ky_doi_soat', file.ky_doi_soat).maybeSingle();

    await sb.from('send_log').insert({
      file_id: fileId,
      tracking_id: tr?.id ?? null,
      ma_he_thong: file.ma_he_thong,
      ky_doi_soat: file.ky_doi_soat,
      kind: file.kind,
      version: file.version,
      file_name: file.file_name,
      den: (r.mail as any)?.den ?? null,
      cc: (r.mail as any)?.cc ?? null,
      la_gui_lai: daGuiTruoc,
      ly_do_gui_lai: guiLai?.lyDo?.trim() ?? null,
      nguoi_gui: user.id,
      nguon: 'thu_cong',
    });
  } else if (daGuiTruoc) {
    // Gửi hỏng thì trả lại dấu đã gửi cũ, không để tệp thành "chưa gửi"
    await sb.from('statement_files').update({ sent_at: file.sent_at }).eq('id', fileId);
  }

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: daGuiTruoc ? 'file.resend' : 'file.send',
    entity: 'statement_files', entityId: fileId,
    note: daGuiTruoc
      ? `${tenNguoi(user)} GỬI LẠI ${file.file_name} (${file.ky_doi_soat}) — ${guiLai!.lyDo.trim()}`
      : `${tenNguoi(user)}: ${r.message}`,
  });

  revalidatePath('/files');
  revalidatePath('/tracking');
  revalidatePath('/hstt');
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
export async function xemTep(storagePath: string, fileName?: string) {
  await requireRole('admin', 'ke_toan', 'pm', 'high_level');
  const url = await previewUrl(storagePath, 300, fileName);
  if (!url) throw new Error('Không mở được tệp.');
  return url;
}

// =====================================================================
// Thông báo
// =====================================================================

export async function danhDauDaDoc(notiId: string) {
  const user = await requireRole('admin', 'ke_toan', 'pm', 'high_level');
  const sb = supabaseAdmin();

  const { data } = await sb.from('notifications')
    .select('da_doc_boi').eq('id', notiId).maybeSingle();
  const cu: string[] = data?.da_doc_boi ?? [];
  if (cu.includes(user.id)) return;

  await sb.from('notifications')
    .update({ da_doc_boi: [...cu, user.id] }).eq('id', notiId);
}

export async function danhDauDocHet() {
  const user = await requireRole('admin', 'ke_toan', 'pm', 'high_level');
  const sb = supabaseAdmin();

  const { data } = await sb.from('notifications')
    .select('id, da_doc_boi').order('created_at', { ascending: false }).limit(100);

  for (const n of data ?? []) {
    const cu: string[] = n.da_doc_boi ?? [];
    if (!cu.includes(user.id)) {
      await sb.from('notifications').update({ da_doc_boi: [...cu, user.id] }).eq('id', n.id);
    }
  }
  revalidatePath('/');
}

/** Gửi cả một lô tệp cho khách. Gửi lại phải nêu lý do. */
export async function guiLoNgay(
  batchId: string,
  guiLai?: { lyDo: string },
  hsttCanXacNhan?: boolean,
) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();

  const { data: lo } = await sb.from('statement_files')
    .select('*').eq('batch_id', batchId).order('uploaded_at');
  if (!lo?.length) throw new Error('Không tìm thấy lô tệp.');

  const dau = lo[0];
  const daGuiTruoc = lo.some((f: any) => f.sent_at);

  if (daGuiTruoc) {
    if (!guiLai?.lyDo?.trim()) throw new Error('Lô này đã gửi rồi. Muốn gửi lại phải nêu lý do.');
    await sb.from('statement_files').update({ sent_at: null }).eq('batch_id', batchId);
  }

  const r = await guiLoChoKhach(batchId, hsttCanXacNhan);

  if (r.sent) {
    const { data: tr } = await sb.from('tracking').select('id')
      .eq('group_id', dau.group_id).eq('ky_doi_soat', dau.ky_doi_soat)
      .eq('dot', dau.dot).maybeSingle();

    await sb.from('send_log').insert({
      batch_id: batchId,
      file_id: dau.id,
      tracking_id: tr?.id ?? null,
      ma_he_thong: dau.ma_he_thong,
      ky_doi_soat: dau.ky_doi_soat,
      dot: dau.dot,
      kind: dau.kind,
      version: dau.version,
      so_tep: lo.length,
      file_name: lo.map((f: any) => f.file_name).join(', '),
      den: (r.mail as any)?.den ?? null,
      cc: (r.mail as any)?.cc ?? null,
      la_gui_lai: daGuiTruoc,
      ly_do_gui_lai: guiLai?.lyDo?.trim() ?? null,
      nguoi_gui: user.id,
      nguon: 'thu_cong',
    });
  }

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: daGuiTruoc ? 'file.resend' : 'file.send',
    entity: 'statement_files', entityId: batchId,
    note: daGuiTruoc
      ? `${tenNguoi(user)} GỬI LẠI ${lo.length} tệp (${dau.ky_doi_soat}) — ${guiLai!.lyDo.trim()}`
      : `${tenNguoi(user)}: ${r.message}`,
  });

  revalidatePath('/files');
  revalidatePath('/tracking');
  revalidatePath('/hstt');
  return r;
}

// =====================================================================
// Lịch gửi bảng kê
// =====================================================================

export async function luuLichGui(input: {
  id?: string;
  groupId: string;
  dot: number;
  ngayGui: number;
  kyThuocThang: 'thang_nay' | 'thang_truoc';
  phamViNhan?: string;
  slaChapNhan?: number | null;
  enabled: boolean;
  ghiChu?: string;
}) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();

  if (input.ngayGui < 1 || input.ngayGui > 31) {
    throw new Error('Ngày gửi phải nằm trong khoảng 1 đến 31.');
  }
  if (input.dot < 1 || input.dot > 6) {
    throw new Error('Số đợt phải nằm trong khoảng 1 đến 6.');
  }

  const payload = {
    group_id: input.groupId,
    dot: input.dot,
    ngay_gui: input.ngayGui,
    ky_thuoc_thang: input.kyThuocThang,
    pham_vi_nhan: input.phamViNhan?.trim() || null,
    sla_chap_nhan: input.slaChapNhan ?? null,
    enabled: input.enabled,
    ghi_chu: input.ghiChu?.trim() || null,
  };

  if (input.id) {
    const { data: before } = await sb
      .from('billing_schedules').select('*').eq('id', input.id).single();
    const { error } = await sb.from('billing_schedules').update(payload).eq('id', input.id);
    if (error) {
      if (error.code === '23505') throw new Error(`Nhóm này đã có đợt ${input.dot}.`);
      throw new Error(error.message);
    }
    await writeAudit({
      actorId: user.id, actorEmail: user.email,
      action: 'schedule.update', entity: 'billing_schedules', entityId: input.id,
      before, after: payload,
      note: `${tenNguoi(user)} sửa lịch đợt ${input.dot}, gửi ngày ${input.ngayGui}`,
    });
  } else {
    const { data, error } = await sb
      .from('billing_schedules').insert(payload).select('id').single();
    if (error) {
      if (error.code === '23505') throw new Error(`Nhóm này đã có đợt ${input.dot}.`);
      throw new Error(error.message);
    }
    await writeAudit({
      actorId: user.id, actorEmail: user.email,
      action: 'schedule.create', entity: 'billing_schedules', entityId: data.id,
      after: payload,
      note: `${tenNguoi(user)} thêm lịch đợt ${input.dot}, gửi ngày ${input.ngayGui}`,
    });
  }

  revalidatePath('/master-data');
}

export async function xoaLichGui(id: string) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();

  const { data: before } = await sb
    .from('billing_schedules').select('*').eq('id', id).single();
  if (!before) throw new Error('Không tìm thấy lịch này.');

  const { count } = await sb.from('billing_schedules')
    .select('id', { count: 'exact', head: true }).eq('group_id', before.group_id);
  if ((count ?? 0) <= 1) {
    throw new Error('Mỗi nhóm phải giữ ít nhất một lịch gửi. '
      + 'Muốn dừng gửi thì tắt lịch thay vì xoá.');
  }

  const { error } = await sb.from('billing_schedules').delete().eq('id', id);
  if (error) throw new Error(error.message);

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'schedule.delete', entity: 'billing_schedules', entityId: id,
    before, note: `${tenNguoi(user)} xoá lịch đợt ${before.dot}`,
  });

  revalidatePath('/master-data');
}

// =====================================================================
// Pháp nhân trực thuộc
// =====================================================================

export async function luuPhapNhan(input: {
  id?: string;
  groupId: string;
  tenKhachHang: string;
  tenVietTat?: string;
  code?: string;
  ngungHopTac?: boolean;
  ghiChu?: string;
}) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();

  if (!input.tenKhachHang.trim()) throw new Error('Tên khách hàng không được để trống.');

  const payload = {
    group_id: input.groupId,
    ten_khach_hang: input.tenKhachHang.trim(),
    ten_viet_tat: input.tenVietTat?.trim() || null,
    code: input.code?.trim() || null,
    ngung_hop_tac: input.ngungHopTac ?? false,
    ghi_chu: input.ghiChu?.trim() || null,
  };

  if (input.id) {
    const { data: before } = await sb.from('customers').select('*').eq('id', input.id).single();
    const { error } = await sb.from('customers').update(payload).eq('id', input.id);
    if (error) throw new Error(error.message);
    await writeAudit({
      actorId: user.id, actorEmail: user.email,
      action: 'customer.update', entity: 'customers', entityId: input.id,
      before, after: payload,
      note: `${tenNguoi(user)} sửa pháp nhân ${payload.ten_khach_hang}`,
    });
  } else {
    const { data, error } = await sb.from('customers').insert(payload).select('id').single();
    if (error) throw new Error(error.message);
    await writeAudit({
      actorId: user.id, actorEmail: user.email,
      action: 'customer.create', entity: 'customers', entityId: data.id, after: payload,
      note: `${tenNguoi(user)} thêm pháp nhân ${payload.ten_khach_hang}`,
    });
  }

  revalidatePath('/master-data');
}

export async function xoaPhapNhan(id: string) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();

  const { data: before } = await sb.from('customers').select('*').eq('id', id).single();
  if (!before) throw new Error('Không tìm thấy pháp nhân này.');

  const { error } = await sb.from('customers').delete().eq('id', id);
  if (error) throw new Error(error.message);

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'customer.delete', entity: 'customers', entityId: id,
    before, note: `${tenNguoi(user)} xoá pháp nhân ${before.ten_khach_hang}`,
  });

  revalidatePath('/master-data');
}

// =====================================================================
// Trả lời khách trực tiếp từ màn hình duyệt
// =====================================================================

/**
 * Gửi một thư do kế toán tự soạn vào đúng thread của kỳ.
 *
 * Không đổi trạng thái kỳ. Kế toán có thể hỏi lại khách rồi để nguyên chờ
 * trả lời, hoặc trả lời xong mới bấm quyết định — hai việc tách rời nhau.
 *
 * Tệp đính kèm đã được trình duyệt tải thẳng lên kho trước khi gọi hàm này,
 * ở đây chỉ ghi nhận và đính vào thư.
 */
export async function traLoiKhach(input: {
  trackingId: string;
  noiDung: string;
  /** Tệp đã tải lên kho trước đó, truyền id để đính kèm. */
  fileIds?: string[];
}) {
  const user = await requireRole('admin', 'ke_toan');
  const sb = supabaseAdmin();

  if (!input.noiDung?.trim()) throw new Error('Nội dung thư không được để trống.');

  const { data: row } = await sb
    .from('tracking').select('*, billing_groups!inner(*)').eq('id', input.trackingId).single();
  if (!row) throw new Error('Không tìm thấy kỳ đối soát này.');

  const g = (row as any).billing_groups;
  if (!g.email_l1?.includes('@')) {
    throw new Error('Nhóm này chưa khai báo email đầu mối khách hàng.');
  }
  if (!row.thread_id) {
    throw new Error('Kỳ này chưa có thread email, chưa gửi bảng kê lần nào.');
  }

  const attachments: { filename: string; mimeType: string; data: Buffer }[] = [];
  const tenTep: string[] = [];

  if (input.fileIds?.length) {
    const { data: files } = await sb
      .from('statement_files').select('*').in('id', input.fileIds);
    for (const f of files ?? []) {
      attachments.push({
        filename: f.file_name,
        mimeType: f.mime_type ?? mimeFor(f.file_name),
        data: await taiTepVe(f.storage_path),
      });
      tenTep.push(f.file_name);
    }
  }

  const cc = [g.email_ke_toan, g.email_cc].filter(Boolean).join(',') || undefined;
  const nhanKy = periodFull(row.ky_doi_soat, row.pham_vi_nhan, row.dot);

  await sendMail({
    to: g.email_l1,
    cc,
    subject: refSubject(row.ten_nhom, nhanKy),
    html: tplTraLoiKhach(row.ten_nhom, row.ky_doi_soat, input.noiDung.trim(), attachments.length),
    attachments: attachments.length ? attachments : undefined,
    threadId: row.thread_id,
  });

  if (input.fileIds?.length) {
    await sb.from('statement_files')
      .update({ sent_at: new Date().toISOString() }).in('id', input.fileIds);
  }

  await sb.from('reply_log').insert({
    tracking_id: input.trackingId,
    ma_he_thong: row.ma_he_thong,
    ky_doi_soat: row.ky_doi_soat,
    dot: row.dot ?? 1,
    noi_dung: input.noiDung.trim(),
    so_tep: attachments.length,
    ten_tep: tenTep.join(', ') || null,
    den: g.email_l1,
    cc: cc ?? null,
    nguoi_gui: user.id,
  });

  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'reply.send', entity: 'tracking', entityId: input.trackingId,
    note: `${tenNguoi(user)} trả lời ${row.ten_nhom} ${nhanKy}`
      + (attachments.length ? ` kèm ${attachments.length} tệp` : '')
      + `: ${input.noiDung.trim().slice(0, 160)}`,
  });

  await pushNotify({
    tieuDe: `Đã trả lời ${row.ten_nhom} ${nhanKy}`,
    noiDung: input.noiDung.trim().slice(0, 120),
    muc: 'info', lienKet: '/approvals',
    roles: ['admin', 'ke_toan', 'pm'],
    entity: 'tracking', entityId: input.trackingId,
  });

  revalidatePath('/approvals');
  revalidatePath('/tracking');
  revalidatePath('/files');

  return { soTep: attachments.length };
}

/** Chỗ lưu tệp đính kèm của thư trao đổi. */
export async function xinChoLuuTepTraLoi(trackingId: string, fileName: string) {
  await requireRole('admin', 'ke_toan');
  const { data: row } = await supabaseAdmin()
    .from('tracking').select('ma_he_thong, ky_doi_soat, dot').eq('id', trackingId).single();
  if (!row) throw new Error('Không tìm thấy kỳ đối soát này.');

  return {
    path: buildPath(row.ma_he_thong, row.ky_doi_soat, 'trao_doi', 1, fileName, row.dot),
  };
}

// =====================================================================
// Trả lời khách trong lúc trao đổi
