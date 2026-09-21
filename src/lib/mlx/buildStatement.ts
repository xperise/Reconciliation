import type ExcelJS from 'exceljs';
import { COLUMNS, ISSUER, STATEMENT_TITLE, VAT_RATE } from './config';
import { periodLabel, periodRangeText, safeFileName, safeSheetName } from './normalize';
import type { MlxCustomer, Period, RawRow } from './types';

const FONT_TEXT = 'Arial';
const FONT_HEAD = 'Times New Roman';
const FONT_TITLE = 'Calibri';
const MONEY = '#,##0';
const DATE_FMT = 'dd/mm/yyyy hh:mm:ss';

const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

/** Bố cục (khớp template "Trang tính1", đã bỏ dòng mô tả 11 và Số SK) */
const HEADER_ROW = 10;
const FIRST_DATA_ROW = 11;
const LAST_COL = COLUMNS.length; // 15 = cột O

export interface BuildInput {
  customer: MlxCustomer;
  period: Period;
  rows: RawRow[];
}

export function outputNames(customer: MlxCustomer, period: Period) {
  const ten = customer.ten_cong_ty.trim();
  // Cú pháp tên file: mã hợp đồng_tên khách hàng. Chưa có mã hợp đồng thì lùi
  // về mã khách hàng, rồi tên viết tắt, rồi chỉ còn tên khách hàng.
  const ma = customer.ma_hop_dong?.trim() || customer.ma_khach_hang?.trim() || customer.ten_viet_tat?.trim() || '';
  return {
    fileName: `${safeFileName(ma ? `${ma}_${ten}` : ten)}.xlsx`,
    sheetName: safeSheetName(ma ? `${ma} - ${ten}` : ten),
    period: periodLabel(period),
  };
}

