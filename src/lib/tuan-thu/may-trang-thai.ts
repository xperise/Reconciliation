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

/** Điều kiện của một lần chạy, để quyết định bước nào chạy. Không truyền = mọi bước đều chạy. */
export type NgCanh = { coCanhBaoChan: boolean; coNgoaiLe: boolean; tongTien: number; nguongTien: number | null };

/** Bước có chạy trong lần chạy này không (theo "chạy khi"). */
export function buocChay(b: BuocCauHinh, ctx?: NgCanh): boolean {
  if (!ctx) return true;
  switch (b.chayKhi ?? 'luon') {
    case 'canh_bao_chan': return ctx.coCanhBaoChan;
    case 'vuot_nguong': return ctx.nguongTien != null && ctx.tongTien > ctx.nguongTien;
    case 'ngoai_le': return ctx.coNgoaiLe;
    case 'luon':
    default: return true;
  }
}

const nhomCua = (b: BuocCauHinh) => b.nhom ?? b.thuTu;
const laBuocDuyet = (b: BuocCauHinh) => b.ketQua.includes('duyet') && b.yeuCauDuyet !== false;

/** Tất cả nhóm chờ theo cấu hình (không phụ thuộc lần chạy). Dùng để đặt tên trạng thái ổn định. */
export function nhomChoDayDu(c: QuyTrinhCauHinh): number[] {
  return [...new Set(c.buoc.filter(laBuocDuyet).map(nhomCua))].sort((a, b) => a - b);
}

/** Nhóm chờ của lần chạy: nhóm có ít nhất một bước duyệt đang chạy. */
export function nhomCho(c: QuyTrinhCauHinh, ctx?: NgCanh): number[] {
  return [...new Set(c.buoc.filter((b) => laBuocDuyet(b) && buocChay(b, ctx)).map(nhomCua))].sort((a, b) => a - b);
}

/**
 * Tên trạng thái chờ của một nhóm. Cấu hình có tối đa hai nhóm chờ dùng đúng tên cũ
 * (cho_ke_toan / cho_ceo) khi có đúng hai nhóm; còn lại dùng cho_nhom_<số nhóm>.
 */
export function trangThaiNhom(c: QuyTrinhCauHinh, nhomSo: number): string {
  const full = nhomChoDayDu(c);
  if (full.length === 2) return full.indexOf(nhomSo) === 1 ? 'cho_ceo' : 'cho_ke_toan';
  return `cho_nhom_${nhomSo}`;
}

/** Đọc trạng thái (kể cả trạng thái cũ) → số nhóm chờ, hoặc null nếu không phải trạng thái chờ. */
export function nhomHienTai(c: QuyTrinhCauHinh, buoc: string): number | null {
  const full = nhomChoDayDu(c);
  if (!full.length) return null;
  if (buoc === 'cho_ke_toan') return full[0];
  if (buoc === 'cho_ceo') return full[full.length - 1];
  const m = /^cho_nhom_(\d+)$/.exec(buoc);
  if (!m) return null;
  const n = Number(m[1]);
  return full.includes(n) ? n : null;
}

/** Bước duyệt trong một nhóm. */
export function buocTrongNhom(c: QuyTrinhCauHinh, nhomSo: number, ctx?: NgCanh): BuocCauHinh[] {
  return c.buoc.filter((b) => nhomCua(b) === nhomSo && laBuocDuyet(b) && buocChay(b, ctx));
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
export function nhomXong(c: QuyTrinhCauHinh, nhomSo: number, quyet: Quyet[], thanhVien: ThanhVienRole, ctx?: NgCanh): boolean {
  const ds = buocTrongNhom(c, nhomSo, ctx);
  return ds.length > 0 && ds.every((b) => buocDaDuyet(b, quyet, thanhVien));
}

/** Trạng thái đầu tiên của lần chạy (nhóm chờ đầu tiên đang chạy). Không có nhóm nào → đã gửi. */
export function trangThaiBatDau(c: QuyTrinhCauHinh, ctx?: NgCanh): string {
  const ds = nhomCho(c, ctx);
  return ds.length ? trangThaiNhom(c, ds[0]) : DA_GUI;
}

/** Trạng thái kế tiếp sau khi có quyết định: nhóm hiện tại chưa xong thì giữ; xong thì sang nhóm đang chạy kế tiếp. */
export function buocTiep(c: QuyTrinhCauHinh, buoc: string, quyet: Quyet[], thanhVien: ThanhVienRole, ctx?: NgCanh): string {
  const cur = nhomHienTai(c, buoc);
  if (cur === null) return buoc;
  if (!nhomXong(c, cur, quyet, thanhVien, ctx)) return trangThaiNhom(c, cur);
  const sau = nhomCho(c, ctx).filter((n) => n > cur);
  return sau.length ? trangThaiNhom(c, sau[0]) : DA_GUI;
}

/** Role có được duyệt ở trạng thái này không (chỉ bước duyệt đang chạy của nhóm hiện tại). */
export function coTheDuyet(c: QuyTrinhCauHinh, buoc: string, roleKey: string, ctx?: NgCanh): boolean {
  const cur = nhomHienTai(c, buoc);
  if (cur === null) return false;
  return buocTrongNhom(c, cur, ctx).some((b) => b.roleKey === roleKey);
}

/** Role có được chặn/trả về ở trạng thái này không (bước đang chạy của role có kết quả tương ứng). */
export function coTheKiemSoat(c: QuyTrinhCauHinh, buoc: string, roleKey: string, kq: 'chan' | 'tra_ve', ctx?: NgCanh): boolean {
  if (nhomHienTai(c, buoc) === null) return false;
  return c.buoc.some((b) => b.roleKey === roleKey && b.ketQua.includes(kq) && buocChay(b, ctx));
}

/**
 * Quorum sửa đổi quy tắc theo phạm vi: chỉ các bước được chọn (sua_doi) mới tham gia.
 * Mỗi bước được chọn phải đạt theo chế độ của bước. Không bước nào được chọn thì không thông qua được.
 */
export function quorumSuaDoiDat(c: QuyTrinhCauHinh, dongY: { roleKey: string; nguoi?: string | null }[], thanhVien: ThanhVienRole, buocKeys?: string[] | null): boolean {
  // Có danh sách bước theo loại thay đổi thì dùng danh sách đó; không có thì dùng cờ tham gia của từng bước
  const buoc = buocKeys ? c.buoc.filter((b) => buocKeys.includes(b.key)) : c.buoc.filter((b) => b.suaDoi !== false);
  if (!buoc.length) return false;
  const quyet: Quyet[] = dongY.map((d) => ({ roleKey: d.roleKey, quyet_dinh: 'duyet', nguoi: d.nguoi ?? null }));
  return buoc.every((b) => buocDaDuyet(b, quyet, thanhVien));
}

/**
 * Đưa trạng thái lần chạy về nhóm đang chạy: nếu nhóm hiện tại không còn bước nào chạy
 * (điều kiện đổi, hoặc nhóm không yêu cầu duyệt) thì sang nhóm chạy kế tiếp; không còn thì đã gửi.
 */
export function chuanHoaBuoc(c: QuyTrinhCauHinh, buoc: string, ctx?: NgCanh): string {
  const cur = nhomHienTai(c, buoc);
  if (cur === null) return buoc;
  const dang = nhomCho(c, ctx);
  if (dang.includes(cur)) return buoc;
  const sau = dang.filter((n) => n > cur);
  return sau.length ? trangThaiNhom(c, sau[0]) : DA_GUI;
}
