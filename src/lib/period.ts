/**
 * Quy ước kỳ đối soát: T[MM].[YYYY], ví dụ T07.2026.
 * Bảng kê gửi trong tháng T là bảng kê của kỳ T-1.
 */

export const TZ = 'Asia/Ho_Chi_Minh';

/** Trả về các thành phần ngày giờ hiện tại theo giờ Việt Nam. */
export function nowInVN(base = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(base);

  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    isoDate: `${get('year')}-${get('month')}-${get('day')}`,
    hhmm: `${get('hour')}:${get('minute')}`,
  };
}

/** Nhãn kỳ từ tháng và năm. */
export function periodLabel(month: number, year: number): string {
  return `T${String(month).padStart(2, '0')}.${year}`;
}

/**
 * Kỳ đối soát mà một lịch gửi nhắm tới.
 *
 * Kỳ luôn mang tên tháng của dữ liệu bên trong nó, không phải tháng đem đi
 * gửi. Khách gửi ngày 28 tháng 8 cho dữ liệu tháng 8 thì kỳ là T08.2026;
 * khách gửi ngày 5 tháng 9 cho dữ liệu tháng 8 cũng là T08.2026.
 */
export function periodForSchedule(
  kyThuocThang: 'thang_nay' | 'thang_truoc',
  base = new Date(),
): string {
  const { year, month } = nowInVN(base);
  if (kyThuocThang === 'thang_nay') return periodLabel(month, year);
  const m = month === 1 ? 12 : month - 1;
  const y = month === 1 ? year - 1 : year;
  return periodLabel(m, y);
}

/**
 * Kỳ mặc định dùng cho màn hình tổng quan khi người dùng chưa chọn kỳ nào.
 * Lấy tháng liền trước vì phần lớn khách vẫn theo nếp gửi sang tháng sau.
 */
export function currentPeriod(base = new Date()): string {
  return periodForSchedule('thang_truoc', base);
}

/** Số ngày của tháng hiện tại — dùng để kẹp ngày đến hạn 30/31 trong tháng 2. */
export function daysInCurrentMonth(base = new Date()): number {
  const { year, month } = nowInVN(base);
  return new Date(year, month, 0).getDate();
}

/**
 * Hôm nay có phải ngày đến hạn gửi bảng kê không.
 * Nếu khách khai ngày 30 mà tháng chỉ có 28 ngày thì ngày 28 tính là đến hạn.
 */
export function isDueToday(dueDay: number, base = new Date()): boolean {
  const { day } = nowInVN(base);
  const max = daysInCurrentMonth(base);
  return Math.min(dueDay, max) === day;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso + 'T00:00:00Z');
  const b = Date.parse(toIso + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

/**
 * 'T07.2026' -> 'tháng 07/2026'.
 *
 * Mọi thư gửi khách đều đi qua hàm này. Mã kỳ thô là quy ước nội bộ, đưa
 * nguyên vào thư khiến người đọc phải tự dịch.
 */
export function periodInWords(ky: string): string {
  const m = ky.match(/^T(\d{2})\.(\d{4})$/);
  return m ? `tháng ${m[1]}/${m[2]}` : ky;
}

/**
 * Nhãn kỳ đầy đủ hiện cho người đọc: kèm phạm vi khi kỳ chỉ bao một phần
 * tháng, kèm số đợt khi khách có nhiều hơn một đợt trong tháng.
 */
export function periodFull(ky: string, phamVi?: string | null, dot?: number): string {
  const phan: string[] = [ky];
  if (phamVi?.trim()) phan.push(phamVi.trim());
  else if (dot && dot > 1) phan.push(`Đợt ${dot}`);
  return phan.join(' · ');
}

/** Như trên nhưng viết bằng lời, dùng trong nội dung email. */
export function periodWordsFull(ky: string, phamVi?: string | null): string {
  const w = periodInWords(ky);
  return phamVi?.trim() ? `${w} (${phamVi.trim()})` : w;
}
