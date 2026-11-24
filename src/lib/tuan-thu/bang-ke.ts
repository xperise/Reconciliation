import ExcelJS from 'exceljs';
import { chuoiNgay } from './raw';
import { coTien, COT_TT_DA_VAT } from './tinh';
import { DongRaw, LoaiDichVu, ThamSoHopDong } from './types';

/** Cột của bảng kê gửi khách: [nhãn trên bảng kê, cột raw]. Theo PL01 + phần mở rộng đang dùng. */
export const COT_KS: [string, string][] = [
  ['STT', '#'], ['Tên khách sạn', 'Tên khách sạn'], ['Địa bàn', 'Địa bàn'], ['Hạng phòng', 'Hạng phòng'],
  ['Nội địa/Quốc tế', 'Nội địa/Quốc tế'], ['Ngày giao dịch', 'Ngày giao dịch'], ['Người đặt dịch vụ', 'Người đặt dịch vụ'],
  ['Người duyệt chuyến đi', 'Người duyệt chuyến đi'], ['Bypass approve name', 'Bypass approve name'],
  ['Bypass approve email', 'Bypass approve email'], ['Trip ID', 'Trip ID'], ['Phòng ban', 'Phòng ban'],
  ['Ngày checkin/Ngày đi', 'Ngày checkin/Ngày đi'], ['Họ và tên Khách', 'Họ và tên Khách'],
  ['Chức danh hành khách', 'Chức danh hành khách'], ['Mã cán bộ', 'Mã cán bộ'], ['Giới tính', 'Giới tính'],
  ['Cost center', 'Cost center'], ['Ngày checkout/Ngày về', 'Ngày checkout/Ngày về'], ['Tên chuyến đi', 'Tên chuyến đi'],
  ['Đơn giá', 'Đơn giá'], ['Số lượng phòng', 'Số lượng phòng'], ['Số lượng đêm', 'Số lượng đêm'],
  ['Thành tiền chưa VAT', 'Thành tiền chưa VAT'], ['VAT', 'VAT'], ['Thành tiền (đã VAT)', 'Thành tiền (đã VAT)'],
  ['Phí dịch vụ chưa VAT', 'Phí dịch vụ chưa VAT'], ['VAT phí dịch vụ', 'VAT phí dịch vụ'], ['Tổng phí dịch vụ', 'Tổng phí dịch vụ'],
  ['Chiết khấu trước VAT', 'Chiết khấu trước VAT'], ['VAT chiết khấu', 'VAT chiết khấu'], ['Tổng tiền chiết khấu', 'Tổng tiền chiết khấu'],
  ['Tổng thành tiền', 'Tổng thành tiền'], ['Mã giao dịch', 'Mã giao dịch'], ['Số hóa đơn', 'Số hóa đơn'],
  ['Link hóa đơn', 'Link hóa đơn'], ['Trạng thái', '@trang_thai'], ['Ghi chú', 'Ghi chú'],
];
export const COT_VMB: [string, string][] = [
  ['STT', '#'], ['Tên dịch vụ (Hành trình)', 'Tên dịch vụ (Hành trình)'], ['Nội địa/Quốc tế', 'Nội địa/Quốc tế'],
  ['Ngày giao dịch', 'Ngày giao dịch'], ['Người đặt dịch vụ', 'Người đặt dịch vụ'], ['Người duyệt chuyến đi', 'Người duyệt chuyến đi'],
  ['Bypass approve name', 'Bypass approve name'], ['Bypass approve email', 'Bypass approve email'], ['Trip ID', 'Trip ID'],
  ['Phòng ban', 'Phòng ban'], ['Họ và tên Khách', 'Họ và tên Khách'], ['Chức danh hành khách', 'Chức danh hành khách'],
  ['Mã cán bộ', 'Mã cán bộ'], ['Cost center', 'Cost center'], ['Số vé', 'Số vé'], ['Hạng vé', 'Hạng vé'],
  ['Hạng ghế chuyến đi', 'Hạng ghế chuyến đi'], ['Hạng ghế chuyến về', 'Hạng ghế chuyến về'],
  ['Ngày checkin/Ngày đi', 'Ngày checkin/Ngày đi'], ['Ngày checkout/Ngày về', 'Ngày checkout/Ngày về'],
  ['Tên chuyến đi', 'Tên chuyến đi'], ['Đơn giá', 'Đơn giá'], ['Số lượng', 'Số lượng'],
  ['Thành tiền chưa VAT', 'Thành tiền chưa VAT'], ['VAT', 'VAT'], ['Thành tiền', 'Thành tiền'],
  ['Phí dịch vụ chưa VAT', 'Phí dịch vụ chưa VAT'], ['VAT phí dịch vụ', 'VAT phí dịch vụ'], ['Tổng phí dịch vụ', 'Tổng phí dịch vụ'],
  ['Chiết khấu trước VAT', 'Chiết khấu trước VAT'], ['VAT chiết khấu', 'VAT chiết khấu'], ['Tổng tiền chiết khấu', 'Tổng tiền chiết khấu'],
  ['Tổng thành tiền', 'Tổng thành tiền'], ['Mã giao dịch (Chiều đi)', 'Mã giao dịch (Chiều đi)'],
  ['Mã giao dịch (Chiều về)', 'Mã giao dịch (Chiều về)'], ['Số hóa đơn', 'Số hóa đơn'], ['Link hóa đơn', 'Link hóa đơn'],
  ['Tình trạng sử dụng', '@trang_thai'], ['Ghi chú', 'Ghi chú'],
];
const COT_TIEN = new Set(['Đơn giá', 'Thành tiền chưa VAT', 'VAT', 'Thành tiền', 'Thành tiền (đã VAT)', 'Phí dịch vụ chưa VAT',
  'VAT phí dịch vụ', 'Tổng phí dịch vụ', 'Chiết khấu trước VAT', 'VAT chiết khấu', 'Tổng tiền chiết khấu', 'Tổng thành tiền']);
