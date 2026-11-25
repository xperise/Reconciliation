import ExcelJS from 'exceljs';
import { chuoiNgay } from './raw';
import { coTien } from './tinh';
import { DongRaw, LoaiDichVu, ThamSoHopDong } from './types';

/**
 * Mẫu bảng kê riêng của từng khách: "học" cấu trúc từ một bảng kê khách đã nhận (file mẫu),
 * rồi lần sau dựng bảng kê từ raw ra đúng mẫu đó — chép nguyên phần đầu trang, định dạng, độ rộng cột,
 * chữ ký cuối trang; chỉ thay dữ liệu, dòng tổng, kỳ và tài khoản theo hợp đồng.
 */
export type CotMau = { so: number; ten: string; nguon: string; mau?: string[]; congThuc?: string };   // nguon '@cong_thuc' = giữ công thức của mẫu   // nguon: tên cột raw | '#' (STT) | '@trang_thai' | '' (để trống)
export type SheetMau = {
  ten: string; loai: LoaiDichVu | 'tong_hop';
  hangTieuDe: number; hangDuLieuDau: number; hangDuLieuCuoi: number; hangTong: number[]; hangTongTren: number[]; hangCuoi: number;
  cot: CotMau[];
  thCot?: Record<string, number>;   // sheet tổng hợp: pb, cc, nd, dv, chua_vat, phi, ck, tong_chua_vat, vat, tong
  thDong?: { pb: string; cc: string | null; nd: string | null; dv: string }[];
};
export type CauTrucMau = { sheets: SheetMau[]; ghiChu: string[] };

const chuan = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const khongDau = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
function gt(v: ExcelJS.CellValue): any {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') { const o = v as any; if (v instanceof Date) return v; if ('result' in o || 'formula' in o || 'sharedFormula' in o) return o.result ?? null;
    if ('richText' in o) return o.richText.map((t: any) => t.text).join(''); if ('text' in o) return o.text; if ('error' in o) return null; }
  return v;
}
const TIEN = new Set(['Đơn giá', 'Thành tiền chưa VAT', 'VAT', 'Thành tiền', 'Thành tiền (đã VAT)', 'Phí dịch vụ chưa VAT', 'VAT phí dịch vụ', 'Tổng phí dịch vụ',
  'Chiết khấu trước VAT', 'VAT chiết khấu', 'Tổng tiền chiết khấu', 'Tổng thành tiền']);
