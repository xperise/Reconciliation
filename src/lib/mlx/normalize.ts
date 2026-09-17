import type { Period } from './types';

/** Chuẩn hoá chuỗi để so khớp: NFC, bỏ dấu, đ→d, chữ thường, gom khoảng trắng */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Khoá so khớp tên công ty: chỉ giữ chữ và số */
export function companyKey(s: string | null | undefined): string {
  return normalizeText(s).replace(/[^a-z0-9]/g, '');
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function lastDayOfMonth(p: Period): number {
  return new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
}

/** "Từ ngày 01/08/2026 Đến ngày 31/08/2026" */
export function periodRangeText(p: Period): string {
  const mm = pad2(p.month);
  return `Từ ngày 01/${mm}/${p.year} Đến ngày ${lastDayOfMonth(p)}/${mm}/${p.year}`;
}

/** Nhãn kỳ dùng trong tên file: T08.2026 */
export function periodLabel(p: Period): string {
  return `T${pad2(p.month)}.${p.year}`;
}

/** Giá trị cho <input type="month">: 2026-08 */
export function periodToInput(p: Period | null): string {
  return p ? `${p.year}-${pad2(p.month)}` : '';
}

export function inputToPeriod(v: string): Period | null {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
}

function mkPeriod(year: number, month: number): Period | null {
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 ? { year, month } : null;
}

/**
 * Đọc kỳ từ đoạn cuối tên file. Hỗ trợ:
 * T08.2026 · T08-2026 · T8_2026 · 08.2026 · 08/2026 · 082026 · 202608 · 20260917 (yyyymmdd → tháng 09/2026)
 */
export function parsePeriodToken(token: string): Period | null {
  const t = token.trim().toUpperCase();
  let m: RegExpExecArray | null;
  if ((m = /^T?(\d{1,2})[.\-/](\d{4})$/.exec(t))) return mkPeriod(+m[2], +m[1]);
  if ((m = /^(\d{4})[.\-/](\d{1,2})$/.exec(t))) return mkPeriod(+m[1], +m[2]);
  if ((m = /^T(\d{1,2})(\d{4})$/.exec(t))) return mkPeriod(+m[2], +m[1]);
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(t))) return mkPeriod(+m[1], +m[2]); // yyyymmdd
  if ((m = /^(\d{6})$/.exec(t))) {
    const d = m[1];
    return mkPeriod(+d.slice(2), +d.slice(0, 2)) ?? mkPeriod(+d.slice(0, 4), +d.slice(4)); // mmyyyy | yyyymm
  }
  return null;
}

/** Tách "Tên công ty_Kỳ.xlsx" → { company, period } */
export function parseFileName(fileName: string): { company: string; period: Period | null } {
  const base = fileName.normalize('NFC').replace(/\.(xlsx|xlsm|xls)$/i, '').trim();
  const idx = base.lastIndexOf('_');
  if (idx > 0) {
    const period = parsePeriodToken(base.slice(idx + 1));
    if (period) {
      return { company: base.slice(0, idx).replace(/_/g, ' ').replace(/\s+/g, ' ').trim(), period };
    }
  }
  return { company: base.replace(/_/g, ' ').replace(/\s+/g, ' ').trim(), period: null };
}

/** Tên sheet Excel hợp lệ: bỏ ký tự cấm, tối đa 31 ký tự */
export function safeSheetName(s: string): string {
  const cleaned = s.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || 'Bang ke').slice(0, 31).trim();
}

/** Tên file hợp lệ trên Windows/macOS */
export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Bang_ke';
}

/** Kỳ dạng lưu DB: 2026-09 */
export const periodToKy = (p: Period): string => periodToInput(p);

/** "2026-09" → "Tháng 09/2026" */
export function kyLabel(ky: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ky);
  return m ? `Tháng ${m[2]}/${m[1]}` : ky;
}

/** "2026-09" → "T09.2026" */
export function kyShort(ky: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ky);
  return m ? `T${m[2]}.${m[1]}` : ky;
}
