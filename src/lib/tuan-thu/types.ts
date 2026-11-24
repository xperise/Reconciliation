/** Kiểu dữ liệu dùng chung cho luồng tuân thủ bảng kê. */
export type PhongBan = 'ke_toan' | 'supply' | 'demand' | 'ceo';
export type MucDo = 'chan_gui' | 'giai_trinh' | 'theo_doi';
export type LoaiDichVu = 'khach_san' | 've_may_bay';

export const TEN_PHONG_BAN: Record<PhongBan, string> = {
  ke_toan: 'Kế toán', supply: 'Supply', demand: 'Demand', ceo: 'CEO',
};
export const TEN_MUC_DO: Record<MucDo, string> = {
  chan_gui: 'Chặn gửi', giai_trinh: 'Giải trình', theo_doi: 'Theo dõi',
};
export const TEN_DICH_VU: Record<LoaiDichVu, string> = {
  khach_san: 'Khách sạn', ve_may_bay: 'Vé máy bay',
};

/** Một dòng raw: giữ nguyên tên cột như file raw, số đã được chuẩn hoá. */
export interface DongRaw {
  loai: LoaiDichVu;
  /** Số dòng trong file raw (để kế toán tra lại) */
  dong: number;
  v: Record<string, any>;
}

export interface CanhBao {
  ma_quy_tac: string;
  phong_ban: PhongBan;
  muc_do: MucDo;
  loai?: LoaiDichVu;
  dong: number[];
  noi_dung: string;
  so_tien?: number;
}

export interface ThayDoi {
  ma_quy_tac: string;
  loai: LoaiDichVu;
  dong: number;
  ma_giao_dich: string;
  cot: string;
  truoc: number;
  sau: number;
}

/** Tham số hợp đồng của một khách, sinh ra từ bộ quy tắc đã chốt. */
export interface ThamSoHopDong {
  ma_khach: string;
  so_hop_dong: string;
  ty_le_chiet_khau: Record<LoaiDichVu, number>;
  phi_dich_vu: Record<LoaiDichVu, number>;
  ky: { kieu: 'thang' } | { kieu: 'hai_dot'; ngay_cat: number };
  tai_khoan: { so: string; ngan_hang: string };
  ben_ban: { ten: string; mst: string; dia_chi: string; dien_thoai: string };
  ben_mua: { ten: string; mst: string; dia_chi: string; dien_thoai: string };
  han_muc_thang: number;
  /** Định mức tiền phòng/đêm (đã gồm thuế) theo nhóm đối tượng: [nhóm I-II, nhóm III]; null = phòng Suite */
  dinh_muc_phong: { nhom: string; tu_khoa: string[]; muc: [number, number] | null }[];
  /** Từ khóa địa danh (không dấu) nhận diện địa bàn nhóm I–II theo PL2b; không khớp = coi là nhóm III */
  dia_ban_nhom_1_2: string[];
  /** Hiển thị trạng thái raw trên bảng kê gửi khách */
  ten_trang_thai: Record<string, string>;
}