const CONG = new Set([...TIEN].filter((x) => x !== 'Đơn giá'));
export const COT_RAW: Record<LoaiDichVu, string[]> = {
  khach_san: ['Tên công ty', 'Tên khách sạn', 'Địa bàn', 'Hạng phòng', 'Nội địa/Quốc tế', 'Ngày giao dịch', 'Trạng thái', 'Người đặt dịch vụ', 'Email người đặt', 'Người duyệt chuyến đi',
    'Bypass approve name', 'Bypass approve email', 'Trip ID', 'Phòng ban', 'Ngày checkin/Ngày đi', 'Họ và tên Khách', 'Chức danh hành khách', 'Mã cán bộ', 'Giới tính', 'Cost center',
    'Ngày checkout/Ngày về', 'Tên chuyến đi', 'Đơn giá', 'Số lượng phòng', 'Số lượng đêm', 'Thành tiền chưa VAT', 'VAT', 'Thành tiền (đã VAT)', 'Phí dịch vụ chưa VAT', 'VAT phí dịch vụ',
    'Tổng phí dịch vụ', 'Chiết khấu trước VAT', 'VAT chiết khấu', 'Tổng tiền chiết khấu', 'Tổng thành tiền', 'Mã giao dịch', 'Số hóa đơn', 'Link hóa đơn', 'Ghi chú'],
  ve_may_bay: ['Tên công ty', 'Tên dịch vụ (Hành trình)', 'Nội địa/Quốc tế', 'Ngày giao dịch', 'Trạng thái', 'Người đặt dịch vụ', 'Email người đặt', 'Người duyệt chuyến đi', 'Bypass approve name',
    'Bypass approve email', 'Trip ID', 'Phòng ban', 'Họ và tên Khách', 'Chức danh hành khách', 'Mã cán bộ', 'Cost center', 'Số vé', 'Hạng vé', 'Hạng ghế chuyến đi', 'Hạng ghế chuyến về',
    'Ngày checkin/Ngày đi', 'Ngày checkout/Ngày về', 'Tên chuyến đi', 'Đơn giá', 'Số lượng', 'Thành tiền chưa VAT', 'VAT', 'Thành tiền', 'Phí dịch vụ chưa VAT', 'VAT phí dịch vụ',
    'Tổng phí dịch vụ', 'Chiết khấu trước VAT', 'VAT chiết khấu', 'Tổng tiền chiết khấu', 'Tổng thành tiền', 'Mã giao dịch (Chiều đi)', 'Mã giao dịch (Chiều về)', 'Số hóa đơn', 'Link hóa đơn', 'Ghi chú'],
};
/** Ghép cột mẫu với cột raw: trùng tên (không phân biệt hoa thường, dấu cách) hoặc tên đồng nghĩa. */
export function ghepCot(ten: string, loai: LoaiDichVu): string {
  const k = khongDau(chuan(ten));
  if (/^stt\b/.test(k)) return '#';
  if (/^(trang thai|tinh trang su dung)$/.test(k)) return '@trang_thai';
  const thay = COT_RAW[loai].find((c) => khongDau(c) === k);
  if (thay) return thay;
  // Tên gọi khác thường gặp trong mẫu của khách
  const chung: Record<string, string> = {
    'thanh tien da vat': loai === 've_may_bay' ? 'Thành tiền' : 'Thành tiền (đã VAT)', 'thanh tien': loai === 've_may_bay' ? 'Thành tiền' : 'Thành tiền (đã VAT)',
    'tong thanh tien da vat': 'Tổng thành tiền', 'ho ten khach': 'Họ và tên Khách', 'ho va ten': 'Họ và tên Khách', 'ten khach': 'Họ và tên Khách', 'khach': 'Họ và tên Khách',
    'ma giao dich': loai === 'khach_san' ? 'Mã giao dịch' : 'Mã giao dịch (Chiều đi)', 'ma dat cho': loai === 'khach_san' ? 'Mã giao dịch' : 'Mã giao dịch (Chiều đi)',
    'chiet khau': 'Chiết khấu trước VAT', 'chiet khau chua vat': 'Chiết khấu trước VAT', 'tien chiet khau': 'Chiết khấu trước VAT',
    'tien thue gtgt': 'VAT', 'thue gtgt': 'VAT', 'thue vat': 'VAT', 'tien vat': 'VAT', 'vat 8%': 'VAT', 'vat 10%': 'VAT',
    'so hoa don': 'Số hóa đơn', 'hoa don': 'Số hóa đơn', 'hoa don so': 'Số hóa đơn', 'so hd': 'Số hóa đơn', 'link hoa don': 'Link hóa đơn', 'ma can bo': 'Mã cán bộ', 'ma nhan vien': 'Mã cán bộ', 'phong ban': 'Phòng ban', 'don vi': 'Phòng ban',
  };
  const rieng: Record<string, string> = loai === 'khach_san'
    ? { 'ten dich vu': 'Tên khách sạn', 'khach san': 'Tên khách sạn', 'ten ks': 'Tên khách sạn', 'ngay check in': 'Ngày checkin/Ngày đi', 'ngay nhan phong': 'Ngày checkin/Ngày đi',
        'ngay check out': 'Ngày checkout/Ngày về', 'ngay tra phong': 'Ngày checkout/Ngày về', 'don gia sau giam': 'Đơn giá', 'so dem': 'Số lượng đêm', 'so phong': 'Số lượng phòng', 'dia chi': 'Địa bàn' }
    : { 'ten dich vu': 'Tên dịch vụ (Hành trình)', 'hanh trinh': 'Tên dịch vụ (Hành trình)', 'ngay bay': 'Ngày checkin/Ngày đi', 'ngay di': 'Ngày checkin/Ngày đi', 'ngay ve': 'Ngày checkout/Ngày về',
        'so ve': 'Số vé', 'hang ve': 'Hạng vé', 'gia ve': 'Đơn giá' };
  return rieng[k] ?? chung[k] ?? '';
}