const COT_CONG = new Set([...COT_TIEN].filter((c) => c !== 'Đơn giá'));

const FONT = { name: 'Arial', size: 9 };
const VIEN = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
const KHUNG = { top: VIEN, left: VIEN, bottom: VIEN, right: VIEN };
const NEN_TIEU_DE = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDDEBF7' } };
const SO = '#,##0;(#,##0);"-"';

function dauTrang(ws: ExcelJS.Worksheet, ts: ThamSoHopDong, nhanKy: string, rongCot: number) {
  const b = ts.ben_ban, m = ts.ben_mua;
  const dong = [
    `Tên đơn vị bán hàng (Seller): ${b.ten}`, `Mã số thuế (Tax code): ${b.mst}`, `Địa chỉ (Address): ${b.dia_chi}`,
    `Điện thoại (Tel.): ${b.dien_thoai}`, `Số tài khoản (A/C No.): ${ts.tai_khoan.so} tại ${ts.tai_khoan.ngan_hang}`,
  ];
  dong.forEach((t, i) => { const c = ws.getCell(i + 1, 1); c.value = t; c.font = { ...FONT, size: 10 }; });
  const tieuDe: [number, string, boolean][] = [[7, 'BẢNG KÊ DỊCH VỤ', true], [8, m.ten, true], [9, nhanKy, false]];
  for (const [r, t, dam] of tieuDe) {
    ws.mergeCells(r, 1, r, Math.min(rongCot, 13));
    const c = ws.getCell(r, 1); c.value = t; c.alignment = { horizontal: 'center' };
    c.font = { ...FONT, size: r === 7 ? 14 : 11, bold: dam };
  }
  const kh: [string, string][] = [['Địa chỉ:', m.dia_chi], ['Mã số thuế (Tax code):', m.mst], ['Số điện thoại (Tel.):', m.dien_thoai]];
  kh.forEach(([a, v], i) => {
    ws.getCell(10 + i, 1).value = a; ws.getCell(10 + i, 1).font = { ...FONT, size: 10 };
    ws.getCell(10 + i, 3).value = v; ws.getCell(10 + i, 3).font = { ...FONT, size: 10 };
  });
}

