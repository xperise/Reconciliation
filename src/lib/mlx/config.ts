// Cấu hình cố định của bảng kê MLX. Sửa tại đây nếu thông tin pháp nhân thay đổi.

export const ISSUER = {
  name: 'CÔNG TY TNHH VẬN TẢI CÔNG NGHỆ MAI LINH XPERISE',
  address:
    'Tầng 3, Tòa Harbour View, 35 Nguyễn Huệ, Phường Sài Gòn, Thành phố Hồ Chí Minh, Việt Nam',
  mst: '0316953111',
};

export const STATEMENT_TITLE = 'BẢNG KÊ SỬ DỤNG DỊCH VỤ';

/** Giá cước đã bao gồm VAT 8% */
export const VAT_RATE = 0.08;

/**
 * Cột của bảng chi tiết (A → O). `aliases` dùng để nhận diện header trong file raw,
 * so khớp sau khi chuẩn hoá (bỏ dấu, không phân biệt hoa thường).
 */
export const COLUMNS = [
  { key: 'stt', header: 'STT', aliases: ['stt'], width: 6 },
  { key: 'soThe', header: 'Số thẻ', aliases: ['so the'], width: 22 },
  { key: 'sanPham', header: 'Sản phẩm', aliases: ['san pham'], width: 11 },
  { key: 'ngayGiaoDich', header: 'Ngày giao dịch', aliases: ['ngay giao dich'], width: 20 },
  { key: 'ngayDiThucTe', header: 'Ngày đi thực tế', aliases: ['ngay di thuc te'], width: 20 },
  { key: 'ngayHieuLuc', header: 'Ngày hiệu lực', aliases: ['ngay hieu luc'], width: 20 },
  { key: 'tenTrenThe', header: 'Tên in trên thẻ', aliases: ['ten in tren the'], width: 22 },
  { key: 'bienSoXe', header: 'Biển số xe', aliases: ['bien so xe', 'bs xe'], width: 13 },
  { key: 'maNV', header: 'Mã NV', aliases: ['ma nv'], width: 10 },
  { key: 'soTien', header: 'Số tiền', aliases: ['so tien'], width: 14 },
  { key: 'soGiaoDich', header: 'Số giao dịch', aliases: ['so giao dich'], width: 32 },
  { key: 'diemDon', header: 'Điểm đón/Ghi chú', aliases: ['diem don/ghi chu', 'diem don'], width: 24 },
  { key: 'diemTra', header: 'Điểm trả', aliases: ['diem tra'], width: 24 },
  { key: 'donViPhatSinh', header: 'Đơn vị phát sinh', aliases: ['don vi phat sinh'], width: 34 },
  { key: 'khoangCach', header: 'Khoảng cách (km)', aliases: ['khoang cach (km)', 'khoang cach'], width: 12 },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]['key'];