/** Nhận loại sheet: theo tên cột, dòng nhãn mục ngay dưới tiêu đề ("Dịch vụ khách sạn"…), tên sheet. */
export function nhanLoai(ten: string[], nhanMuc: string, tenSheet: string): SheetMau['loai'] | null {
  const k = khongDau([...ten, nhanMuc, tenSheet].join(' | '));
  if (ten.some((t) => /^phòng ban/i.test(t)) && /(thanh tien|tong cong)/.test(k) && !/(so ve|check ?in)/.test(k)) return 'tong_hop';
  if (/(ten khach san|khach san|check ?in|so luong dem|hang phong|\bks\b)/.test(k)) return 'khach_san';
  if (/(hanh trinh|so ve|hang ve|ve may bay|\bvmb\b|chuyen bay)/.test(k)) return 've_may_bay';
  return null;
}
const COT_TEN_DV: Record<LoaiDichVu, RegExp> = { khach_san: /^(tên khách sạn|tên dịch vụ|khách sạn|tên ks)/i, ve_may_bay: /^(tên dịch vụ|hành trình|chặng)/i };

export async function hocMau(buf: Buffer): Promise<CauTrucMau> {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
  const out: CauTrucMau = { sheets: [], ghiChu: [] };
  for (const ws of wb.worksheets) {
    let hr = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) if (/^STT/i.test(chuan(gt(ws.getRow(r).getCell(1).value)))) { hr = r; break; }
    if (!hr) { out.ghiChu.push(`Sheet "${ws.name}" không có dòng tiêu đề bắt đầu bằng STT — bỏ qua.`); continue; }
    const ten: Record<number, string> = {};
    ws.getRow(hr).eachCell({ includeEmpty: false }, (c, i) => { const t = chuan(gt(c.value)); if (t) ten[i] = t; });
    let hrCuoi = hr;
    const duoi = ws.getRow(hr + 1);
    const nhanMuc = chuan(gt(duoi.getCell(1).value));
    if (!nhanMuc && (duoi.values as any[]).slice(2).some((x) => typeof gt(x) === 'string' && chuan(gt(x)))) {
      duoi.eachCell({ includeEmpty: false }, (c, i) => { const t = chuan(gt(c.value)); if (t) ten[i] = t; }); hrCuoi = hr + 1;
    }
    const tens = Object.values(ten);
    const loai = nhanLoai(tens, nhanMuc, ws.name);
    if (!loai) { out.ghiChu.push(`Sheet "${ws.name}" không nhận ra loại (khách sạn / vé / tổng hợp phòng ban) — bỏ qua.`); continue; }
    const soDong = ws.rowCount;
    const cotTenSo = loai === 'tong_hop' ? Number(Object.entries(ten).find(([, t]) => /^phòng ban/i.test(t))![0])
      : Number(Object.entries(ten).find(([, t]) => COT_TEN_DV[loai].test(t))?.[0] ?? 2);
    let dau = 0, cuoi = 0; const tong: number[] = [], tongTren: number[] = [];
    const laTong = (row: ExcelJS.Row) => { let co = false; row.eachCell({ includeEmpty: false }, (c) => { if (/^tổng( cộng| thanh toán)?\b/i.test(chuan(gt(c.value)))) co = true; }); return co; };
    for (let r = 1; r < hr; r++) { const row = ws.getRow(r); let so = false; row.eachCell({ includeEmpty: false }, (c, i) => { if (i > 1 && typeof gt(c.value) === 'number' && (c.value as any)?.formula) so = true; }); if (so) tongTren.push(r); }
    for (let r = hrCuoi + 1; r <= soDong; r++) {
      const row = ws.getRow(r);
      if (laTong(row)) { tong.push(r); continue; }
      const a = chuan(gt(row.getCell(1).value)); const b = chuan(gt(row.getCell(cotTenSo).value));
      const laSo = a !== '' && !isNaN(Number(a));
      if ((laSo || (!a && dau === 0 && r > hrCuoi + 1)) && b && !tong.length) { if (!dau) dau = r; cuoi = r; }
    }
    if (!dau) { out.ghiChu.push(`Sheet "${ws.name}" không có dòng dữ liệu mẫu — bỏ qua.`); continue; }
    // Cột có dữ liệu nhưng không có tiêu đề (VD số hóa đơn, link, mã giao dịch ở cuối bảng)
    for (let rr = dau; rr <= Math.min(cuoi, dau + 3); rr++) ws.getRow(rr).eachCell({ includeEmpty: false }, (c, i) => { if (!ten[i] && gt(c.value) !== null && chuan(gt(c.value))) ten[i] = `(cột ${ws.getColumn(i).letter} không tiêu đề)`; });
    const sh: SheetMau = { ten: ws.name, loai, hangTieuDe: hrCuoi, hangDuLieuDau: dau, hangDuLieuCuoi: cuoi, hangTong: tong, hangTongTren: tongTren, hangCuoi: soDong,
      cot: Object.entries(ten).map(([i, t]) => {
        const c0 = ws.getRow(dau).getCell(Number(i)); const v: any = c0.value;
        const congThuc = v && typeof v === 'object' && 'formula' in v && v.formula ? String(v.formula) : undefined;
        let nguon = loai === 'tong_hop' ? '' : ghepCot(t, loai);
        if (!nguon && congThuc) nguon = '@cong_thuc';
        return { so: Number(i), ten: t, nguon, congThuc, mau: [dau, dau + 1, dau + 2].map((rr) => { const x = gt(ws.getRow(rr).getCell(Number(i)).value); return x instanceof Date ? chuoiNgay(x) : chuan(x); }).filter(Boolean).slice(0, 3) };
      }).sort((x, y) => x.so - y.so) };
    (sh as any).an = ws.state && ws.state !== 'visible';
    if (loai === 'tong_hop') {
      const tim = (re: RegExp) => Number(Object.entries(ten).find(([, t]) => re.test(t))?.[0] ?? 0);
      sh.thCot = { stt: 1, pb: tim(/^phòng ban/i), cc: tim(/cost center/i), nd: tim(/^nội địa/i), dv: tim(/^dịch vụ/i), chua_vat: tim(/^thành tiền/i), phi: tim(/^phí dịch vụ/i),
        ck: tim(/^chiết khấu/i), tong_chua_vat: tim(/^tổng tiền/i), vat: tim(/^thuế gtgt/i), tong: tim(/^tổng cộng/i) };
      sh.thDong = [];
      for (let r = dau; r <= cuoi; r++) { const row = ws.getRow(r); const pb = chuan(gt(row.getCell(sh.thCot.pb).value)); if (!pb) continue;
        sh.thDong.push({ pb, cc: sh.thCot.cc ? (chuan(gt(row.getCell(sh.thCot.cc).value)) || null) : null, nd: sh.thCot.nd ? (chuan(gt(row.getCell(sh.thCot.nd).value)) || null) : null, dv: chuan(gt(row.getCell(sh.thCot.dv).value)) }); }
    }
    out.sheets.push(sh);
  }
  // Nhiều sheet cùng loại (bản cũ, "Copy of…", sheet ẩn): giữ sheet đang hiện, ưu tiên sheet có nhãn kỳ mới nhất / đứng sau cùng
  const giu: SheetMau[] = [];
  for (const loai of ['ve_may_bay', 'khach_san', 'tong_hop'] as const) {
    const ds = out.sheets.filter((x) => x.loai === loai);
    if (ds.length <= 1) { giu.push(...ds); continue; }
    const hien = ds.filter((x) => !(x as any).an && !/^copy of/i.test(x.ten));
    const chon = (hien.length ? hien : ds)[(hien.length ? hien : ds).length - 1];
    giu.push(chon);
    out.ghiChu.push(`Có ${ds.length} sheet loại ${loai === 'khach_san' ? 'khách sạn' : loai === 've_may_bay' ? 'vé máy bay' : 'tổng hợp'} (${ds.map((x) => `"${x.ten}"${(x as any).an ? ' (ẩn)' : ''}`).join(', ')}) — dùng "${chon.ten}" làm mẫu, các sheet còn lại bỏ khỏi bảng kê.`);
  }
  out.sheets = out.sheets.filter((x) => giu.includes(x));
  for (const sh of out.sheets) {
    // Cột giữ công thức nhưng công thức dùng tới cột sẽ để trống (không lấy từ raw) → bỏ công thức, tránh ra số sai
    for (const c of sh.cot.filter((x) => x.nguon === '@cong_thuc' && x.congThuc)) {
      const dung = [...c.congThuc!.matchAll(/\$?([A-Z]{1,3})\$?\d+/g)].map((m) => m[1]);
      const trong = dung.filter((L) => { const k = sh.cot.find((x) => colLetter(x.so) === L); return !k || !k.nguon; });
      if (trong.length) { c.nguon = ''; out.ghiChu.push(`Sheet "${sh.ten}": cột "${c.ten}" có công thức dùng cột ${[...new Set(trong)].join(', ')} không có trong raw — để trống (kế toán ghép cột nguồn nếu có).`); }
    }
    const khongGhep = sh.cot.filter((c) => !c.nguon && sh.loai !== 'tong_hop').map((c) => c.ten);
    if (khongGhep.length) out.ghiChu.push(`Sheet "${sh.ten}": cột chưa ghép với raw (để trống khi dựng): ${khongGhep.join(', ')}.`);
    const ct = sh.cot.filter((c) => c.nguon === '@cong_thuc').map((c) => c.ten);
    if (ct.length) out.ghiChu.push(`Sheet "${sh.ten}": giữ công thức của mẫu ở các cột: ${ct.join(', ')}.`);
  }
  return out;
}

