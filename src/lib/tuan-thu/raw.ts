import ExcelJS from 'exceljs';
import { DongRaw, LoaiDichVu } from './types';

/** Cột tiền trong raw, đọc thành số. */
export const COT_SO = [
  'Đơn giá', 'Số lượng', 'Số lượng phòng', 'Số lượng đêm',
  'Thành tiền chưa VAT', 'VAT', 'Thành tiền', 'Thành tiền (đã VAT)',
  'Phí dịch vụ chưa VAT', 'VAT phí dịch vụ', 'Tổng phí dịch vụ',
  'Chiết khấu trước VAT', 'VAT chiết khấu', 'Tổng tiền chiết khấu', 'Tổng thành tiền',
];

/** Cột bắt buộc theo loại, thiếu cột thì dừng ngay ở bước 1. */
export const COT_BAT_BUOC: Record<LoaiDichVu, string[]> = {
  khach_san: ['STT', 'Tên công ty', 'Tên khách sạn', 'Ngày giao dịch', 'Trạng thái', 'Trip ID', 'Phòng ban',
    'Họ và tên Khách', 'Mã cán bộ', 'Đơn giá', 'Số lượng phòng', 'Số lượng đêm', 'Thành tiền chưa VAT', 'VAT',
    'Thành tiền (đã VAT)', 'Chiết khấu trước VAT', 'Tổng tiền chiết khấu', 'Tổng thành tiền', 'Mã giao dịch', 'Số hóa đơn'],
  ve_may_bay: ['STT', 'Tên công ty', 'Tên dịch vụ (Hành trình)', 'Ngày giao dịch', 'Trạng thái', 'Trip ID', 'Phòng ban',
    'Họ và tên Khách', 'Mã cán bộ', 'Số vé', 'Hạng vé', 'Đơn giá', 'Thành tiền chưa VAT', 'VAT', 'Thành tiền',
    'Chiết khấu trước VAT', 'Tổng tiền chiết khấu', 'Tổng thành tiền', 'Số hóa đơn'],
};

const chuanHoa = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

function giaTri(v: ExcelJS.CellValue): any {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    const o = v as any;
    if ('result' in o) return o.result ?? null;           // ô công thức
    if ('richText' in o) return o.richText.map((t: any) => t.text).join('');
    if ('text' in o) return o.text;                       // hyperlink
  }
  return v;
}

function soHoa(x: any): number {
  if (x === null || x === undefined || x === '') return 0;
  if (typeof x === 'number') return x;
  const n = Number(String(x).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Ngày dạng dd/mm/yyyy (chuỗi) hoặc Date → 'dd/mm/yyyy' */
export function chuoiNgay(x: any): string {
  if (!x) return '';
  if (x instanceof Date) {
    const d = String(x.getUTCDate()).padStart(2, '0'), m = String(x.getUTCMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${x.getUTCFullYear()}`;
  }
  return chuanHoa(x);
}
export function ngayISO(x: any): string {
  const s = chuoiNgay(x); const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

export interface KetQuaDoc {
  loai: LoaiDichVu;
  dong: DongRaw[];
  cot: string[];
  thieu_cot: string[];
}

/** Đọc một file raw (khách sạn hoặc vé máy bay) xuất từ hệ thống. */
export async function docRaw(buf: ArrayBuffer | Buffer): Promise<KetQuaDoc> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0];

  let hang = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
    if (chuanHoa(giaTri(ws.getRow(r).getCell(1).value)) === 'STT') { hang = r; break; }
  }
  if (!hang) throw new Error('Không tìm thấy dòng tiêu đề (ô đầu tiên phải là "STT").');

  const cot: string[] = [];
  ws.getRow(hang).eachCell({ includeEmpty: true }, (c, i) => { cot[i] = chuanHoa(giaTri(c.value)); });

  const loai: LoaiDichVu = cot.includes('Tên khách sạn') ? 'khach_san'
    : cot.includes('Tên dịch vụ (Hành trình)') ? 've_may_bay'
    : (() => { throw new Error('Không nhận ra loại file: thiếu cột "Tên khách sạn" hoặc "Tên dịch vụ (Hành trình)".'); })();

  const coTen = cot.filter(Boolean);
  const thieu_cot = COT_BAT_BUOC[loai].filter((c) => !coTen.includes(c));

  const dong: DongRaw[] = [];
  for (let r = hang + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const stt = giaTri(row.getCell(1).value);
    if (stt === null || stt === '' || isNaN(Number(stt))) continue;
    const v: Record<string, any> = {};
    cot.forEach((ten, i) => {
      if (!ten) return;
      const o = row.getCell(i);
      // Ô gộp (nhiều khách chung một phòng): chỉ ô đầu mang giá trị, các ô còn lại coi là trống
      // để tiền không bị cộng lặp theo số khách.
      const phu = o.isMerged && o.master.address !== o.address;
      const x = phu && COT_SO.includes(ten) ? null : giaTri(phu ? o.master.value : o.value);
      v[ten] = COT_SO.includes(ten) ? (x === null || x === '' ? null : soHoa(x)) : x;
    });
    // Mã cán bộ đôi khi bị đọc thành số thực (162.0) → đưa về chuỗi
    if (typeof v['Mã cán bộ'] === 'number') v['Mã cán bộ'] = String(Math.round(v['Mã cán bộ']));
    dong.push({ loai, dong: r, v });
  }
  return { loai, dong, cot: coTen, thieu_cot };
}
