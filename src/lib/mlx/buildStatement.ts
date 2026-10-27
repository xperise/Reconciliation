import type ExcelJS from 'exceljs';
import { COLUMNS, ISSUER, STATEMENT_TITLE, VAT_RATE } from './config';
import { periodLabel, periodRangeText, safeFileName, safeSheetName } from './normalize';
import type { MlxCustomer, Period, RawRow, Source } from './types';
import { computeDiscount, type DiscountResult } from './discount';

const FONT_TEXT = 'Arial';
const FONT_HEAD = 'Times New Roman';
const FONT_TITLE = 'Calibri';
const MONEY = '#,##0';
const DATE_FMT = 'dd/mm/yyyy hh:mm:ss';

const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

/**
 * Bố cục (khớp template "Trang tính1", đã bỏ dòng mô tả và Số SK).
 * Dòng 1–3 pháp nhân · 4 tiêu đề · 5 kỳ · 6 tên khách · 7 địa chỉ · 8 trống
 * · 9 tiêu đề cột · 10 trở đi là dữ liệu.
 * Mọi phần bên dưới (dòng Tổng, bảng tổng hợp, chữ ký) tự dịch theo 2 hằng số này.
 */
const HEADER_ROW = 9;
const FIRST_DATA_ROW = 10;
const LAST_COL = COLUMNS.length; // 15 = cột O

