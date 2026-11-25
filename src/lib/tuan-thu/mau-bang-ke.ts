import ExcelJS from 'exceljs';
import { chuoiNgay } from './raw';
import { coTien } from './tinh';
import { DongRaw, LoaiDichVu, ThamSoHopDong } from './types';

/**
 * Mẫu bảng kê riêng của từng khách: "học" cấu trúc từ một bảng kê khách đã nhận (file mẫu),
 * rồi lần sau dựng bảng kê từ raw ra đúng mẫu đó — chép nguyên phần đầu trang, định dạng, độ rộng cột,
 * chữ ký cuối trang; chỉ thay dữ liệu, dòng tổng, kỳ và tài khoản theo hợp đồng.
 */
export type CotMau = { so: number; ten: string; nguon: string; mau?: string[] };   // nguon: tên cột raw | '#' (STT) | '@trang_thai' | '' (để trống)
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
  const dong: Record<string, string> = { 'thanh tien da vat': loai === 've_may_bay' ? 'Thành tiền' : 'Thành tiền (đã VAT)', 'ho ten khach': 'Họ và tên Khách', 'ma giao dich': loai === 'khach_san' ? 'Mã giao dịch' : 'Mã giao dịch (Chiều đi)' };
  return dong[k] ?? '';
}

export async function hocMau(buf: Buffer): Promise<CauTrucMau> {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
  const out: CauTrucMau = { sheets: [], ghiChu: [] };
  for (const ws of wb.worksheets) {
    let hr = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) if (/^STT/i.test(chuan(gt(ws.getRow(r).getCell(1).value)))) { hr = r; break; }
    if (!hr) { out.ghiChu.push(`Sheet "${ws.name}" không có dòng tiêu đề bắt đầu bằng STT — giữ nguyên, không điền dữ liệu.`); continue; }
    const ten: Record<number, string> = {};
    ws.getRow(hr).eachCell({ includeEmpty: false }, (c, i) => { const t = chuan(gt(c.value)); if (t) ten[i] = t; });
    let hrCuoi = hr;
    const duoi = ws.getRow(hr + 1);
    if (!chuan(gt(duoi.getCell(1).value)) && (duoi.values as any[]).slice(2).some((x) => typeof gt(x) === 'string' && chuan(gt(x)))) {
      duoi.eachCell({ includeEmpty: false }, (c, i) => { const t = chuan(gt(c.value)); if (t) ten[i] = t; }); hrCuoi = hr + 1;
    }
    const tens = Object.values(ten);
    const loai: SheetMau['loai'] | null = tens.includes('Tên khách sạn') ? 'khach_san' : tens.includes('Tên dịch vụ (Hành trình)') ? 've_may_bay' : tens.some((t) => /^phòng ban/i.test(t)) ? 'tong_hop' : null;
    if (!loai) { out.ghiChu.push(`Sheet "${ws.name}" không nhận ra loại (khách sạn / vé / tổng hợp phòng ban) — giữ nguyên.`); continue; }
    const soDong = ws.rowCount;
    let dau = 0, cuoi = 0; const tong: number[] = [], tongTren: number[] = [];
    const cotTen = loai === 'tong_hop' ? Number(Object.entries(ten).find(([, t]) => /^phòng ban/i.test(t))![0]) : Number(Object.entries(ten).find(([, t]) => t === (loai === 'khach_san' ? 'Tên khách sạn' : 'Tên dịch vụ (Hành trình)'))![0]);
    const cotTien = Object.entries(ten).filter(([, t]) => CONG.has(t) || /^(thành tiền|tổng)/i.test(t)).map(([i]) => Number(i));
    for (let r = 1; r < hr; r++) { const row = ws.getRow(r); if (cotTien.some((i) => typeof gt(row.getCell(i).value) === 'number')) tongTren.push(r); }
    for (let r = hrCuoi + 1; r <= soDong; r++) {
      const row = ws.getRow(r); const a = chuan(gt(row.getCell(1).value)); const b = chuan(gt(row.getCell(cotTen).value));
      if (/^tổng/i.test(a) || /^tổng/i.test(b)) { tong.push(r); continue; }
      const laSo = a !== '' && !isNaN(Number(a));
      if (laSo && b) { if (!dau) dau = r; cuoi = r; continue; }
      if (dau && !tong.length && cotTien.some((i) => typeof gt(row.getCell(i).value) === 'number') && !b) { tong.push(r); continue; }
    }
    if (!dau) { out.ghiChu.push(`Sheet "${ws.name}" không có dòng dữ liệu mẫu — giữ nguyên.`); continue; }
    const sh: SheetMau = { ten: ws.name, loai, hangTieuDe: hrCuoi, hangDuLieuDau: dau, hangDuLieuCuoi: cuoi, hangTong: tong, hangTongTren: tongTren, hangCuoi: soDong,
      cot: Object.entries(ten).map(([i, t]) => ({ so: Number(i), ten: t, nguon: loai === 'tong_hop' ? '' : ghepCot(t, loai),
        mau: [dau, dau + 1, dau + 2].map((rr) => chuan(gt(ws.getRow(rr).getCell(Number(i)).value))).filter(Boolean).slice(0, 3) })).sort((x, y) => x.so - y.so) };
    if (loai === 'tong_hop') {
      const tim = (re: RegExp) => Number(Object.entries(ten).find(([, t]) => re.test(t))?.[0] ?? 0);
      sh.thCot = { stt: 1, pb: tim(/^phòng ban/i), cc: tim(/cost center/i), nd: tim(/^nội địa/i), dv: tim(/^dịch vụ/i), chua_vat: tim(/^thành tiền/i), phi: tim(/^phí dịch vụ/i),
        ck: tim(/^chiết khấu/i), tong_chua_vat: tim(/^tổng tiền/i), vat: tim(/^thuế gtgt/i), tong: tim(/^tổng cộng/i) };
      sh.thDong = [];
      for (let r = dau; r <= cuoi; r++) { const row = ws.getRow(r); const pb = chuan(gt(row.getCell(sh.thCot.pb).value)); if (!pb) continue;
        sh.thDong.push({ pb, cc: sh.thCot.cc ? (chuan(gt(row.getCell(sh.thCot.cc).value)) || null) : null, nd: sh.thCot.nd ? (chuan(gt(row.getCell(sh.thCot.nd).value)) || null) : null, dv: chuan(gt(row.getCell(sh.thCot.dv).value)) }); }
    }
    const khongGhep = sh.cot.filter((c) => !c.nguon && loai !== 'tong_hop').map((c) => c.ten);
    if (khongGhep.length) out.ghiChu.push(`Sheet "${ws.name}": cột không có trong raw, để trống khi dựng: ${khongGhep.join(', ')}.`);
    out.sheets.push(sh);
  }
  return out;
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
    if (!sh) { // sheet không nhận ra: chép nguyên
      src.eachRow({ includeEmpty: true }, (row, r) => chepDong(row, ws.getRow(r), soCot));
      merges.forEach((m) => { try { ws.mergeCells(m); } catch { /* bỏ qua */ } });
      continue;
    }
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
    for (let rr = batDauChan; rr <= sh.hangCuoi; rr++) {
      const dst = ws.getRow(rr + delta); chepDong(src.getRow(rr), dst, soCot);
      if (sh.hangTong.includes(rr)) { datTong(dst); const a = dst.getCell(1); if (a.value !== null && !isNaN(Number(a.value))) a.value = null; }
      else dst.eachCell((c) => { const v: any = src.getRow(rr).getCell(c.col).value; if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) c.value = null; });
    }
    merges.filter((m) => rangeRows(m)[0] >= batDauChan).forEach((m) => { try { ws.mergeCells(dichMerge(m, delta)); } catch { /* bỏ qua */ } });
    for (const rr of sh.hangTongTren) datTong(ws.getRow(rr));
  }
  return Buffer.from(await out.xlsx.writeBuffer());
}
