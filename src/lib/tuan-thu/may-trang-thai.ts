/**
 * Máy trạng thái theo nhóm bước (lõi thuần, không gọi database).
 *
 * Quy tắc:
 * - Chỉ các nhóm có bước "duyệt" mới là nhóm chờ (gating). Nhóm chỉ có chặn/trả về không chặn tiến trình.
 * - Trạng thái chờ: 'cho_nhom_<k>' (k = thứ tự nhóm chờ, từ 1). Trạng thái cũ 'cho_ke_toan' = nhóm chờ đầu,
 *   'cho_ceo' = nhóm chờ cuối; đọc được nhưng không ghi lại.
 * - Nhóm chờ xong khi mọi bước duyệt trong nhóm đã có đồng ý theo chế độ của bước.
 * - Chặn và trả về được làm ở bất kỳ trạng thái chờ nào, bởi role có bước tương ứng (như hành vi cũ).
 */
import type { QuyTrinhCauHinh, BuocCauHinh } from './cau-hinh';

export type Quyet = { roleKey: string; quyet_dinh: 'duyet' | 'tra_ve' | 'khong_dong_y'; nguoi?: string | null };
/** thành viên của mỗi role (để kiểm chế độ "tất cả" và "đa số") */
export type ThanhVienRole = Record<string, string[]>;

export const DA_GUI = 'da_gui';

/** Các nhóm chờ theo thứ tự tăng dần (nhóm có ít nhất một bước duyệt). */
export function nhomCho(c: QuyTrinhCauHinh): number[] {
  const nhom = (b: BuocCauHinh) => b.nhom ?? b.thuTu;
  const co = new Set(c.buoc.filter((b) => b.ketQua.includes('duyet')).map(nhom));
  return [...co].sort((a, b) => a - b);
}

/**
 * Tên trạng thái chờ của một nhóm chờ. Cấu hình có tối đa hai nhóm chờ dùng đúng tên cũ
 * (cho_ke_toan / cho_ceo) để dữ liệu và giao diện hiện có không đổi; nhiều hơn thì cho_nhom_<k>.
 */
export function trangThaiNhom(c: QuyTrinhCauHinh, nhomSo: number): string {
  const ds = nhomCho(c);
  const i = ds.indexOf(nhomSo);
  if (ds.length <= 2) return ['cho_ke_toan', 'cho_ceo'][i] ?? 'cho_ke_toan';
  return `cho_nhom_${i + 1}`;
}

/** Đọc trạng thái (kể cả trạng thái cũ) → nhóm chờ hiện tại, hoặc null nếu đã gửi/huỷ/không hợp lệ. */
export function nhomHienTai(c: QuyTrinhCauHinh, buoc: string): number | null {
  const ds = nhomCho(c);
  if (!ds.length) return null;
  if (buoc === 'cho_ke_toan') return ds[0];
  if (buoc === 'cho_ceo') return ds[ds.length - 1];
  const m = /^cho_nhom_(\d+)$/.exec(buoc);
  if (!m) return null;
  const k = Number(m[1]) - 1;
  return k >= 0 && k < ds.length ? ds[k] : null;
}

/** Bước duyệt trong một nhóm. */
export function buocTrongNhom(c: QuyTrinhCauHinh, nhomSo: number): BuocCauHinh[] {
  return c.buoc.filter((b) => (b.nhom ?? b.thuTu) === nhomSo && b.ketQua.includes('duyet'));
}

/** Một bước đã đủ đồng ý chưa, theo chế độ của bước. */
export function buocDaDuyet(b: BuocCauHinh, quyet: Quyet[], thanhVien: ThanhVienRole): boolean {
  const cua = quyet.filter((q) => q.roleKey === b.roleKey && q.quyet_dinh === 'duyet');
  if (b.nguoi) return cua.some((q) => q.nguoi === b.nguoi);
  const tv = thanhVien[b.roleKey] ?? [];
  const nguoiDong = new Set(cua.map((q) => q.nguoi).filter(Boolean) as string[]);
  switch (b.mode) {
    case 'all': return tv.length > 0 && tv.every((u) => nguoiDong.has(u));
    case 'quorum': return nguoiDong.size > 0 && nguoiDong.size * 2 > tv.length; // đa số (ngưỡng đồng ý hiện là đa số)
    case 'any':
    default: return cua.length > 0;
  }
}

/** Nhóm chờ đã xong (mọi bước duyệt trong nhóm đều đủ đồng ý). */
export function nhomXong(c: QuyTrinhCauHinh, nhomSo: number, quyet: Quyet[], thanhVien: ThanhVienRole): boolean {
  const ds = buocTrongNhom(c, nhomSo);
  return ds.length > 0 && ds.every((b) => buocDaDuyet(b, quyet, thanhVien));
}

/** Trạng thái kế tiếp sau khi có quyết định. Trả về trạng thái mới (có thể giữ nguyên). */
export function buocTiep(c: QuyTrinhCauHinh, buoc: string, quyet: Quyet[], thanhVien: ThanhVienRole): string {
  const ds = nhomCho(c);
  const cur = nhomHienTai(c, buoc);
  if (cur === null) return buoc;
  if (!nhomXong(c, cur, quyet, thanhVien)) return trangThaiNhom(c, cur);
  const i = ds.indexOf(cur);
  return i + 1 < ds.length ? trangThaiNhom(c, ds[i + 1]) : DA_GUI;
}

/** Role có được duyệt ở trạng thái này không (chỉ bước duyệt của nhóm hiện tại). */
export function coTheDuyet(c: QuyTrinhCauHinh, buoc: string, roleKey: string): boolean {
  const cur = nhomHienTai(c, buoc);
  if (cur === null) return false;
  return buocTrongNhom(c, cur).some((b) => b.roleKey === roleKey);
}

/** Role có được chặn/trả về ở trạng thái này không (bất kỳ bước nào của role có kết quả tương ứng). */
export function coTheKiemSoat(c: QuyTrinhCauHinh, buoc: string, roleKey: string, kq: 'chan' | 'tra_ve'): boolean {
  if (nhomHienTai(c, buoc) === null) return false;
  return c.buoc.some((b) => b.roleKey === roleKey && b.ketQua.includes(kq));
}