function sheetChiTiet(wb: ExcelJS.Workbook, ten: string, nhanMuc: string, cot: [string, string][],
  ds: DongRaw[], ts: ThamSoHopDong, nhanKy: string, loai: LoaiDichVu) {
  const ws = wb.addWorksheet(ten, { views: [{ state: 'frozen', ySplit: 15, xSplit: 2 }] });
  dauTrang(ws, ts, nhanKy, cot.length);
  const H = 15;
  cot.forEach(([nhan], i) => {
    const c = ws.getCell(H, i + 1); c.value = nhan; c.font = { ...FONT, bold: true }; c.fill = NEN_TIEU_DE;
    c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; c.border = KHUNG;
    ws.getColumn(i + 1).width = COT_TIEN.has(nhan) ? 14 : nhan === 'STT' ? 6 : 18;
  });
  ws.getRow(H).height = 42;
  ws.getCell(H + 1, 1).value = nhanMuc; ws.getCell(H + 1, 1).font = { ...FONT, bold: true, italic: true };
  let r = H + 2; let stt = 0;
  for (const d of ds) {
    stt += 1;
    cot.forEach(([nhan, nguon], i) => {
      let v: any;
      if (nguon === '#') v = stt;
      else if (nguon === '@trang_thai') {
        const k = `${loai}:${String(d.v['Trạng thái'] ?? '').trim().toLowerCase()}`;
        v = ts.ten_trang_thai[k] ?? d.v['Trạng thái'];
      } else v = d.v[nguon];
      if (v instanceof Date || /Ngày/.test(nhan)) v = chuoiNgay(v);
      const c = ws.getCell(r, i + 1); c.value = v ?? null; c.font = FONT; c.border = KHUNG;
      if (COT_TIEN.has(nhan)) c.numFmt = SO;
    });
    r += 1;
  }
  const dau = H + 2, cuoi = r - 1;
  ws.getCell(r, 1).value = 'TỔNG CỘNG';   // dòng tổng không mang số thứ tự (KT-10)
  cot.forEach(([nhan], i) => {
    const c = ws.getCell(r, i + 1); c.font = { ...FONT, bold: true }; c.border = KHUNG;
    if (COT_CONG.has(nhan)) {
      const L = ws.getColumn(i + 1).letter;
      const tong = ds.reduce((s, d) => s + (typeof d.v[nhan] === 'number' ? d.v[nhan] : 0), 0);
      c.value = { formula: cuoi >= dau ? `SUM(${L}${dau}:${L}${cuoi})` : '0', result: tong }; c.numFmt = SO;
    }
  });
  kyTen(ws, r + 2, Math.max(2, cot.length - 6));
  return { ws, dongTong: r, cot };
}

function kyTen(ws: ExcelJS.Worksheet, r: number, c: number) {
  [['ĐẠI DIỆN UTS', true], ['(Ký & đóng dấu)', false]].forEach(([t, b], i) => {
    const x = ws.getCell(r + i, c); x.value = t as string; x.font = { ...FONT, size: 10, bold: b as boolean }; x.alignment = { horizontal: 'center' };
  });
}

export const CHUA_CO_PB = '(Chưa có phòng ban)';
const tenPB = (d: DongRaw) => String(d.v['Phòng ban'] ?? '').trim() || CHUA_CO_PB;

