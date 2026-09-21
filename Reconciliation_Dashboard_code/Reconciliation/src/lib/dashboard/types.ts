// Kiểu dữ liệu dòng trong các bảng fin_* (tiền: VND nguyên, tỷ lệ: thập phân)
export interface Customer { ma_kh: string; ten_kh: string; ten_viet_tat: string | null; nhom: string; pm: string | null; sales: string | null; credit_term: number | null }
export interface Supplier { ma_ncc: string; ten_ncc: string; nganh: string; payment_term: number; partnership: string | null }
export interface Staff { ho_ten: string; team: string; truc: string | null; tl_pool_gmv: number | null; tl_pool_hd: number | null; tl_partnership: number | null }
export interface PmAlloc { nhom: string; pm: string; so_khach: number }
export interface Target {
  ky: string; gmv_hotel: number | null; gmv_flight: number | null; gmv_n2: number | null; gmv_n3: number | null; gmv_n4: number | null; gmv_n5: number | null;
  gmv_saas_t: number | null; gmv_saas_m: number | null; gmv_fnb: number | null;
  kh_n1: number | null; kh_n2: number | null; kh_n3: number | null; kh_n4: number | null; kh_n5: number | null; opex_budget: number | null;
}
export interface GmvRow { ky: string; ma_kh: string; ma_ncc: string | null; dich_vu: string; gmv: number; gia_von: number; chiet_khau: number | null }
export interface ArRow { ma_kh: string; ky: string; so_ct: string | null; ngay_hd: string | null; ngay_den_han: string; so_tien: number; da_thu: number | null; ngay_thu_du: string | null }
export interface ApRow { ma_ncc: string; ky: string | null; so_ct: string | null; ngay_hd: string; ngay_den_han: string; so_tien: number; da_tra: number | null; ngay_tra: string | null }
export interface CashRow { ky_nua_thang: string; khoan_muc: string; ke_hoach: number | null; thuc_hien: number | null }
export interface OpexRow { ky: string; khoan_muc: string; so_tien: number }
export interface Contract { ma_kh: string; nhom: string; sales: string; ngay_ky: string; so_user: number | null }
export interface UploadLog { id: number; file_name: string | null; uploaded_at: string; summary: Record<string, unknown> | null }
export interface Snapshot { ky: string; data: Record<string, unknown>; locked_at: string; note: string | null }

export interface DataSet {
  params: Record<string, string>;
  customers: Customer[]; suppliers: Supplier[]; staff: Staff[]; alloc: PmAlloc[]; targets: Target[];
  gmv: GmvRow[]; ar: ArRow[]; ap: ApRow[]; cash: CashRow[]; opex: OpexRow[]; contracts: Contract[];
  uploads: UploadLog[]; snapshots: Snapshot[];
  me?: { email: string; role: string; canEdit: boolean };
}

export type Row = Record<string, string | number | null>;
