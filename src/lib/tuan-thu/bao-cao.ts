import ExcelJS from 'exceljs';
import { tongHop } from './tinh';
import { CanhBao, DongRaw, TEN_DICH_VU, TEN_MUC_DO, TEN_PHONG_BAN, ThayDoi } from './types';

const FONT = { name: 'Arial', size: 10 };
const NEN = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1F3864' } };

/** Báo cáo kiểm tra: dùng cho kế toán ở bước 1–2 và cho CEO ở bước duyệt cuối. */
export async function taoBaoCao(o: { nhanKy: string; dong: DongRaw[]; canhBao: CanhBao[]; thayDoi: ThayDoi[] }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const bang = (ten: string, tieu: string[], rong: number[], hang: any[][]) => {
    const ws = wb.addWorksheet(ten, { views: [{ state: 'frozen', ySplit: 1 }] });
    tieu.forEach((t, i) => {
      const c = ws.getCell(1, i + 1); c.value = t; c.fill = NEN; c.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
      c.alignment = { wrapText: true, vertical: 'middle' }; ws.getColumn(i + 1).width = rong[i];
    });
    hang.forEach((h, r) => h.forEach((v, i) => {
      const c = ws.getCell(r + 2, i + 1); c.value = v; c.font = FONT; c.alignment = { wrapText: true, vertical: 'top' };
      if (typeof v === 'number') c.numFmt = '#,##0;(#,##0);"-"';
    }));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: tieu.length } };
    return ws;
  };

  const th = tongHop(o.dong);
  const demMuc = (m: string) => o.canhBao.filter((c) => c.muc_do === m).length;
  bang('Tóm tắt', ['Chỉ tiêu', 'Vé máy bay', 'Khách sạn', 'Tổng'], [36, 18, 18, 18], [
    ['Kỳ', o.nhanKy, '', ''],
    ['Số dòng', th.so_dong.ve_may_bay, th.so_dong.khach_san, th.so_dong.ve_may_bay + th.so_dong.khach_san],
    ['Thành tiền chưa VAT', th.chua_vat.ve_may_bay, th.chua_vat.khach_san, th.chua_vat.ve_may_bay + th.chua_vat.khach_san],
    ['VAT', th.vat.ve_may_bay, th.vat.khach_san, th.vat.ve_may_bay + th.vat.khach_san],
    ['Chiết khấu (đã gồm VAT)', th.chiet_khau.ve_may_bay, th.chiet_khau.khach_san, th.chiet_khau.ve_may_bay + th.chiet_khau.khach_san],
    ['Phí dịch vụ (đã gồm VAT)', th.phi.ve_may_bay, th.phi.khach_san, th.phi.ve_may_bay + th.phi.khach_san],
    ['Tổng thành tiền gửi khách', th.tong.ve_may_bay, th.tong.khach_san, th.tong_cong],
    ['', '', '', ''],
    ['Cảnh báo chặn gửi', '', '', demMuc('chan_gui')],
    ['Cảnh báo cần giải trình', '', '', demMuc('giai_trinh')],
    ['Theo dõi / chưa kiểm', '', '', demMuc('theo_doi')],
    ['Ô bị app tự sửa', '', '', o.thayDoi.length],
  ]);

  const thuTu = { chan_gui: 0, giai_trinh: 1, theo_doi: 2 } as const;
  bang('Cảnh báo', ['Mã QT', 'Phòng ban', 'Mức độ', 'Dịch vụ', 'Nội dung', 'Số tiền', 'Số dòng', 'Dòng trong raw (tối đa 60)', 'Giải trình của kế toán', 'Head duyệt'],
    [9, 11, 12, 12, 70, 16, 9, 40, 40, 14],
    [...o.canhBao].sort((a, b) => thuTu[a.muc_do] - thuTu[b.muc_do]).map((c) => [
      c.ma_quy_tac, TEN_PHONG_BAN[c.phong_ban], TEN_MUC_DO[c.muc_do], c.loai ? TEN_DICH_VU[c.loai] : 'Cả kỳ', c.noi_dung,
      c.so_tien ?? null, c.dong.length || null, c.dong.slice(0, 60).join(', ') + (c.dong.length > 60 ? '…' : ''), '', '',
    ]));

  bang('App tự sửa', ['Mã QT', 'Dịch vụ', 'Dòng raw', 'Mã giao dịch / Số vé', 'Cột', 'Giá trị raw', 'Giá trị sau sửa', 'Chênh lệch', 'Kế toán xác nhận'],
    [9, 12, 9, 20, 24, 16, 16, 16, 18],
    o.thayDoi.map((t) => [t.ma_quy_tac, TEN_DICH_VU[t.loai], t.dong, t.ma_giao_dich, t.cot, t.truoc, t.sau, t.sau - t.truoc, '']));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
