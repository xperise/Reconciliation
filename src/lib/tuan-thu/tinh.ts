import { CanhBao, DongRaw, LoaiDichVu, ThamSoHopDong, ThayDoi } from './types';

export const COT_TT_DA_VAT: Record<LoaiDichVu, string> = {
  khach_san: 'Thành tiền (đã VAT)', ve_may_bay: 'Thành tiền',
};
export const maGiaoDich = (d: DongRaw) =>
  String(d.loai === 'khach_san' ? d.v['Mã giao dịch'] ?? '' : d.v['Số vé'] ?? d.v['Mã giao dịch (Chiều đi)'] ?? '').trim();

/** Dòng có tiền (dòng khách ở ghép không mang tiền, để trống). */
export const coTien = (d: DongRaw) =>
  d.v['Thành tiền chưa VAT'] !== null && d.v['Thành tiền chưa VAT'] !== undefined;

const n = (x: any) => (typeof x === 'number' ? x : 0);
const lech = (a: number, b: number) => Math.abs(a - b) > 1; // dung sai 1đ do làm tròn

/**
 * Bước 1 — tự sửa chiết khấu, phí dịch vụ và tổng thành tiền về đúng bộ quy tắc.
 * Không sửa im lặng: mọi ô bị đổi đều ghi vào nhật ký thay đổi để kế toán xác nhận
 * và CEO thấy lại ở bước duyệt cuối.
 */
export function tuSua(dong: DongRaw[], ts: ThamSoHopDong): ThayDoi[] {
  const log: ThayDoi[] = [];
  for (const d of dong) {
    if (!coTien(d)) continue;
    const v = d.v, base = n(v['Thành tiền chưa VAT']), vat = n(v['VAT']);
    const thueSuat = base ? vat / base : 0;
    const dat = (cot: string, moi: number, ma: string) => {
      const cu = n(v[cot]);
      if (lech(cu, moi)) {
        log.push({ ma_quy_tac: ma, loai: d.loai, dong: d.dong, ma_giao_dich: maGiaoDich(d), cot, truoc: cu, sau: moi });
        v[cot] = moi;
      }
    };
    // KT-01 chiết khấu
    const ck = Math.round(base * ts.ty_le_chiet_khau[d.loai]);
    const vatCk = Math.round(ck * thueSuat);
    dat('Chiết khấu trước VAT', ck, 'KT-01');
    dat('VAT chiết khấu', vatCk, 'KT-01');
    dat('Tổng tiền chiết khấu', ck + vatCk, 'KT-01');
    // KT-02 phí dịch vụ (chỉ khi raw có cột phí)
    if ('Phí dịch vụ chưa VAT' in v) {
      const phi = Math.round(ts.phi_dich_vu[d.loai]);
      const vatPhi = Math.round(phi * thueSuat);
      dat('Phí dịch vụ chưa VAT', phi, 'KT-02');
      dat('VAT phí dịch vụ', vatPhi, 'KT-02');
      dat('Tổng phí dịch vụ', phi + vatPhi, 'KT-02');
    }
    // KT-03 tổng thành tiền = thành tiền đã VAT − chiết khấu + phí
    const tong = n(v[COT_TT_DA_VAT[d.loai]]) - n(v['Tổng tiền chiết khấu']) + n(v['Tổng phí dịch vụ']);
    dat('Tổng thành tiền', tong, 'KT-03');
  }
  return log;
}

/** Khoảng ngày của kỳ: theo HĐ gốc là cả tháng; sau sửa đổi 2 đợt thì theo đợt. */
export function khoangKy(ts: ThamSoHopDong, thang: string, dot?: 1 | 2): { tu: string; den: string; nhan: string } {
  const [y, m] = thang.split('-').map(Number);
  const cuoi = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const f = (d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const vn = (d: number) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  if (ts.ky.kieu === 'hai_dot' && dot) {
    const cat = ts.ky.ngay_cat;
    const [a, b] = dot === 1 ? [1, cat] : [cat + 1, cuoi];
    return { tu: f(a), den: f(b), nhan: `Từ ngày ${vn(a)} Đến ngày ${vn(b)}` };
  }
  return { tu: f(1), den: f(cuoi), nhan: `Từ ngày ${vn(1)} Đến ngày ${vn(cuoi)}` };
}

export interface TongHop {
  so_dong: Record<LoaiDichVu, number>;
  chua_vat: Record<LoaiDichVu, number>;
  vat: Record<LoaiDichVu, number>;
  chiet_khau: Record<LoaiDichVu, number>;
  phi: Record<LoaiDichVu, number>;
  tong: Record<LoaiDichVu, number>;
  tong_cong: number;
}
export function tongHop(dong: DongRaw[]): TongHop {
  const z = () => ({ khach_san: 0, ve_may_bay: 0 });
  const t: TongHop = { so_dong: z(), chua_vat: z(), vat: z(), chiet_khau: z(), phi: z(), tong: z(), tong_cong: 0 };
  for (const d of dong) {
    t.so_dong[d.loai] += 1;
    t.chua_vat[d.loai] += n(d.v['Thành tiền chưa VAT']);
    t.vat[d.loai] += n(d.v['VAT']);
    t.chiet_khau[d.loai] += n(d.v['Tổng tiền chiết khấu']);
    t.phi[d.loai] += n(d.v['Tổng phí dịch vụ']);
    t.tong[d.loai] += n(d.v['Tổng thành tiền']);
  }
  t.tong_cong = t.tong.khach_san + t.tong.ve_may_bay;
  return t;
}
export type { CanhBao };