function colLetter(n: number): string { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

/** Dời số dòng trong công thức: hàm map nhận số dòng cũ, trả số dòng mới. */
function dichCongThuc(f: string, map: (r: number) => number): string {
  return f.replace(/(\$?[A-Z]{1,3}\$?)(\d+)/g, (_x, cot, r) => `${cot}${map(Number(r))}`);
}

function chepDong(src: ExcelJS.Row, dst: ExcelJS.Row, soCot: number, giaTri = true) {
  dst.height = src.height;
  for (let i = 1; i <= soCot; i++) {
    const a = src.getCell(i), b = dst.getCell(i);
    b.style = JSON.parse(JSON.stringify(a.style ?? {}));
    if (giaTri) { const v: any = a.value; b.value = v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v) ? (typeof v.result === 'number' || typeof v.result === 'string' ? v.result : null) : v; }
  }
}

/** Dựng bảng kê theo mẫu đã học. */
export async function apDungMau(tplBuf: Buffer, ct: CauTrucMau, dong: DongRaw[], ts: ThamSoHopDong, nhanKy: string): Promise<Buffer> {
  const tpl = new ExcelJS.Workbook(); await tpl.xlsx.load(tplBuf as any);
  const out = new ExcelJS.Workbook(); out.creator = 'Xperise – Tuân thủ bảng kê';
  const n = (x: any) => (typeof x === 'number' ? x : 0);
  for (const src of tpl.worksheets) {
    const sh = ct.sheets.find((s) => s.ten === src.name);
    const ws = out.addWorksheet(src.name, { views: src.views as any, pageSetup: src.pageSetup as any, properties: src.properties as any });
    const soCot = Math.max(src.columnCount, sh?.cot.reduce((m, c) => Math.max(m, c.so), 0) ?? 0);
    for (let i = 1; i <= soCot; i++) { const c = src.getColumn(i); ws.getColumn(i).width = c.width; ws.getColumn(i).hidden = c.hidden; }
    const merges: string[] = ((src as any).model?.merges ?? []) as string[];
    const rangeRows = (m: string) => { const nums = m.match(/\d+/g)!.map(Number); return [nums[0], nums[nums.length - 1]]; };
    const dichMerge = (m: string, delta: number) => m.replace(/([A-Z]+)(\d+)/g, (_x, c, r) => `${c}${Number(r) + delta}`);
    if (!sh) { out.removeWorksheet(ws.id); continue; }   // sheet cũ / không nhận ra: không đưa vào bảng kê
    // 1) Phần đầu (đến trước dòng dữ liệu đầu) chép nguyên, thay kỳ và tài khoản
    for (let r = 1; r < sh.hangDuLieuDau; r++) chepDong(src.getRow(r), ws.getRow(r), soCot);
    merges.filter((m) => rangeRows(m)[1] < sh.hangDuLieuDau).forEach((m) => { try { ws.mergeCells(m); } catch { /* bỏ qua */ } });
    for (let r = 1; r < sh.hangTieuDe; r++) ws.getRow(r).eachCell((c) => {
      const t = chuan(gt(c.value));
      if (/^từ ngày .* đến ngày/i.test(t)) c.value = nhanKy;
      else if (/^số tài khoản/i.test(t) && /\d{5,}/.test(t) && ts.tai_khoan?.so) c.value = `Số tài khoản (A/C No.): ${ts.tai_khoan.so} tại ${ts.tai_khoan.ngan_hang}`;
    });
    // 2) Dữ liệu
    const r0 = sh.hangDuLieuDau, mauDong = src.getRow(r0);
    let r = r0;
    const tongCot: Record<number, string> = {};
    if (sh.loai !== 'tong_hop') {
      const ds = dong.filter((d) => d.loai === sh.loai);
      ds.forEach((d, i) => {
        const row = ws.getRow(r); chepDong(mauDong, row, soCot, false);
        for (const c of sh.cot) {
          let v: any = null;
          if (c.nguon === '#') v = i + 1;
          else if (c.nguon === '@trang_thai') { const k = `${sh.loai}:${String(d.v['Trạng thái'] ?? '').trim().toLowerCase()}`; v = ts.ten_trang_thai?.[k] ?? d.v['Trạng thái'] ?? null; }
          else if (c.nguon === '@cong_thuc' && c.congThuc) { row.getCell(c.so).value = { formula: dichCongThuc(c.congThuc, (x) => (x === r0 ? r : x)) } as any; continue; }
          else if (c.nguon) { v = d.v[c.nguon] ?? null; if (v instanceof Date || /^Ngày/.test(c.nguon)) v = v ? chuoiNgay(v) : null; }
          row.getCell(c.so).value = v;
        }
        r++;
      });
      for (const c of sh.cot) if (CONG.has(c.nguon)) tongCot[c.so] = c.nguon;
    } else {
      const th = sh.thCot!;
      const tenDs = [...(sh.thDong ?? [])];
      for (const d of dong) { const pb = chuan(d.v['Phòng ban']); const dv = d.loai === 've_may_bay' ? 'Vé máy bay' : 'Khách sạn';
        if (pb && coTien(d) && !tenDs.some((x) => x.pb === pb && khongDau(x.dv).includes(d.loai === 've_may_bay' ? 'bay' : 'khach'))) tenDs.push({ pb, cc: null, nd: 'Nội địa', dv }); }
      tenDs.forEach((x, i) => {
        const loai: LoaiDichVu = /bay/i.test(x.dv) ? 've_may_bay' : 'khach_san';
        const ds = dong.filter((d) => d.loai === loai && chuan(d.v['Phòng ban']) === x.pb && coTien(d));
        const s = (k: string) => ds.reduce((a, d) => a + n(d.v[k]), 0);
        const g: Record<string, number> = { chua_vat: s('Thành tiền chưa VAT'), phi: s('Phí dịch vụ chưa VAT'), ck: s('Chiết khấu trước VAT') };
        g.tong_chua_vat = g.chua_vat + g.phi - g.ck; g.vat = s('VAT') + s('VAT phí dịch vụ') - s('VAT chiết khấu'); g.tong = g.tong_chua_vat + g.vat;
        const row = ws.getRow(r); chepDong(mauDong, row, soCot, false);
        row.getCell(th.stt).value = i + 1; row.getCell(th.pb).value = x.pb;
        if (th.cc) row.getCell(th.cc).value = x.cc; if (th.nd) row.getCell(th.nd).value = x.nd; if (th.dv) row.getCell(th.dv).value = x.dv;
        for (const k of ['chua_vat', 'phi', 'ck', 'tong_chua_vat', 'vat', 'tong']) if (th[k]) { row.getCell(th[k]).value = g[k]; tongCot[th[k]] = k; }
        r++;
      });
    }
    const cuoiMoi = r - 1, delta = cuoiMoi - sh.hangDuLieuCuoi;
    // 3) Dòng tổng (dưới) và chân trang: chép, dời xuống theo số dòng mới, dòng tổng dùng công thức SUM mới
    const giaTriTong = (so: number) => {
      if (sh.loai === 'tong_hop') { let t = 0; for (let i = r0; i <= cuoiMoi; i++) t += n(ws.getRow(i).getCell(so).value); return t; }
      return dong.filter((d) => d.loai === sh.loai).reduce((a, d) => a + n(d.v[tongCot[so]]), 0);
    };
    const datTong = (row: ExcelJS.Row) => { for (const so of Object.keys(tongCot).map(Number)) {
      const L = ws.getColumn(so).letter; row.getCell(so).value = { formula: cuoiMoi >= r0 ? `SUM(${L}${r0}:${L}${cuoiMoi})` : '0', result: giaTriTong(so) } as any; } };
    const batDauChan = sh.hangDuLieuCuoi + 1;
    const mapDong = (x: number) => (x < r0 ? x : x <= sh.hangDuLieuCuoi ? (x === sh.hangDuLieuCuoi ? cuoiMoi : x === r0 ? r0 : Math.min(x, cuoiMoi)) : x + delta);
    for (let rr = batDauChan; rr <= sh.hangCuoi; rr++) {
      const dst = ws.getRow(rr + delta); chepDong(src.getRow(rr), dst, soCot);
      // Công thức ở chân bảng (dòng tổng, đối chiếu…): giữ, dời tham chiếu theo số dòng mới
      src.getRow(rr).eachCell({ includeEmpty: false }, (c, i) => { const v: any = c.value;
        if (v && typeof v === 'object' && v.formula) dst.getCell(i).value = { formula: dichCongThuc(String(v.formula), mapDong) } as any;
        else if (v && typeof v === 'object' && 'sharedFormula' in v) dst.getCell(i).value = null; });
      if (sh.hangTong.includes(rr)) { datTong(dst); const a = dst.getCell(1); if (a.value !== null && !isNaN(Number(a.value))) a.value = null; }
    }
    merges.filter((m) => rangeRows(m)[0] >= batDauChan).forEach((m) => { try { ws.mergeCells(dichMerge(m, delta)); } catch { /* bỏ qua */ } });
    for (const rr of sh.hangTongTren) datTong(ws.getRow(rr));
  }
  out.calcProperties = { ...(out.calcProperties ?? {}), fullCalcOnLoad: true } as any;
  return Buffer.from(await out.xlsx.writeBuffer());
}
