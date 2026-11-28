/**
 * Cấu hình quy trình (pha 1, phần khai báo dữ liệu).
 *
 * File này chỉ khai báo kiểu và giá trị mặc định tương đương hành vi hiện tại
 * (4 phòng, chuỗi duyệt kế toán → demand/supply → CEO, sửa đổi quy tắc 4/4).
 * Chưa được nối vào luồng xử lý: runtime vẫn đọc hằng số cũ cho đến khi pha 1 hoàn tất.
 */

export type CheDoDuyet = 'any' | 'all' | 'quorum';
export type KetQuaBuoc = 'duyet' | 'tra_ve' | 'chan';

export interface RoleCauHinh { key: string; ten: string; thuTu: number; kichHoat: boolean }
export interface BuocCauHinh {
  key: string;
  thuTu: number;          // cùng thuTu = chạy song song (demand và supply)
  roleKey: string;
  mode: CheDoDuyet;
  ketQua: KetQuaBuoc[];
  /** nhóm bước: cùng nhóm = song song, khác nhóm = tuần tự (SQL 58). Mặc định = thuTu. */
  nhom?: number;
  /** người duyệt cụ thể của bước; null = theo role */
  nguoi?: string | null;
  /** bước có tham gia quorum sửa đổi quy tắc không (SQL 59); mặc định true */
  suaDoi?: boolean;
}
export interface QuyTrinhCauHinh {
  roles: RoleCauHinh[];
  buoc: BuocCauHinh[];
  quorumSuaDoi: 'all';    // sàn cứng: nền tảng quy định, tổ chức không hạ được
}

export const CAU_HINH_MAC_DINH: QuyTrinhCauHinh = {
  roles: [
    { key: 'ke_toan', ten: 'Kế toán', thuTu: 1, kichHoat: false },
    { key: 'demand', ten: 'Demand', thuTu: 2, kichHoat: false },
    { key: 'supply', ten: 'Supply', thuTu: 2, kichHoat: false },
    { key: 'ceo', ten: 'CEO', thuTu: 3, kichHoat: true },
  ],
  buoc: [
    { key: 'ke_toan_duyet', thuTu: 1, roleKey: 'ke_toan', mode: 'any', ketQua: ['duyet', 'tra_ve'] },
    { key: 'demand_kiem_soat', thuTu: 2, roleKey: 'demand', mode: 'any', ketQua: ['chan', 'tra_ve'] },
    { key: 'supply_kiem_soat', thuTu: 2, roleKey: 'supply', mode: 'any', ketQua: ['chan', 'tra_ve'] },
    { key: 'ceo_duyet', thuTu: 3, roleKey: 'ceo', mode: 'any', ketQua: ['duyet', 'tra_ve'] },
  ],
  quorumSuaDoi: 'all',
};

/**
 * Chuẩn hoá mã role: bỏ dấu tiếng Việt, đổi về chữ thường, mọi ký tự không phải a–z, 0–9 thành "_".
 * Ví dụ: "Kế toán", "KẾ TOÁN", "ke toan", "Ke-Toan", "kế_toán" đều thành "ke_toan".
 */
