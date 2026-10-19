import type ExcelJS from 'exceljs';
import { normalizeText } from './normalize';
import type { Period, RawRow } from './types';

type CellValue = ExcelJS.CellValue;

/**
 * Đọc bảng kê raw của Be.
 *
 * Khác hẳn XPAY và CMS: Be xuất một bảng rộng 34 cột với tên cột song ngữ.
 * Một chuyến có phụ phí được tách thành nhiều dòng DÙNG CHUNG Session ID —
 * dòng đầu là cước (fare), các dòng sau là phụ phí (sub fee). Bảng kê MLX chỉ
 * hiện một dòng cho mỗi chuyến, Số tiền = cước + phụ phí.
 *
 * Dòng REFUND có Total amount = 0 nên tự rụng theo luật bỏ dòng 0đ sẵn có.
 */

/** Các cột cần dùng; nhận diện theo phần đầu tên cột đã bỏ dấu */
const COT = {
  ngay: 'ngay giao dich',
  gio: 'gio giao dich',
  khach: 'ho ten khach',
  maNV: 'ma nv',
  diemDi: 'diem di',
  diemDen: 'diem den',
  bienSo: 'bien so',
  tripId: 'trip id',
  sessionId: 'session id',
  maBooking: 'ma booking',
  tongTien: 'total amount',
} as const;

type CotKey = keyof typeof COT;

function unwrap(v: CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join('');
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

function asMoney(v: CellValue): number {
  const u = unwrap(v);
  if (u === null || u === '') return 0;
  if (typeof u === 'number') return u;
  const d = String(u).replace(/[^\d-]/g, '');
  return d ? Number(d) : 0;
}

const THANG: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "Sep 30, 2026" · "30/09/2026" · ô kiểu ngày → {y,m,d} */
function docNgay(v: CellValue): { y: number; m: number; d: number } | null {
  const u = unwrap(v);
  if (u instanceof Date) {
    return { y: u.getUTCFullYear(), m: u.getUTCMonth() + 1, d: u.getUTCDate() };
  }
  const s = String(u ?? '').trim();
  if (!s) return null;
  let m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s*(\d{4})$/.exec(s);
  if (m) {
    const thang = THANG[m[1].toLowerCase()];
    if (thang) return { y: +m[3], m: thang, d: +m[2] };
  }
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return { y: +m[3], m: +m[2], d: +m[1] };
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  return null;
}

/** "17:36:00" · ô kiểu giờ · phân số ngày của Excel → số giây trong ngày */
function docGio(v: CellValue): { h: number; p: number; g: number } {
  const u = unwrap(v);
  if (u instanceof Date) return { h: u.getUTCHours(), p: u.getUTCMinutes(), g: u.getUTCSeconds() };
  if (typeof u === 'number') {
    const giay = Math.round((u % 1) * 86400);
    return { h: Math.floor(giay / 3600), p: Math.floor((giay % 3600) / 60), g: giay % 60 };
  }
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(u ?? '').trim());
  return m ? { h: +m[1], p: +m[2], g: +(m[3] ?? 0) } : { h: 0, p: 0, g: 0 };
}

/** Kỳ của một ngày theo chu kỳ 26–25: từ ngày 26 trở đi thuộc kỳ tháng sau */
export function kyCuaNgay(d: { y: number; m: number; d: number }): Period {
  if (d.d >= 26) {
    return d.m === 12 ? { year: d.y + 1, month: 1 } : { year: d.y, month: d.m + 1 };
  }
  return { year: d.y, month: d.m };
}

/** Dò vị trí các cột của Be trên dòng tiêu đề */
function doCot(ws: ExcelJS.Worksheet, headerRow: number): Partial<Record<CotKey, number>> {
  const viTri: Partial<Record<CotKey, number>> = {};
  ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
    const h = normalizeText(asText(cell.value));
    for (const [key, dau] of Object.entries(COT) as [CotKey, string][]) {
      if (viTri[key] === undefined && h.startsWith(dau)) viTri[key] = col;
    }
  });
  return viTri;
}