/** Sheet tổng hợp theo phòng ban: mỗi phòng ban trong danh mục 2 dòng (vé, khách sạn), kể cả khi bằng 0. */
function sheetPhongBan(wb: ExcelJS.Workbook, ts: ThamSoHopDong, nhanKy: string, dong: DongRaw[],
  danhMuc: { ten: string; ma_cost_center: string | null }[]) {
  const ws = wb.addWorksheet('CHI PHÍ PHÒNG BAN', { views: [{ state: 'frozen', ySplit: 16 }] });
  dauTrang(ws, ts, nhanKy, 13);
  const tieu = ['STT/ No.', 'Phòng Ban/ Dept', 'Mã cost center', 'Nội địa/Quốc Tế', 'Dịch vụ/Service', 'Thành Tiền (Chưa VAT)/ AMOUNT',
    'Phí dịch vụ (Chưa VAT)/ SERVICE FEE', 'Chiết khấu thương mại (Chưa VAT)', 'Tổng Tiền (Chưa VAT)', 'Thuế GTGT (VAT)', 'TỔNG CỘNG/ TOTAL',
    'SỐ HÓA ĐƠN (Invoice Number)', 'NGÀY HÓA ĐƠN (Invoice Date)'];
  const H = 16;
  tieu.forEach((t, i) => {
    const c = ws.getCell(H, i + 1); c.value = t; c.font = { ...FONT, bold: true }; c.fill = NEN_TIEU_DE; c.border = KHUNG;
    c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    ws.getColumn(i + 1).width = i === 1 ? 40 : i >= 5 && i <= 10 ? 16 : 13;
  });
  ws.getRow(H).height = 48;
  const n = (x: any) => (typeof x === 'number' ? x : 0);
  // Phòng ban phát sinh nhưng chưa có trong danh mục vẫn được đưa vào (đã cảnh báo ở KT-10)
  const ten = [...danhMuc];
  for (const d of dong) { const p = tenPB(d); if (!ten.some((x) => x.ten === p)) ten.push({ ten: p, ma_cost_center: null }); }
  let r = H + 1, stt = 0;
  for (const pb of ten) {
    for (const loai of ['ve_may_bay', 'khach_san'] as LoaiDichVu[]) {
      const ds = dong.filter((d) => d.loai === loai && tenPB(d) === pb.ten && coTien(d));
      const s = (c: string) => ds.reduce((a, d) => a + n(d.v[c]), 0);
      const chua = s('Thành tiền chưa VAT'), phi = s('Phí dịch vụ chưa VAT'), ck = s('Chiết khấu trước VAT');
      const vat = s('VAT') + s('VAT phí dịch vụ') - s('VAT chiết khấu');
      stt += 1;
      const hang = [stt, pb.ten, pb.ma_cost_center, 'Nội địa', loai === 've_may_bay' ? 'Vé máy bay' : 'Khách sạn'];
      hang.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v as any; c.font = FONT; c.border = KHUNG; });
      const tien: [number, number | { formula: string; result: number }][] = [
        [6, chua], [7, phi], [8, ck], [9, { formula: `F${r}+G${r}-H${r}`, result: chua + phi - ck }],
        [10, vat], [11, { formula: `I${r}+J${r}`, result: chua + phi - ck + vat }],
      ];
      for (const [col, v] of tien) { const c = ws.getCell(r, col); c.value = v as any; c.numFmt = SO; c.font = FONT; c.border = KHUNG; }
      [12, 13].forEach((col) => { ws.getCell(r, col).border = KHUNG; });
      r += 1;
    }
  }
  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value = 'Tổng thanh toán'; ws.getCell(r, 1).font = { ...FONT, bold: true };
  for (const col of [6, 7, 8, 9, 10, 11]) {
    const L = ws.getColumn(col).letter; const c = ws.getCell(r, col);
    let tong = 0; for (let i = H + 1; i < r; i++) { const v: any = ws.getCell(i, col).value; tong += typeof v === 'number' ? v : v?.result ?? 0; }
    c.value = { formula: `SUM(${L}${H + 1}:${L}${r - 1})`, result: tong }; c.numFmt = SO; c.font = { ...FONT, bold: true }; c.border = KHUNG;
  }
  kyTen(ws, r + 2, 9);
}

export async function taoBangKe(opts: {
  ts: ThamSoHopDong; nhanKy: string; dong: DongRaw[];
  danhMucPhongBan: { ten: string; ma_cost_center: string | null }[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Xperise – Tuân thủ bảng kê';
  sheetPhongBan(wb, opts.ts, opts.nhanKy, opts.dong, opts.danhMucPhongBan);
  sheetChiTiet(wb, 'VCB-VMB-TRIP ID', 'Dịch vụ vé máy bay', COT_VMB, opts.dong.filter((d) => d.loai === 've_may_bay'), opts.ts, opts.nhanKy, 've_may_bay');
  sheetChiTiet(wb, 'VCB-KS-TRIP ID', 'Dịch vụ khách sạn', COT_KS, opts.dong.filter((d) => d.loai === 'khach_san'), opts.ts, opts.nhanKy, 'khach_san');
  return Buffer.from(await wb.xlsx.writeBuffer());
}
export { COT_TT_DA_VAT };