export interface BuildInput {
  customer: MlxCustomer;
  period: Period;
  rows: RawRow[];
  /** Nguồn của từng dòng (cùng thứ tự với rows) — để chia doanh số và liệt kê cuốc ≥ 700k */
  sources?: Source[];
  /** Chiết khấu đã tính trên tổng 3 nguồn. Không truyền = % cố định trong master data (cách cũ) */
  discount?: DiscountResult;
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
  { customer, period, rows, sources, discount: dsc }: BuildInput,
): Promise<{ fileName: string; buffer: ArrayBuffer; total: number; payable: number; discount: number }> {
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
  const D = dsc ?? computeDiscount(rows.map((r) => r.soTien ?? 0), null, Number(customer.chiet_khau) || 0);
  const discount = D.discount;
  const beforeVat = Math.round((total - discount) / (1 + VAT_RATE));
  const vat = total - discount - beforeVat;
  const payable = beforeVat + vat;

  const s0 = totalRow + 2;
  const I = (n: number) => `I${s0 + n}`;
  const flat = D.rule.kind === 'FLAT' ? (D.rule.pct || 0) / 100 : null;
  const ckLabel = D.rule.kind === 'FLAT' ? `${String(+(D.rule.pct || 0).toFixed(3)).replace('.', ',')}%` : D.rule.kind === 'SGS' ? 'SGS – xem sheet Chiết khấu' : `${D.rule.kind === 'CK4' ? 'CK 4' : 'CK 5'} lũy tiến – xem sheet Chiết khấu`;
  const lines: [string, ExcelJS.CellValue, boolean][] = [
    ['1. Cước phí taxi', { formula: `${J}${totalRow}`, result: total }, false],
    [`2. Số tiền chiết khấu (${ckLabel})`, flat != null ? { formula: `ROUND(${I(0)}*${flat},0)`, result: discount } : discount, false],
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

  if (D.rule.kind !== 'FLAT' || sources?.length) addDiscountSheet(wb, customer, period, rows, sources, D);
  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { fileName, buffer, total, payable, discount };
}

/** Sheet "Chiết khấu": doanh số theo nguồn, bảng bậc CK 4 / CK 5 hoặc T700 · CK1 · CK2 của SGS */
function addDiscountSheet(wb: ExcelJS.Workbook, customer: MlxCustomer, period: Period, rows: RawRow[], sources: Source[] | undefined, D: DiscountResult) {
  const ws = wb.addWorksheet('Chiết khấu', { views: [{ showGridLines: false }] });
  [26, 18, 16, 18, 20, 16, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const F = (bold = false, size = 11): Partial<ExcelJS.Font> => ({ name: FONT_TITLE, size, bold });
  const put = (r: number, c: number, v: ExcelJS.CellValue, o: { bold?: boolean; money?: boolean; pct?: boolean; border?: boolean } = {}) => {
    const cell = ws.getCell(r, c); cell.value = v; cell.font = F(!!o.bold);
    if (o.money) { cell.numFmt = MONEY; cell.alignment = { horizontal: 'right' }; }
    if (o.pct) { cell.numFmt = '0.0%'; cell.alignment = { horizontal: 'right' }; }
    if (o.border) cell.border = BORDER;
  };
  put(1, 1, 'DIỄN GIẢI CHIẾT KHẤU', { bold: true }); ws.getCell(1, 1).font = F(true, 13);
  put(2, 1, customer.ten_cong_ty.trim()); put(3, 1, periodRangeText(period));
  put(4, 1, `Loại CK: ${D.rule.label}${D.rule.kind === 'SGS' && D.rule.raw ? ` (bảng phân loại: ${D.rule.raw})` : ''}`, { bold: true });
  // doanh số theo nguồn — chiết khấu tính trên TỔNG, không tính riêng từng nguồn
  let r = 6;
  put(r, 1, 'Nguồn', { bold: true, border: true }); put(r, 2, 'Số cuốc', { bold: true, border: true }); put(r, 3, 'Số tiền', { bold: true, border: true }); r++;
  const by: Record<string, [number, number]> = {};
  rows.forEach((x, i) => { const k = sources?.[i] === 'BE' ? 'Be' : sources?.[i] ?? 'Bảng kê'; const a = (by[k] = by[k] ?? [0, 0]); a[0]++; a[1] += x.soTien ?? 0; });
  for (const k of ['CMS', 'XPAY', 'Be', 'Bảng kê']) if (by[k]) { put(r, 1, k, { border: true }); put(r, 2, by[k][0], { border: true }); put(r, 3, by[k][1], { money: true, border: true }); r++; }
  put(r, 1, 'Tổng doanh số (T)', { bold: true, border: true }); put(r, 2, rows.length, { bold: true, border: true }); put(r, 3, D.total, { bold: true, money: true, border: true });
  r += 2;
  if (D.tiers) {
    ['Phần còn lại', 'Độ rộng bậc', '% CK', 'Tiền CK'].forEach((h, i) => put(r, i + 1, h, { bold: true, border: true })); r++;
    for (const t of D.tiers) { put(r, 1, t.rest, { money: true, border: true }); put(r, 2, t.width == null ? 'phần còn lại' : t.width, { money: t.width != null, border: true }); put(r, 3, t.pct, { pct: true, border: true }); put(r, 4, Math.round(t.amount), { money: true, border: true }); r++; }
    put(r, 1, 'Tiền chiết khấu', { bold: true, border: true }); put(r, 4, D.discount, { bold: true, money: true, border: true });
  } else if (D.rule.kind === 'SGS') {
    const L: [string, number][] = [['T700 = tổng cuốc ≥ 700.000', D.t700 ?? 0], ['CK1 = T700 × 2%', D.ck1 ?? 0], ['T − CK1', D.total - (D.ck1 ?? 0)], ['CK2 = (T − CK1) × 8,5%', D.ck2 ?? 0], ['Tiền chiết khấu = CK1 + CK2', D.discount]];
    L.forEach(([k, v], i) => { put(r, 1, k, { bold: i === L.length - 1, border: true }); put(r, 3, i === 3 ? Math.round(v * 100) / 100 : v, { money: true, bold: i === L.length - 1, border: true }); r++; });
    r++; put(r, 1, `Các cuốc ≥ 700.000 (${n(D.trips700?.length)} cuốc)`, { bold: true }); r++;
    ['Nguồn', 'Ngày đi', 'Số thẻ / người đi', 'Biển số', 'Số giao dịch', 'Số tiền'].forEach((h, i) => put(r, i + 1, h, { bold: true, border: true })); r++;
    for (const i of D.trips700 ?? []) { const x = rows[i];
      put(r, 1, sources?.[i] === 'BE' ? 'Be' : sources?.[i] ?? '', { border: true }); put(r, 2, x.ngayDiThucTe ?? x.ngayGiaoDich ?? '', { border: true });
      if (x.ngayDiThucTe instanceof Date || x.ngayGiaoDich instanceof Date) ws.getCell(r, 2).numFmt = 'dd/mm/yyyy';
      put(r, 3, x.soThe || x.tenTrenThe, { border: true }); put(r, 4, x.bienSoXe, { border: true }); put(r, 5, x.soGiaoDich, { border: true }); put(r, 6, x.soTien ?? 0, { money: true, border: true }); r++; }
  } else {
    put(r, 1, `Tiền chiết khấu = T × ${String(+(D.rule.pct || 0).toFixed(3)).replace('.', ',')}%`, { bold: true, border: true }); put(r, 3, D.discount, { bold: true, money: true, border: true });
  }
}
const n = (x: number | undefined) => new Intl.NumberFormat('vi-VN').format(x ?? 0);