/** Dựng workbook bảng kê cho 1 khách hàng, trả về buffer .xlsx */
export async function buildStatement(
  ExcelJSLib: typeof ExcelJS,
  { customer, period, rows }: BuildInput,
): Promise<{ fileName: string; buffer: ArrayBuffer; total: number; payable: number }> {
  const { fileName, sheetName } = outputNames(customer, period);
  const wb = new ExcelJSLib.Workbook();
  wb.creator = 'Xperise – MLX';
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false }],
  });
  ws.pageSetup.printTitlesRow = `${HEADER_ROW}:${HEADER_ROW}`;
  COLUMNS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));

  // ---- Khối pháp nhân phát hành (A1:A3) ----
  const headFont: Partial<ExcelJS.Font> = { name: FONT_HEAD, size: 11 };
  [
    [1, ISSUER.name, true],
    [2, ISSUER.address, false],
    [3, `MST: ${ISSUER.mst}`, false],
  ].forEach(([r, text, bold]) => {
    ws.mergeCells(r as number, 1, r as number, 8);
    const cell = ws.getCell(r as number, 1);
    cell.value = text as string;
    cell.font = { ...headFont, bold: bold as boolean };
  });

  // ---- Tiêu đề + kỳ + khách hàng (B4:O7) ----
  const centered = (r: number, text: string, font: Partial<ExcelJS.Font>) => {
    ws.mergeCells(r, 2, r, LAST_COL);
    const cell = ws.getCell(r, 2);
    cell.value = text;
    cell.font = font;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  };
  centered(4, STATEMENT_TITLE, { name: FONT_TITLE, size: 13, bold: true });
  ws.getRow(4).height = 22;
  centered(5, periodRangeText(period), { name: FONT_TITLE, size: 11 });
  centered(6, customer.ten_cong_ty.trim(), { name: FONT_TITLE, size: 11, bold: true });
  const addr = [customer.dia_chi?.trim(), customer.mst?.trim() ? `MST: ${customer.mst.trim()}` : '']
    .filter(Boolean)
    .join(' - ');
  centered(7, addr, { name: FONT_TITLE, size: 11 });

  // ---- Header bảng chi tiết ----
  const header = ws.getRow(HEADER_ROW);
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: FONT_TEXT, size: 11, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0C0C0' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDER;
  });
  header.height = 30;

  // ---- Dữ liệu: giữ nguyên thứ tự & toàn bộ dòng của file raw ----
  rows.forEach((r, idx) => {
    const row = ws.getRow(FIRST_DATA_ROW + idx);
    const values: Record<string, unknown> = {
      ...r,
      stt: idx + 1, // đánh số lại liên tục vì đã bỏ các dòng 0đ
    };
    COLUMNS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = values[c.key];
      cell.value = (v === '' ? null : v) as ExcelJS.CellValue;
      cell.font = { name: FONT_TEXT, size: 11 };
      cell.border = BORDER;
      cell.alignment = { vertical: 'middle' };
      if (v instanceof Date) {
        cell.numFmt = DATE_FMT;
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (c.key === 'soTien') {
        cell.numFmt = MONEY;
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (c.key === 'stt' || c.key === 'khoangCach') {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (c.key === 'maNV' || c.key === 'soThe' || c.key === 'soGiaoDich') {
        cell.numFmt = '@'; // text: giữ số 0 đầu, tránh Excel đổi sang số khoa học
      }
    });
  });

  const lastDataRow = FIRST_DATA_ROW + Math.max(rows.length, 1) - 1;
  if (rows.length === 0) {
    COLUMNS.forEach((_, i) => (ws.getCell(FIRST_DATA_ROW, i + 1).border = BORDER));
  }
  const total = rows.reduce((s, r) => s + (r.soTien ?? 0), 0);

  // ---- Dòng Tổng ----
  const totalRow = lastDataRow + 1;
  const jCol = COLUMNS.findIndex((c) => c.key === 'soTien') + 1; // J
  const J = ws.getColumn(jCol).letter;
  ws.mergeCells(totalRow, 1, totalRow, jCol - 1);
  const tLabel = ws.getCell(totalRow, 1);
  tLabel.value = 'Tổng';
  tLabel.font = { name: FONT_TEXT, size: 11, bold: true };
  tLabel.alignment = { horizontal: 'center', vertical: 'middle' };
  const tCell = ws.getCell(totalRow, jCol);
  tCell.value = { formula: `SUM(${J}${FIRST_DATA_ROW}:${J}${lastDataRow})`, result: total };
  tCell.numFmt = MONEY;
  tCell.font = { name: FONT_TEXT, size: 11, bold: true };
  for (let c = 1; c <= LAST_COL; c++) ws.getCell(totalRow, c).border = BORDER;

  // ---- Bảng tổng hợp (nhãn G:H, giá trị I:J) ----
  const rate = (Number(customer.chiet_khau) || 0) / 100;
  const discount = Math.round(total * rate);
  const beforeVat = Math.round((total - discount) / (1 + VAT_RATE));
  const vat = total - discount - beforeVat;
  const payable = beforeVat + vat;

  const s0 = totalRow + 2;
  const I = (n: number) => `I${s0 + n}`;
  const pctText = `${+(rate * 100).toFixed(3)}%`;
  const lines: [string, ExcelJS.CellValue, boolean][] = [
    ['1. Cước phí taxi', { formula: `${J}${totalRow}`, result: total }, false],
    [`2. Số tiền chiết khấu (${pctText})`, { formula: `ROUND(${I(0)}*${rate},0)`, result: discount }, false],
    ['3. Số tiền chưa bao gồm VAT', { formula: `ROUND((${I(0)}-${I(1)})/${1 + VAT_RATE},0)`, result: beforeVat }, false],
    [`4. Số tiền VAT (${VAT_RATE * 100}%)`, { formula: `${I(0)}-${I(1)}-${I(2)}`, result: vat }, false],
    ['5. Phí khác (Nếu có)', 0, false],
    ['6. Phí phát hành thẻ', 0, false],
    ['7. TỔNG SỐ TIỀN THANH TOÁN', { formula: `${I(2)}+${I(3)}+${I(4)}+${I(5)}`, result: payable }, true],
  ];
  lines.forEach(([label, value, bold], n) => {
    const r = s0 + n;
    ws.mergeCells(r, 7, r, 8);
    ws.mergeCells(r, 9, r, 10);
    const l = ws.getCell(r, 7);
    l.value = label;
    l.font = { name: FONT_TITLE, size: 11, bold };
    l.alignment = { horizontal: 'left', vertical: 'middle' };
    const v = ws.getCell(r, 9);
    v.value = value;
    v.numFmt = MONEY;
    v.font = { name: FONT_TITLE, size: 11, bold };
    v.alignment = { horizontal: 'right', vertical: 'middle' };
    [7, 8, 9, 10].forEach((c) => (ws.getCell(r, c).border = BORDER));
  });

  // ---- Chữ ký ----
  const sig = s0 + lines.length + 2;
  (
    [
      [2, 3, 'Xác nhận của khách hàng'],
      [7, 8, 'Nhân viên quản lý'],
      [12, 13, 'Thủ trưởng đơn vị'],
    ] as const
  ).forEach(([c1, c2, text]) => {
    ws.mergeCells(sig, c1, sig, c2);
    const cell = ws.getCell(sig, c1);
    cell.value = text;
    cell.font = { name: FONT_TITLE, size: 11, bold: true };
    cell.alignment = { horizontal: 'center' };
    ws.mergeCells(sig + 1, c1, sig + 1, c2);
    const note = ws.getCell(sig + 1, c1);
    note.value = '(Ký, ghi rõ họ tên)';
    note.font = { name: FONT_TITLE, size: 10, italic: true };
    note.alignment = { horizontal: 'center' };
  });

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { fileName, buffer, total, payable };
}