/** File có phải bảng kê Be không: nhận theo bộ cột đặc trưng */
export function laSheetBe(ws: ExcelJS.Worksheet): boolean {
  const limit = Math.min(ws.rowCount, 5);
  for (let r = 1; r <= limit; r++) {
    const c = doCot(ws, r);
    if (c.sessionId !== undefined && c.tongTien !== undefined && c.maBooking !== undefined) return true;
  }
  return false;
}

export interface KetQuaBe {
  rows: RawRow[];
  /** Số dòng raw đã gộp lại (chuyến có phụ phí) */
  gopPhuPhi: number;
  period: Period | null;
}

/**
 * Đọc sheet Be → các dòng đã gộp theo Session ID.
 * Giữ nguyên thứ tự xuất hiện của Session ID đầu tiên.
 */
export function docSheetBe(ws: ExcelJS.Worksheet): KetQuaBe {
  let headerRow = 0;
  let cot: Partial<Record<CotKey, number>> = {};
  const limit = Math.min(ws.rowCount, 5);
  for (let r = 1; r <= limit; r++) {
    const c = doCot(ws, r);
    if (c.sessionId !== undefined && c.tongTien !== undefined) {
      headerRow = r;
      cot = c;
      break;
    }
  }
  if (!headerRow) throw new Error('Không nhận ra bảng kê Be (thiếu cột Session ID / Total amount).');

  type Nhom = {
    rows: RawRow;
    tien: number;
    ngay: { y: number; m: number; d: number } | null;
  };
  const nhom = new Map<string, Nhom>();
  let soDongRaw = 0;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: CotKey): CellValue => {
      const c = cot[k];
      return c ? row.getCell(c).value : null;
    };

    const sessionId = asText(get('sessionId'));
    const maBooking = asText(get('maBooking'));
    const tien = asMoney(get('tongTien'));
    // Dòng trống hoàn toàn thì bỏ qua
    if (!sessionId && !maBooking && !tien) continue;
    soDongRaw++;

    // Chung Session ID = cùng một chuyến. Thiếu Session ID thì mỗi dòng đứng riêng.
    const khoa = sessionId || `__dong_${r}`;
    const daCo = nhom.get(khoa);
    if (daCo) {
      // Dòng thứ 2 trở đi của chuyến là phụ phí — chỉ cộng dồn tiền
      daCo.tien += tien;
      continue;
    }

    const ngay = docNgay(get('ngay'));
    const gio = docGio(get('gio'));
    const ngayGiaoDich = ngay
      ? new Date(Date.UTC(ngay.y, ngay.m - 1, ngay.d, gio.h, gio.p, gio.g))
      : null;

    nhom.set(khoa, {
      tien,
      ngay,
      rows: {
        stt: null,
        soThe: '',
        sanPham: 'Be',
        ngayGiaoDich,
        ngayDiThucTe: null,
        ngayHieuLuc: null,
        tenTrenThe: asText(get('khach')),
        bienSoXe: asText(get('bienSo')),
        maNV: asText(get('maNV')),
        soTien: 0, // điền sau khi cộng xong cả nhóm
        soGiaoDich: maBooking,
        diemDon: asText(get('diemDi')),
        diemTra: asText(get('diemDen')),
        donViPhatSinh: 'Be',
        khoangCach: null,
      },
    });
  }

  const ds = [...nhom.values()];
  for (const n of ds) n.rows.soTien = n.tien;

  // Kỳ: lấy kỳ xuất hiện nhiều nhất trong dữ liệu, tránh lệch vì vài dòng lẻ
  const dem = new Map<string, { p: Period; n: number }>();
  for (const n of ds) {
    if (!n.ngay) continue;
    const p = kyCuaNgay(n.ngay);
    const k = `${p.year}-${p.month}`;
    const cu = dem.get(k);
    if (cu) cu.n++;
    else dem.set(k, { p, n: 1 });
  }
  const period = [...dem.values()].sort((a, b) => b.n - a.n)[0]?.p ?? null;

  return { rows: ds.map((n) => n.rows), gopPhuPhi: soDongRaw - ds.length, period };
}

/** Bỏ tiền tố "Be statement" khỏi tên lấy từ tên file */
export function boTienToBe(ten: string): string {
  return ten.replace(/^\s*be[\s_-]*statement[\s_-]*/i, '').trim();
}