export function chuanHoaMa(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Khoá so sánh trùng: bỏ hẳn dấu gạch dưới. "ke_toan" và "ketoan" cùng khoá. */
export function khoaSoSanh(s: string): string {
  return chuanHoaMa(s).replace(/_/g, '');
}

/** Mã đã ở dạng chuẩn (không cần chuẩn hoá thêm) và không rỗng. */
export function maHopLe(ma: string): boolean {
  return ma.length > 0 && ma === chuanHoaMa(ma);
}

/** Kiểm tra ràng buộc cứng. Trả về danh sách lỗi; rỗng nghĩa là hợp lệ. */
export function kiemTraCauHinh(c: QuyTrinhCauHinh): string[] {
  const loi: string[] = [];
  const roleKeys = new Set(c.roles.map((r) => r.key));

  for (const r of c.roles) if (!maHopLe(r.key)) loi.push(`Mã role không hợp lệ: "${r.key}" (dùng chữ thường, số, gạch dưới).`);
  const khoaRole = c.roles.map((r) => khoaSoSanh(r.key));
  if (new Set(khoaRole).size !== khoaRole.length) loi.push('Hai role trùng mã (không phân biệt hoa, thường, dấu, dấu cách).');
  const tenRole = c.roles.map((r) => khoaSoSanh(r.ten));
  if (new Set(tenRole).size !== tenRole.length) loi.push('Hai role trùng tên hiển thị.');

  const khoaBuoc = c.buoc.map((b) => khoaSoSanh(b.key));
  if (new Set(khoaBuoc).size !== khoaBuoc.length) loi.push('Hai bước trùng mã.');
  for (const b of c.buoc) {
    if (!roleKeys.has(b.roleKey)) loi.push(`Bước ${b.key} trỏ tới role không tồn tại: ${b.roleKey}.`);
    if (b.ketQua.length === 0) loi.push(`Bước ${b.key} không có kết quả nào.`);
  }
  if (c.buoc.length === 0) { loi.push('Quy trình không có bước nào.'); return loi; }
  const cuoi = Math.max(...c.buoc.map((b) => b.thuTu));
  if (!c.buoc.some((b) => b.thuTu === cuoi && b.ketQua.includes('duyet')))
    loi.push('Phải có ít nhất một bước duyệt ở vị trí cuối cùng (bước gửi).');
  if (c.quorumSuaDoi !== 'all') loi.push('Quorum sửa đổi không được thấp hơn mức sàn (tất cả).');
  if (!c.roles.some((r) => r.kichHoat)) loi.push('Phải có ít nhất một role được kích hoạt hợp đồng.');
  for (const b of c.buoc) if (b.nhom !== undefined && (!Number.isInteger(b.nhom) || b.nhom < 1)) loi.push(`Bước ${b.key}: nhóm phải là số nguyên từ 1 trở lên.`);
  return loi;
}

/**
 * Trạng thái chờ của lần chạy (máy trạng thái hai giai đoạn hiện tại):
 * - giai đoạn đầu (bước có thuTu nhỏ nhất) → 'cho_ke_toan'
 * - các giai đoạn sau → 'cho_ceo'
 * Mã trạng thái giữ nguyên để không đổi dữ liệu đang chạy.
 */
export const TRANG_THAI_CHO = { dau: 'cho_ke_toan', sau: 'cho_ceo' } as const;

function trangThaiCuaBuoc(c: QuyTrinhCauHinh, b: BuocCauHinh): string {
  const min = Math.min(...c.buoc.map((x) => x.thuTu));
  return b.thuTu === min ? TRANG_THAI_CHO.dau : TRANG_THAI_CHO.sau;
}

/** Role có bước duyệt (ketQua chứa 'duyet') không. Demand/Supply thì không. */
export function coDuyet(c: QuyTrinhCauHinh, roleKey: string): boolean {
  return c.buoc.some((b) => b.roleKey === roleKey && b.ketQua.includes('duyet'));
}

/** Role có quyền chặn bảng kê (ketQua chứa 'chan') không. */
export function coChan(c: QuyTrinhCauHinh, roleKey: string): boolean {
  return c.buoc.some((b) => b.roleKey === roleKey && b.ketQua.includes('chan'));
}

/**
 * Các trạng thái chờ mà role được thao tác.
 * - Role có bước duyệt: chỉ thao tác ở trạng thái của bước đó.
 * - Role chỉ chặn/trả về: thao tác ở mọi trạng thái chờ (có thể trả về khi chưa gửi, chặn khi CEO đang chờ).
 * Với cấu hình mặc định, cho kết quả trùng BUOC_DANG cũ.
 */
export function trangThaiDuocDuyet(c: QuyTrinhCauHinh, roleKey: string): string[] {
  const cuaRole = c.buoc.filter((b) => b.roleKey === roleKey);
  if (cuaRole.length === 0) return [];
  if (cuaRole.some((b) => b.ketQua.includes('duyet'))) {
    return [...new Set(cuaRole.filter((b) => b.ketQua.includes('duyet')).map((b) => trangThaiCuaBuoc(c, b)))];
  }
  return [...new Set(c.buoc.map((b) => trangThaiCuaBuoc(c, b)))];
}

/** Role (theo thứ tự trong cấu hình) thao tác được ở một trạng thái chờ. */
export function vaiTroTheoTrangThai(c: QuyTrinhCauHinh, trangThai: string): string[] {
  return c.roles.map((r) => r.key).filter((k) => trangThaiDuocDuyet(c, k).includes(trangThai));
}

/** Role có bước duyệt: nhận thông báo khi bị chặn hoặc gỡ chặn. */
export function vaiTroCoDuyet(c: QuyTrinhCauHinh): string[] {
  return c.roles.map((r) => r.key).filter((k) => coDuyet(c, k));
}

/** Role chỉ kiểm soát (không duyệt) và có việc ở giai đoạn đầu: nhận thông báo khi có bảng kê mới. */
export function vaiTroChiKiemSoat(c: QuyTrinhCauHinh): string[] {
  return c.roles.map((r) => r.key).filter((k) => !coDuyet(c, k) && trangThaiDuocDuyet(c, k).includes(TRANG_THAI_CHO.dau));
}

/** Role được phép kích hoạt hợp đồng (ngoài admin). Mặc định: chỉ CEO. */
export function coQuyenKichHoat(c: QuyTrinhCauHinh, roleKey: string): boolean {
  return c.roles.some((r) => r.key === roleKey && r.kichHoat);
}

/** Role là bước duyệt cuối (bước gửi): có quyền duyệt và thao tác ở trạng thái chờ CEO. */
export function laBuocCuoiDuyet(c: QuyTrinhCauHinh, roleKey: string): boolean {
  return coDuyet(c, roleKey) && trangThaiDuocDuyet(c, roleKey).includes(TRANG_THAI_CHO.sau);
}
