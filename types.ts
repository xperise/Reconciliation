// Kiểu dữ liệu dùng chung cho module MLX (chuyển đổi bảng kê taxi)

export interface MlxCustomer {
  id?: string;
  /** Mã khách hàng trên hệ thống MLX (vd G345) */
  ma_khach_hang: string;
  /** Mã hợp đồng — dùng đặt tên file bảng kê */
  ma_hop_dong: string;
  ten_cong_ty: string;
  ten_viet_tat: string;
  dia_chi: string;
  mst: string;
  /** % chiết khấu, nhập dạng 0–100 (5 = 5%) */
  chiet_khau: number;
}

/** Kỳ bảng kê theo tháng */
export interface Period {
  month: number; // 1–12
  year: number;
}

/** Một dòng giao dịch trong file raw — giữ nguyên dữ liệu, không lọc */
export interface RawRow {
  stt: number | string | null;
  soThe: string;
  sanPham: string;
  ngayGiaoDich: Date | string | null;
  ngayDiThucTe: Date | string | null;
  ngayHieuLuc: Date | string | null;
  tenTrenThe: string;
  bienSoXe: string;
  maNV: string;
  soTien: number | null;
  soGiaoDich: string;
  diemDon: string;
  diemTra: string;
  donViPhatSinh: string;
  khoangCach: number | string | null;
}

export interface ParsedRawFile {
  fileName: string;
  /** Phần tên công ty tách từ tên file */
  companyFromFile: string;
  /** Kỳ tách từ tên file (null nếu không đọc được) */
  periodFromFile: Period | null;
  rows: RawRow[];
  /** Số dòng 0đ đã loại khỏi file xuất */
  zeroRows: number;
  total: number;
}
