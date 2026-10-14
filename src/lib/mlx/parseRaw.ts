import type ExcelJS from 'exceljs';
import { COLUMNS, type ColumnKey } from './config';
import { normalizeText, parseFileName } from './normalize';
import type { ParsedRawFile, Period, RawRow } from './types';

type Workbook = ExcelJS.Workbook;
type CellValue = ExcelJS.CellValue;

/** Lấy giá trị "thô" của ô: xử lý rich text, công thức, hyperlink */
function unwrap(v: CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((r) => r.text).join('');
    }
    if ('result' in o) return unwrap(o.result as CellValue);
    if ('text' in o) return unwrap(o.text as CellValue);
    if ('error' in o) return null;
  }
  return v;
}

function asText(v: CellValue): string {
  const u = unwrap(v);
  if (u === null) return '';
  if (u instanceof Date) return u.toISOString();
  return String(u).trim();
}

/**
 * Ngày: nếu ô là Date thì giữ; nếu là text "dd/mm/yyyy hh:mm[:ss]" thì parse.
 * Mọi Date dùng giờ UTC để Excel hiển thị đúng giờ gốc, không lệch múi giờ.
 * Text không parse được → giữ nguyên text (không làm mất dữ liệu).
 */
function asDate(v: CellValue): Date | string | null {
  const u = unwrap(v);
  if (u === null || u === '') return null;
  if (u instanceof Date) return u;
  if (typeof u === 'number') {
    // Serial Excel (hiếm khi gặp khi đọc bằng ExcelJS, phòng hờ)
    return new Date(Math.round((u - 25569) * 86400000));
  }
  const s = String(u).trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
  }
  return s;
}

/** Số tiền: chấp nhận số hoặc text "550,000" / "550.000" */
function asMoney(v: CellValue): number | null {
  const u = unwrap(v);
  if (u === null || u === '') return null;
  if (typeof u === 'number') return u;
  const digits = String(u).replace(/[^\d-]/g, '');
  return digits ? Number(digits) : null;
}

function asNumberOrText(v: CellValue): number | string | null {
  const u = unwrap(v);
  if (u === null || u === '') return null;
  if (typeof u === 'number') return u;
  const s = String(u).trim();
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && /^[\d.,]+$/.test(s) ? n : s;
}

const DATE_KEYS: ColumnKey[] = ['ngayGiaoDich', 'ngayDiThucTe', 'ngayHieuLuc'];

/**
 * Gộp chữ trên một dòng thành một chuỗi, để dò thông tin ở phần đầu bảng kê.
 * Phần đầu bảng kê CMS dùng ô gộp (merge) trải dài nhiều cột; mọi ô con trong
 * vùng gộp đều trả về giá trị của ô gốc, nên phải bỏ ô con để tên không bị lặp.
 */
function textOfRow(ws: ExcelJS.Worksheet, r: number): string {
  const parts: string[] = [];
  ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
    const master = (cell as unknown as { master?: { address?: string } }).master;
    if (master?.address && master.address !== cell.address) return; // ô con của vùng gộp
    const t = asText(cell.value);
    if (t && parts[parts.length - 1] !== t) parts.push(t);
  });
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** "Từ ngày 26/08/2026 Đến ngày 25/09/2026" → kỳ tháng 09/2026 (lấy theo ngày kết thúc) */
function periodFromRangeText(text: string): Period | null {
  const m = /đến\s*ngày\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(text.normalize('NFC'));
  if (!m) return null;
  const month = +m[2];
  const year = +m[3];
  return month >= 1 && month <= 12 && year >= 2000 && year <= 2100 ? { month, year } : null;
}

/** Tách "C493 - CÔNG TY TNHH CONTROL UNION VIỆT NAM" → mã C493 + tên công ty */
function splitCodeAndName(text: string): { code: string; name: string } {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = /^([A-Za-z0-9]{2,10})\s*[-–]\s*(.+)$/.exec(t);
  return m ? { code: m[1].toUpperCase(), name: m[2].trim() } : { code: '', name: t };
}

/**
 * Đọc phần đầu của bảng kê CMS: kỳ, mã khách, tên công ty, MST.
 * Bố cục CMS: … · tiêu đề "BẢNG KÊ…" · kỳ · tên khách · địa chỉ kèm MST · tiêu đề cột.
 * Dò theo nội dung chứ không theo số dòng cứng, phòng khi CMS đổi bố cục.
 */
function readCmsHeader(ws: ExcelJS.Worksheet, headerRow: number) {
  let period: Period | null = null;
  let code = '';
  let name = '';
  let mst = '';

  let dongKy = 0;
  for (let r = 1; r < headerRow; r++) {
    const t = textOfRow(ws, r);
    if (!t) continue;
    if (!period) {
      const p = periodFromRangeText(t);
      if (p) {
        period = p;
        dongKy = r;
      }
    }
  }

  if (dongKy) {
    // Dòng ngay dưới dòng kỳ là tên khách hàng, dòng kế tiếp là địa chỉ kèm MST
    for (let r = dongKy + 1; r < headerRow; r++) {
      const t = textOfRow(ws, r);
      if (!t) continue;
      if (!name) {
        const parts = splitCodeAndName(t);
        code = parts.code;
        name = parts.name;
        continue;
      }
      const m = /MST\s*:?\s*([0-9][0-9-]*)/i.exec(t);
      if (m) {
        mst = m[1];
        break;
      }
    }
  }
  return { period, code, name, mst };
}

