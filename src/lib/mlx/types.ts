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

/** Nguồn dữ liệu của một file tải lên */
export type Source = 'XPAY' | 'CMS' | 'BE';

export interface ParsedRawFile {
  fileName: string;
  /**
   * XPAY = file raw xuất từ hệ thống xpay (tiêu đề cột ngay dòng đầu).
   * CMS  = bảng kê đã format sẵn do hệ thống CMS xuất ra.
   */
  source: Source;
  /** Tên công ty đọc được (CMS lấy trong file, XPAY lấy từ tên file) */
  companyFromFile: string;
  /** Mã khách hàng / mã hợp đồng đọc được, dùng để khớp master data */
  codeFromFile: string;
  /** MST đọc được trong file CMS */
  mstFromFile: string;
  /** Kỳ đọc được (null nếu không xác định được) */
  periodFromFile: Period | null;
  rows: RawRow[];
  /** Số dòng 0đ đã loại khỏi file xuất */
  zeroRows: number;
  total: number;
  /**
   * File master (raw XPAY có cột "Công ty", gồm nhiều khách): mỗi phần là 1 công ty,
   * xử lý như 1 file raw riêng. Không có = file của 1 khách.
   */
  parts?: ParsedRawFile[];
  /** Số giao dịch nội bộ Xperise đã bỏ khỏi file master */
  internalRows?: number;
}
