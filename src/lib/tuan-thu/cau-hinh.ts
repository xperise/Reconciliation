/**
 * Cấu hình quy trình (pha 1, phần khai báo dữ liệu).
 *
 * File này chỉ khai báo kiểu và giá trị mặc định tương đương hành vi hiện tại
 * (4 phòng, chuỗi duyệt kế toán → demand/supply → CEO, sửa đổi quy tắc 4/4).
 * Chưa được nối vào luồng xử lý: runtime vẫn đọc hằng số cũ cho đến khi pha 1 hoàn tất.
 */

export type CheDoDuyet = 'any' | 'all' | 'quorum';
export type KetQuaBuoc = 'duyet' | 'tra_ve' | 'chan';

export interface RoleCauHinh { key: string; ten: string; thuTu: number }
export interface BuocCauHinh {
  key: string;
  thuTu: number;          // cùng thuTu = chạy song song (demand và supply)
  roleKey: string;
  mode: CheDoDuyet;
  ketQua: KetQuaBuoc[];
}
export interface QuyTrinhCauHinh {
  roles: RoleCauHinh[];
  buoc: BuocCauHinh[];
  quorumSuaDoi: 'all';    // sàn cứng: nền tảng quy định, tổ chức không hạ được
}

export const CAU_HINH_MAC_DINH: QuyTrinhCauHinh = {
  roles: [
    { key: 'ke_toan', ten: 'Kế toán', thuTu: 1 },
    { key: 'demand', ten: 'Demand', thuTu: 2 },
    { key: 'supply', ten: 'Supply', thuTu: 2 },
    { key: 'ceo', ten: 'CEO', thuTu: 3 },
  ],
  buoc: [
    { key: 'ke_toan_duyet', thuTu: 1, roleKey: 'ke_toan', mode: 'any', ketQua: ['duyet', 'tra_ve'] },
    { key: 'demand_kiem_soat', thuTu: 2, roleKey: 'demand', mode: 'any', ketQua: ['chan', 'tra_ve'] },
    { key: 'supply_kiem_soat', thuTu: 2, roleKey: 'supply', mode: 'any', ketQua: ['chan', 'tra_ve'] },
    { key: 'ceo_duyet', thuTu: 3, roleKey: 'ceo', mode: 'any', ketQua: ['duyet', 'tra_ve'] },
  ],
  quorumSuaDoi: 'all',
};

/** Kiểm tra ràng buộc cứng. Trả về danh sách lỗi; rỗng nghĩa là hợp lệ. */
export function kiemTraCauHinh(c: QuyTrinhCauHinh): string[] {
  const loi: string[] = [];
  const roleKeys = new Set(c.roles.map((r) => r.key));
  if (new Set(c.roles.map((r) => r.key)).size !== c.roles.length) loi.push('Trùng key role.');
  if (new Set(c.buoc.map((b) => b.key)).size !== c.buoc.length) loi.push('Trùng key bước.');
  for (const b of c.buoc) {
    if (!roleKeys.has(b.roleKey)) loi.push(`Bước ${b.key} trỏ tới role không tồn tại: ${b.roleKey}.`);
    if (b.ketQua.length === 0) loi.push(`Bước ${b.key} không có kết quả nào.`);
  }
  if (c.buoc.length === 0) { loi.push('Quy trình không có bước nào.'); return loi; }
  const cuoi = Math.max(...c.buoc.map((b) => b.thuTu));
  if (!c.buoc.some((b) => b.thuTu === cuoi && b.ketQua.includes('duyet')))
    loi.push('Phải có ít nhất một bước duyệt ở vị trí cuối cùng (bước gửi).');
  if (c.quorumSuaDoi !== 'all') loi.push('Quorum sửa đổi không được thấp hơn mức sàn (tất cả).');
  return loi;
}