/**
 * Đọc 1 file Excel tải lên → dữ liệu chuẩn.
 *
 * Nhận cả hai loại file:
 * - XPAY: file raw, tiêu đề cột nằm ngay dòng đầu, danh tính khách lấy từ tên file.
 * - CMS : bảng kê đã format sẵn, danh tính khách và kỳ đọc thẳng trong file.
 */
export async function parseRawFile(
  ExcelJSLib: typeof ExcelJS,
  fileName: string,
  data: ArrayBuffer,
): Promise<ParsedRawFile> {
  const wb: Workbook = new ExcelJSLib.Workbook();
  await wb.xlsx.load(data);

  // Tìm sheet + dòng header có "STT" và "Số thẻ"
  let found: { ws: ExcelJS.Worksheet; headerRow: number } | null = null;
  for (const ws of wb.worksheets) {
    const limit = Math.min(ws.rowCount, 30);
    for (let r = 1; r <= limit; r++) {
      const texts = (ws.getRow(r).values as CellValue[]).map((v) => normalizeText(asText(v)));
      if (texts.includes('stt') && texts.includes('so the')) {
        found = { ws, headerRow: r };
        break;
      }
    }
    if (found) break;
  }
  if (!found) throw new Error('Không tìm thấy dòng tiêu đề (cần có cột "STT" và "Số thẻ").');

  const { ws, headerRow } = found;

  // Map key → số cột theo tên header
  const colIndex = new Map<ColumnKey, number>();
  ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
    const h = normalizeText(asText(cell.value));
    const def = COLUMNS.find((c) => (c.aliases as readonly string[]).includes(h));
    if (def && !colIndex.has(def.key)) colIndex.set(def.key, col);
  });
  const missing = COLUMNS.filter((c) => c.key !== 'khoangCach' && !colIndex.has(c.key));
  if (missing.length) {
    throw new Error(`Thiếu cột: ${missing.map((c) => c.header).join(', ')}`);
  }

  const rows: RawRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: ColumnKey): CellValue => {
      const c = colIndex.get(k);
      return c ? row.getCell(c).value : null;
    };
    // Bỏ dòng hoàn toàn trống (không phải dòng dữ liệu)
    const isEmpty = COLUMNS.every((c) => asText(get(c.key)) === '');
    if (isEmpty) continue;
    // Dừng nếu gặp dòng "Tổng" (trường hợp file raw đã có dòng tổng)
    if (normalizeText(asText(get('stt'))) === 'tong') break;

    const sttRaw = unwrap(get('stt'));
    const rawRow: RawRow = {
      stt: typeof sttRaw === 'number' ? sttRaw : sttRaw === null ? null : String(sttRaw),
      soThe: asText(get('soThe')),
      sanPham: asText(get('sanPham')),
      ngayGiaoDich: null,
      ngayDiThucTe: null,
      ngayHieuLuc: null,
      tenTrenThe: asText(get('tenTrenThe')),
      bienSoXe: asText(get('bienSoXe')),
      maNV: asText(get('maNV')), // giữ text để không mất số 0 đầu
      soTien: asMoney(get('soTien')),
      soGiaoDich: asText(get('soGiaoDich')),
      diemDon: asText(get('diemDon')),
      diemTra: asText(get('diemTra')),
      donViPhatSinh: asText(get('donViPhatSinh')),
      khoangCach: asNumberOrText(get('khoangCach')),
    };
    for (const k of DATE_KEYS) (rawRow as unknown as Record<string, unknown>)[k] = asDate(get(k));
    rows.push(rawRow);
  }

  // Dòng 0đ (khởi tạo hệ thống, giao dịch huỷ…) không đưa vào bảng kê
  const giuLai = rows.filter((r) => (r.soTien ?? 0) !== 0);
  const zeroRows = rows.length - giuLai.length;
  const total = giuLai.reduce((s, r) => s + (r.soTien ?? 0), 0);

  // Danh tính khách lấy từ tên file: "Tên công ty_Kỳ" (XPAY) hoặc
  // "Mã hợp đồng_Tên công ty" (CMS). Mã là cụm số/chữ ở ngay đầu tên file.
  const { company: tenTuFile, period: kyTuFile } = parseFileName(fileName);
  const dauTenFile = /^([A-Za-z0-9]{3,12})[\s_-]+(.+)$/.exec(tenTuFile);

  // CMS luôn có khối tiêu đề phía trên bảng; file raw XPAY thì không
  const coTieuDeBangKe = Array.from({ length: headerRow - 1 }, (_, i) =>
    normalizeText(textOfRow(ws, i + 1)),
  ).some((t) => t.includes('bang ke'));
  const cms = readCmsHeader(ws, headerRow);
  const laCms = headerRow > 1 && (coTieuDeBangKe || cms.period !== null);

  if (laCms) {
    return {
      fileName,
      source: 'CMS',
      // Ưu tiên dữ liệu đọc trong file, thiếu thì lùi về tên file
      companyFromFile: cms.name || dauTenFile?.[2] || tenTuFile,
      codeFromFile: cms.code || dauTenFile?.[1] || '',
      mstFromFile: cms.mst,
      periodFromFile: cms.period ?? kyTuFile,
      rows: giuLai,
      zeroRows,
      total,
    };
  }

  return {
    fileName,
    source: 'XPAY',
    companyFromFile: tenTuFile,
    codeFromFile: '',
    mstFromFile: '',
    periodFromFile: kyTuFile,
    rows: giuLai,
    zeroRows,
    total,
  };
}
