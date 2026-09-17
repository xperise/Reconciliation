import type ExcelJS from 'exceljs';
import { COLUMNS, type ColumnKey } from './config';
import { normalizeText, parseFileName } from './normalize';
import type { ParsedRawFile, RawRow } from './types';

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

/** Đọc 1 file raw (ArrayBuffer) → dữ liệu chuẩn. Giữ nguyên toàn bộ dòng. */
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

  const { company, period } = parseFileName(fileName);
  const total = rows.reduce((s, r) => s + (r.soTien ?? 0), 0);
  return { fileName, companyFromFile: company, periodFromFile: period, rows, total };
}
