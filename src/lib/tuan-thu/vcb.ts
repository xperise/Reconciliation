import { ThamSoHopDong } from './types';

/**
 * Tham số VCB theo HĐ GỐC 216.2.0.2026/VCB-UTS (chưa áp sửa đổi nào).
 * Sửa đổi (2 đợt, ...) sẽ được áp lên bản này sau khi đủ 4 head duyệt.
 */
export const VCB_GOC: ThamSoHopDong = {
  ma_khach: 'VCB',
  so_hop_dong: '216.2.0.2026/VCB-UTS',
  ty_le_chiet_khau: { khach_san: 0, ve_may_bay: 0 },   // KT-01: HĐ không quy định chiết khấu
  phi_dich_vu: { khach_san: 0, ve_may_bay: 0 },        // KT-02: không thu phí trên chi phí mua sắm
  ky: { kieu: 'thang' },                               // DM-01 gốc: 1 kỳ/tháng, gửi ngày cuối tháng (Đ3.1)
  tai_khoan: {                                         // KT-06
    so: '1068273979',
    ngan_hang: 'Ngân hàng TMCP Ngoại thương Việt Nam, Chi nhánh Tân Định',
  },
  ben_ban: {                                           // KT-07
    ten: 'Công ty Cổ phần Universal Travel Solutions Network',
    mst: '0317855759',
    dia_chi: 'Tầng 3, Harbour View Tower, số 35 Nguyễn Huệ, Phường Sài Gòn, Thành phố Hồ Chí Minh, Việt Nam',
    dien_thoai: '19002183',
  },
  ben_mua: {                                           // KT-08
    ten: 'NGÂN HÀNG THƯƠNG MẠI CỔ PHẦN NGOẠI THƯƠNG VIỆT NAM',
    mst: '0100112437',
    dia_chi: '198 Trần Quang Khải, phường Hoàn Kiếm, Thành phố Hà Nội',
    dien_thoai: '02439343137',
  },
  han_muc_thang: 3_000_000_000,                        // DM-03 (Đ1.1)
  dinh_muc_phong: [                                    // DM-04 (PL02 mục I.3)
    { nhom: 'Lãnh đạo cấp cao (phòng Suite)', muc: null,
      tu_khoa: ['tổng giám đốc', 'hđqt', 'hội đồng quản trị', 'ban kiểm soát', 'kế toán trưởng', 'giám đốc khối'] },
    { nhom: 'GĐ, PGĐ Sở giao dịch, CN TP.HCM', muc: [2_500_000, 2_000_000],
      tu_khoa: ['sở giao dịch', 'chi nhánh tp hồ chí minh', 'chi nhánh tp. hồ chí minh'] },
    { nhom: 'GĐ, PGĐ ĐVTV khác', muc: [2_000_000, 1_700_000],
      tu_khoa: ['giám đốc', 'phó giám đốc'] },
    { nhom: 'Các đối tượng khác', muc: [1_500_000, 1_300_000], tu_khoa: [] },
  ],
  // PL2b — ước theo địa chỉ khách sạn (địa chỉ raw là chữ tự do, nhiều nơi còn dùng tên tỉnh cũ)
  dia_ban_nhom_1_2: [
    'ha noi', 'hanoi', 'ho chi minh', 'hcm', 'sai gon', 'saigon', 'can tho', 'da nang', 'hai phong', 'hue',
    'ha long', 'bai chay', 'tuan chau', 'hong gai', 'nha trang', 'phu quoc', 'vung tau', 'thu dau mot', 'binh duong',
    'hai duong', 'bac ninh', 'hoa lu', 'ninh binh', 'thai nguyen', 'viet tri', 'thanh hoa', 'vinh', 'cua lo',
    'quy nhon', 'pleiku', 'buon ma thuot', 'da lat', 'dalat', 'bien hoa', 'my tho', 'long xuyen', 'rach gia',
  ],
  ten_trang_thai: {
    'khach_san:completed': 'Có lưu trú', 'khach_san:canceled': 'Đã hủy',
    'khach_san:pending checkin': 'Chờ nhận phòng',
    've_may_bay:completed': 'Đã sử dụng', 've_may_bay:cancelled': 'Đã hủy',
  },
};
