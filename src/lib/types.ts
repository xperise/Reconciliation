export type UserRole = 'admin' | 'ke_toan' | 'pm' | 'high_level';

export type TrackingStatus =
  | 'chua_gui'
  | 'cho_file_da_nhac_noi_bo'
  | 'da_gui_bang_ke'
  | 'da_nhan_phan_hoi'
  | 'cho_duyet_phan_loai'
  | 'can_chinh_sua'
  | 'da_chot'
  | 'cho_ho_so_thanh_toan'
  | 'da_gui_ho_so_thanh_toan'
  | 'hoan_tat_cho_thanh_toan'
  | 'mac_dinh_chap_thuan'
  | 'can_xu_ly_tay';

/** Nhãn tiếng Việt hiển thị trên giao diện. */
export const STATUS_LABEL: Record<TrackingStatus, string> = {
  chua_gui: 'Chưa gửi',
  cho_file_da_nhac_noi_bo: 'Chờ file — đã nhắc nội bộ',
  da_gui_bang_ke: 'Đã gửi bảng kê',
  da_nhan_phan_hoi: 'Khách đã trả lời',
  cho_duyet_phan_loai: 'Chờ kế toán duyệt',
  can_chinh_sua: 'Cần chỉnh sửa',
  da_chot: 'Đã chốt',
  cho_ho_so_thanh_toan: 'Chờ hồ sơ thanh toán',
  da_gui_ho_so_thanh_toan: 'Đã gửi hồ sơ thanh toán',
  hoan_tat_cho_thanh_toan: 'Hoàn tất — chờ thanh toán',
  mac_dinh_chap_thuan: 'Mặc định chấp thuận',
  can_xu_ly_tay: 'Cần xử lý tay',
};

/** Trạng thái đã kết thúc — WF1 và WF4 bỏ qua. */
export const STATUS_DONE: TrackingStatus[] = [
  'da_chot',
  'hoan_tat_cho_thanh_toan',
  'mac_dinh_chap_thuan',
  'da_gui_ho_so_thanh_toan',
  'can_xu_ly_tay',
];

/** Trạng thái nghĩa là WF1 đã chạm tới kỳ này rồi, không gửi lại. */
export const STATUS_WF1_SKIP: TrackingStatus[] = [
  'da_gui_bang_ke',
  'da_nhan_phan_hoi',
  'cho_duyet_phan_loai',
  'can_chinh_sua',
  ...STATUS_DONE,
];

/** Nhóm đối soát — đơn vị nhận bảng kê. 1 nhóm = 1 file = 1 thread. */
export type BillingGroup = {
  id: string;
  ma_he_thong: string;
  ten_nhom: string;
  ngung_hop_tac: boolean;
  diem_gmv: number | null;
  diem_company_size: number | null;
  diem_tranh_chap: number | null;
  diem_phuc_tap: number | null;
  tong_diem: number | null;
  nhom_escalate: 1 | 2 | 3;
  ngay_gui_bang_ke_hd: number | null;
  ngay_gui_bang_ke_thuc_te: number | null;
  sla_chap_nhan_hd: number | null;
  sla_chap_nhan_thuc_te: number | null;
  sla_phan_hoi_dieu_chinh: number | null;
  sla_ky_bien_ban: number | null;
  sla_hstt: number | null;
  payment_term: number | null;
  email_l1: string | null;
  email_l2: string | null;
  email_l3: string | null;
  email_ke_toan: string | null;
  email_pm: string | null;
  email_high_level: string | null;
  email_cc: string | null;
  ho_so_thanh_toan: string | null;
  ghi_chu: string | null;
};

/** Pháp nhân trực thuộc một nhóm đối soát. */
export type Customer = {
  id: string;
  group_id: string;
  code: string | null;
  ten_khach_hang: string;
  ten_viet_tat: string | null;
  ngung_hop_tac: boolean;
  ghi_chu: string | null;
};

/** Ngày gửi và SLA thực dùng: ưu tiên giá trị áp dụng thực tế, rơi về hợp đồng. */
export function effectiveDueDay(g: BillingGroup): number | null {
  return g.ngay_gui_bang_ke_thuc_te ?? g.ngay_gui_bang_ke_hd ?? null;
}

/** SLA khách chấp nhận bảng kê. Rơi về mặc định theo nhóm khi không khai báo. */
export function effectiveSlaChapNhan(g: BillingGroup): number {
  const explicit = g.sla_chap_nhan_thuc_te ?? g.sla_chap_nhan_hd;
  if (explicit && explicit > 0) return explicit;
  return { 1: 3, 2: 3, 3: 5 }[g.nhom_escalate] ?? 3;
}

export type Tracking = {
  id: string;
  group_id: string;
  ma_he_thong: string;
  ten_nhom: string;
  ky_doi_soat: string;
  status: TrackingStatus;
  ngay_gui_gan_nhat: string | null;
  link_file_bang_ke: string | null;
  ten_file_da_gui: string | null;
  link_file_hstt: string | null;
  ten_file_hstt_da_gui: string | null;
  thread_id: string | null;
  message_id: string | null;
  internal_thread_id: string | null;
  han_chap_nhan: string | null;
  escalate_level: number;
  so_vong_remind: number;
  ngay_remind_cuoi: string | null;
  ai_de_xuat: string | null;
  ai_pham_vi: string | null;
  ai_do_tin_cay: number | null;
  email_khach_goc: string | null;
  ngay_bat_dau_cho_file: string | null;
  ghi_chu: string | null;
  ket_qua_duyet: string | null;
  ngay_chot: string | null;
  version_bang_ke: number;
};

export type FileKind = 'bang_ke' | 'hstt';

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  bang_ke: 'Bảng kê',
  hstt: 'Hồ sơ thanh toán',
};

export type WorkflowKey = 'wf1' | 'wf2' | 'wf3' | 'wf4';

export type WorkflowSchedule = {
  key: WorkflowKey;
  ten: string;
  mo_ta: string | null;
  enabled: boolean;
  schedule_kind: 'daily' | 'interval';
  run_at_hhmm: string | null;
  interval_minutes: number | null;
  timezone: string;
  last_run_at: string | null;
  last_status: string | null;
  last_summary: string | null;
};

/** Kết quả một lượt chạy workflow, ghi vào bảng workflow_runs. */
export type RunResult = {
  ok: number;
  failed: number;
  summary: string;
  detail: unknown[];
};
