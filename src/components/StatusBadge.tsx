import { STATUS_LABEL, TrackingStatus } from '@/lib/types';

/** Bốn mức nghiêm trọng, không thêm mức thứ năm. */
const TONE: Record<TrackingStatus, string> = {
  chua_gui:                'pill-neutral',
  cho_file_da_nhac_noi_bo: 'pill-high',
  da_gui_bang_ke:          'pill-watch',
  da_nhan_phan_hoi:        'pill-watch',
  cho_duyet_phan_loai:     'pill-high',
  can_chinh_sua:           'pill-high',
  da_chot:                 'pill-stable',
  cho_ho_so_thanh_toan:    'pill-high',
  da_gui_ho_so_thanh_toan: 'pill-stable',
  hoan_tat_cho_thanh_toan: 'pill-stable',
  mac_dinh_chap_thuan:     'pill-stable',
  can_xu_ly_tay:           'pill-critical',
  cho_xac_nhan_hstt:       'pill-watch',
  can_chinh_sua_hstt:      'pill-high',
};

export function StatusBadge({ status }: { status: TrackingStatus }) {
  return (
    <span className={`pill pill-dot ${TONE[status] ?? 'pill-neutral'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
