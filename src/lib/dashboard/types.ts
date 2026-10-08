// Kiểu dữ liệu dòng trong các bảng fin_* (tiền: VND nguyên, tỷ lệ: thập phân)
export interface Customer { ma_kh: string; ten_kh: string; ten_viet_tat: string | null; nhom: string; pm: string | null; sales: string | null; credit_term: number | null; ma_he_thong?: string | null }
export interface Supplier { ma_ncc: string; ten_ncc: string; nganh: string; payment_term: number; partnership: string | null }
export interface Staff { ho_ten: string; team: string; truc: string | null; tl_pool_gmv: number | null; tl_pool_hd: number | null; tl_partnership: number | null }
export interface PmAlloc { nhom: string; pm: string; so_khach: number }
export interface Target {
  ky: string; gmv_hotel: number | null; gmv_flight: number | null; gmv_n2: number | null; gmv_n3: number | null; gmv_n4: number | null; gmv_n5: number | null;
  gmv_saas_t: number | null; gmv_saas_m: number | null; gmv_fnb: number | null;
  kh_n1: number | null; kh_n2: number | null; kh_n3: number | null; kh_n4: number | null; kh_n5: number | null; opex_budget: number | null;
}
export interface GmvRow { ky: string; ma_kh: string; ma_ncc: string | null; dich_vu: string; gmv: number; gia_von: number; chiet_khau: number | null;
  /** Dòng nhập tay trên web (không có trong file) */
  tay?: boolean }
export interface ArRow { ma_kh: string; ky: string; so_ct: string | null; ngay_gui_bk: string | null; ngay_hd: string | null; ngay_den_han: string; so_tien: number; da_thu: number | null; ngay_thu_du: string | null; ngay_thu_gan_nhat: string | null;
  /** Nguồn của dòng: file template, sửa tay trên web, hay lấy từ app Reconciliation */
  nguonBK?: "file" | "web" | "recon"; suaTay?: boolean; ghi_chu?: string | null;
  /** Dòng này đang nhận số sửa ở mức KỲ (không phải sửa riêng từng hóa đơn) */
  suaKy?: boolean;
  /** Dòng do người dùng thêm trên web, file không có */
  tuTao?: boolean }
export interface ApRow { ma_ncc: string; ky: string | null; so_ct: string | null; ngay_hd: string; ngay_den_han: string; so_tien: number; da_tra: number | null; ngay_tra: string | null; suaTay?: boolean; suaKy?: boolean; ghi_chu?: string | null; tuTao?: boolean }
export interface CashRow { ky_nua_thang: string; khoan_muc: string; ke_hoach: number | null; thuc_hien: number | null }
export interface OpexRow { ky: string; khoan_muc: string; so_tien: number }
export interface Contract { ma_kh: string; nhom: string; sales: string; ngay_ky: string; so_user: number | null }
export interface UploadLog { id: number; file_name: string | null; uploaded_at: string; summary: Record<string, unknown> | null }
export interface Snapshot { ky: string; data: Record<string, unknown>; locked_at: string; note: string | null }
/** Một ô đã sửa tay trên web — đắp lên dòng gốc đọc từ file template */
export interface ArEdit {
  ma_kh: string; ky: string; so_ct: string;
  ngay_gui_bk: string | null; ngay_hd: string | null; ngay_den_han: string | null;
  so_tien: number | null; da_thu: number | null; ngay_thu_du: string | null; ngay_thu_gan_nhat: string | null;
  ghi_chu: string | null; tu_tao: boolean; xoa: boolean; updated_by: string | null; updated_at: string;
}
export interface ApEdit {
  ma_ncc: string; ky: string; so_ct: string;
  ngay_hd: string | null; ngay_den_han: string | null;
  so_tien: number | null; da_tra: number | null; ngay_tra: string | null;
  ghi_chu: string | null; tu_tao: boolean; xoa: boolean; updated_by: string | null; updated_at: string;
}
/** Một ô số tổng nhập thẳng trên dashboard, đắp lên số đọc từ file template */
export interface ManualRow { nhom: "target" | "gmv" | "gmvkh" | "opex" | "cash"; ky: string; khoa: string; gia_tri: number | null; ghi_chu: string | null; updated_by: string | null; updated_at: string }

/** Tiến độ bảng kê lấy từ app Reconciliation (bảng tracking), khóa "maKH|kỳ" */
export interface BangKe { gui: string | null; chot: string | null; status: string | null; nhom: string }

/** Theo dõi xử lý cảnh báo — người nhận việc, hạn, hành động, trạng thái */
export interface AlertAction { id: string; ky: string; pic: string | null; han_xu_ly: string | null; hanh_dong: string | null; trang_thai: string; updated_at: string }

export interface DataSet {
  params: Record<string, string>;
  customers: Customer[]; suppliers: Supplier[]; staff: Staff[]; alloc: PmAlloc[]; targets: Target[];
  gmv: GmvRow[]; ar: ArRow[]; ap: ApRow[]; cash: CashRow[]; opex: OpexRow[]; contracts: Contract[];
  uploads: UploadLog[]; snapshots: Snapshot[]; alertActions: AlertAction[];
  arEdits: ArEdit[]; apEdits: ApEdit[]; manual: ManualRow[]; bangKe: Record<string, BangKe>;
  me?: { email: string; role: string; canEdit: boolean };
}

export type Row = Record<string, string | number | null>;
