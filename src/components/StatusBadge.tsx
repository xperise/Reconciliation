import { STATUS_LABEL, TrackingStatus } from '@/lib/types';

const TONE: Record<TrackingStatus, string> = {
  chua_gui: 'badge-slate',
  cho_file_da_nhac_noi_bo: 'badge-amber',
  da_gui_bang_ke: 'badge-teal',
  da_nhan_phan_hoi: 'badge-violet',
  cho_duyet_phan_loai: 'badge-violet',
  can_chinh_sua: 'badge-amber',
  da_chot: 'badge-teal',
  cho_ho_so_thanh_toan: 'badge-amber',
  da_gui_ho_so_thanh_toan: 'badge-teal',
  hoan_tat_cho_thanh_toan: 'badge-teal',
  mac_dinh_chap_thuan: 'badge-teal',
  can_xu_ly_tay: 'badge-red',
};

export function StatusBadge({ status }: { status: TrackingStatus }) {
  return <span className={`badge ${TONE[status] ?? 'badge-slate'}`}>{STATUS_LABEL[status] ?? status}</span>;
}
