import ExcelJS from 'exceljs';
import { COT_SO } from './raw';
import { tongHop, tuSua } from './tinh';
import { CanhBao, DongRaw, LoaiDichVu, ThamSoHopDong, ThayDoi, TEN_DICH_VU } from './types';
import { CauTrucMau, ghepCot, nhanLoai } from './mau-bang-ke';

/**
 * Đọc bảng kê kế toán ĐÃ FORMAT (mẫu của khách: sheet chi tiết vé, khách sạn, sheet tổng hợp phòng ban),
 * kiểm tra theo bộ quy tắc, và dựng "bản đã sửa theo quy tắc" bằng cách vá đúng các ô trong chính file đó
 * (giữ nguyên mẫu, định dạng, công thức).
 */
const chuan = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const n = (x: any) => (typeof x === 'number' ? x : 0);
/** Lệch tổng nhỏ hơn mức này coi là do ô gộp / làm tròn: chỉ theo dõi, không chặn. */
const NGUONG_NHO = 5000;
const COT_CONG = ['Thành tiền chưa VAT', 'VAT', 'Thành tiền', 'Thành tiền (đã VAT)', 'Phí dịch vụ chưa VAT', 'VAT phí dịch vụ', 'Tổng phí dịch vụ',
  'Chiết khấu trước VAT', 'VAT chiết khấu', 'Tổng tiền chiết khấu', 'Tổng thành tiền'];

function gt(v: ExcelJS.CellValue): any {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    const o = v as any;
    if ('result' in o || 'formula' in o || 'sharedFormula' in o) return o.result ?? null;
    if ('richText' in o) return o.richText.map((t: any) => t.text).join('');
    if ('text' in o) return o.text;
    if ('error' in o) return null;
  }
  return v;
}
const so = (x: any) => (x === null || x === undefined || x === '' ? null : typeof x === 'number' ? x : Number.isFinite(Number(String(x).replace(/,/g, ''))) ? Number(String(x).replace(/,/g, '')) : null);

type SheetCT = { ten: string; loai: LoaiDichVu; hangTieuDe: number; cot: Record<string, number>; dongTong: { hang: number; coStt: boolean; gt: Record<string, number | null> }[] };
type SheetTH = { ten: string; hangTieuDe: number; cot: Record<string, number>; dong: { hang: number; pb: string; dv: string; gt: Record<string, number> }[]; tong: number[] };
export type KetQuaDocBK = { dong: DongRaw[]; chiTiet: SheetCT[]; tongHopPB: SheetTH | null; dauTrang: { ten: string; dong: string[] }[]; khongNhanRa: string[] };

const KHOA_TH: [string, RegExp][] = [['pb', /^phòng ban/i], ['dv', /^dịch vụ/i], ['chua_vat', /^thành tiền/i], ['phi', /^phí dịch vụ/i], ['ck', /^chiết khấu/i],
  ['tong_chua_vat', /^tổng tiền/i], ['vat', /^thuế gtgt/i], ['tong', /^tổng cộng/i]];

export async function docBangKeDaFormat(buf: Buffer, mau?: CauTrucMau | null): Promise<KetQuaDocBK> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const out: KetQuaDocBK = { dong: [], chiTiet: [], tongHopPB: null, dauTrang: [], khongNhanRa: [] };
  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== 'visible') { out.khongNhanRa.push(`${ws.name} (sheet ẩn — không kiểm)`); continue; }
    let hr = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) if (/^STT/i.test(chuan(gt(ws.getRow(r).getCell(1).value)))) { hr = r; break; }
    if (!hr) { out.khongNhanRa.push(ws.name); continue; }
    const dau: string[] = [];
    for (let r = 1; r < hr; r++) { const t = ws.getRow(r).values as any[]; const s = (t ?? []).slice(1).map((x) => chuan(gt(x))).filter(Boolean).join(' '); if (s) dau.push(s); }
    out.dauTrang.push({ ten: ws.name, dong: dau });
    const cot: Record<string, number> = {};
    ws.getRow(hr).eachCell({ includeEmpty: false }, (c, i) => { const t = chuan(gt(c.value)); if (t && !(t in cot)) cot[t] = i; });
    // Tiêu đề 2 tầng (VD sheet tổng hợp: "Vé máy bay & khách sạn" gộp trên các cột tiền): lấy tên ở tầng dưới
    let hrCuoi = hr;
    const duoi = ws.getRow(hr + 1);
    if (!chuan(gt(duoi.getCell(1).value)) && (duoi.values as any[]).slice(2).some((x) => typeof gt(x) === 'string' && chuan(gt(x)))) {
      duoi.eachCell({ includeEmpty: false }, (c, i) => { const t = chuan(gt(c.value)); if (t) cot[t] = i; });
      hrCuoi = hr + 1;
    }
    // Mẫu của khách khác tên cột → ghép tên cột mẫu sang tên cột raw (theo mẫu đã duyệt, hoặc tên gọi khác thường gặp)
    const tenGoc = Object.keys(cot);
    const nhanMuc = chuan(gt(ws.getRow(hrCuoi + 1).getCell(1).value));
    const mauSh = mau?.sheets.find((x) => x.ten === ws.name && x.loai !== 'tong_hop');
    const loaiDoan = tenGoc.includes('Tên khách sạn') ? 'khach_san' : tenGoc.includes('Tên dịch vụ (Hành trình)') ? 've_may_bay' : (mauSh?.loai ?? nhanLoai(tenGoc, nhanMuc, ws.name));
    if (loaiDoan === 'khach_san' || loaiDoan === 've_may_bay') {
      for (const t of tenGoc) {
        const m = mauSh?.cot.find((c) => c.ten === t);
        const g = m && m.nguon && !m.nguon.startsWith('@') && m.nguon !== '#' ? m.nguon : ghepCot(t, loaiDoan);
        if (g && !g.startsWith('@') && g !== '#' && !(g in cot)) cot[g] = cot[t];
        if (g === '@trang_thai' && !('Trạng thái' in cot)) cot['Trạng thái'] = cot[t];
      }
    }
    const ten = Object.keys(cot);
    const loai: LoaiDichVu | null = loaiDoan === 'khach_san' || loaiDoan === 've_may_bay' ? loaiDoan : null;
    if (!loai) {
      if (ten.some((t) => /^phòng ban/i.test(t))) {
        const c: Record<string, number> = {};
        for (const [k, re] of KHOA_TH) { const t = ten.find((x) => re.test(x)); if (t) c[k] = cot[t]; }
        const th: SheetTH = { ten: ws.name, hangTieuDe: hrCuoi, cot: c, dong: [], tong: [] };
        for (let r = hrCuoi + 1; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          const pb = chuan(gt(row.getCell(c.pb).value)), dv = chuan(gt(row.getCell(c.dv).value));
          const a = chuan(gt(row.getCell(1).value));
          const g: Record<string, number> = {};
          for (const k of ['chua_vat', 'phi', 'ck', 'tong_chua_vat', 'vat', 'tong']) if (c[k]) g[k] = n(so(gt(row.getCell(c[k]).value)));
          if (/^tổng/i.test(a)) th.tong.push(r);
          else if (pb && dv) th.dong.push({ hang: r, pb, dv, gt: g });
          else if (Object.values(g).some((x) => x)) th.tong.push(r);
        }
        out.tongHopPB = th;
      } else out.khongNhanRa.push(ws.name);
      continue;
    }
    const sh: SheetCT = { ten: ws.name, loai, hangTieuDe: hr, cot, dongTong: [] };
    const cTen = cot[loai === 'khach_san' ? 'Tên khách sạn' : 'Tên dịch vụ (Hành trình)'];
    // Dòng tổng ở PHÍA TRÊN tiêu đề (một số file để tổng ngay trên bảng)
    for (let r = 1; r < hr; r++) {
      const row = ws.getRow(r); const g: Record<string, number | null> = {}; let co = false;
      for (const k of COT_CONG) if (cot[k]) { const v = so(gt(row.getCell(cot[k]).value)); g[k] = v; if (v !== null) co = true; }
      if (co) sh.dongTong.push({ hang: r, coStt: false, gt: g });
    }
    for (let r = hr + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const doc = (i: number, tien: boolean) => { const o = row.getCell(i); const phu = o.isMerged && o.master.address !== o.address; return phu && tien ? null : gt(phu ? o.master.value : o.value); };
      const stt = doc(1, false), tenDV = chuan(doc(cTen, false));
      const sttSo = stt !== null && stt !== '' && !isNaN(Number(stt));
      if (sttSo && tenDV && !/^tổng/i.test(tenDV)) {
        const v: Record<string, any> = {};
        for (const [t, i] of Object.entries(cot)) { const x = doc(i, COT_SO.includes(t)); v[t] = COT_SO.includes(t) ? so(x) : x; }
        if (v['Trạng thái'] === undefined && v['Tình trạng sử dụng'] !== undefined) v['Trạng thái'] = v['Tình trạng sử dụng'];
        if (typeof v['Mã cán bộ'] === 'number') v['Mã cán bộ'] = String(Math.round(v['Mã cán bộ']));
        out.dong.push({ loai, dong: r, v });
      } else {
        const g: Record<string, number | null> = {}; let co = false;
        for (const k of COT_CONG) if (cot[k]) { const v = so(doc(cot[k], true)); g[k] = v; if (v !== null) co = true; }
        if (co) sh.dongTong.push({ hang: r, coStt: sttSo, gt: g });
      }
    }
    out.chiTiet.push(sh);
  }
  return out;
}

/** Kiểm tra riêng của bảng kê đã format: đầu trang, dòng tổng, sheet tổng hợp phòng ban. */
export function kiemBangKeDaFormat(kq: KetQuaDocBK, ts: ThamSoHopDong): CanhBao[] {
  const out: CanhBao[] = [];
  const thuong = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  for (const d of kq.dauTrang) {
    const t = thuong(d.dong.join(' '));
    const dongTK = d.dong.find((x) => /số tài khoản/i.test(x) && /\d{5,}/.test(x));
    if (ts.tai_khoan?.so && (!dongTK || !thuong(dongTK).includes(thuong(ts.tai_khoan.so))))
      out.push({ ma_quy_tac: 'KT-06', phong_ban: 'ke_toan', muc_do: 'chan_gui', dong: [], noi_dung: `Sheet ${d.ten}: tài khoản nhận tiền "${dongTK ?? 'không có'}" khác hợp đồng (${ts.tai_khoan.so} — ${ts.tai_khoan.ngan_hang})` });
    if (ts.ben_ban?.mst && !t.includes(thuong(ts.ben_ban.mst)))
      out.push({ ma_quy_tac: 'KT-07', phong_ban: 'ke_toan', muc_do: 'chan_gui', dong: [], noi_dung: `Sheet ${d.ten}: không thấy MST bên bán ${ts.ben_ban.mst}` });
    if (ts.ben_mua?.mst && !t.includes(thuong(ts.ben_mua.mst)))
      out.push({ ma_quy_tac: 'KT-08', phong_ban: 'ke_toan', muc_do: 'chan_gui', dong: [], noi_dung: `Sheet ${d.ten}: không thấy MST bên mua ${ts.ben_mua.mst}` });
  }
  for (const sh of kq.chiTiet) {
    const ds = kq.dong.filter((d) => d.loai === sh.loai);
    for (const tr of sh.dongTong) {
      if (tr.coStt) out.push({ ma_quy_tac: 'KT-10', phong_ban: 'ke_toan', muc_do: 'giai_trinh', loai: sh.loai, dong: [tr.hang], noi_dung: `Sheet ${sh.ten}: dòng tổng (dòng ${tr.hang}) đang mang số thứ tự như một giao dịch` });
      const lech = Object.entries(tr.gt).filter(([k, v]) => v !== null && Math.abs((v as number) - ds.reduce((s, d) => s + n(d.v[k]), 0)) > 1);
      const lon = lech.some(([k, v]) => Math.abs((v as number) - ds.reduce((s, d) => s + n(d.v[k]), 0)) > NGUONG_NHO);
      if (lech.length) out.push({ ma_quy_tac: 'KT-10', phong_ban: 'ke_toan', muc_do: lon ? 'chan_gui' : 'theo_doi', loai: sh.loai, dong: [tr.hang],
        noi_dung: `Sheet ${sh.ten}: dòng tổng ${tr.hang} không khớp chi tiết ở ${lech.length} cột${lon ? '' : ' (lệch nhỏ — thường do giá trị ẩn trong ô gộp hoặc làm tròn)'} (${lech.slice(0, 3).map(([k, v]) => `${k}: ${Math.round(v as number).toLocaleString('vi-VN')} ≠ ${Math.round(ds.reduce((s, d) => s + n(d.v[k]), 0)).toLocaleString('vi-VN')}`).join('; ')})` });
    }
  }
  if (kq.tongHopPB) {
    const th = kq.tongHopPB; const lech: number[] = [], lechNho: number[] = [];
    for (const r of th.dong) {
      const loai: LoaiDichVu = /bay/i.test(r.dv) ? 've_may_bay' : 'khach_san';
      const ds = kq.dong.filter((d) => d.loai === loai && chuan(d.v['Phòng ban']) === r.pb);
      const tinh = { chua_vat: ds.reduce((s, d) => s + n(d.v['Thành tiền chưa VAT']), 0), ck: ds.reduce((s, d) => s + n(d.v['Chiết khấu trước VAT']), 0) };
      const d = Math.max(r.gt.chua_vat !== undefined ? Math.abs(r.gt.chua_vat - tinh.chua_vat) : 0, r.gt.ck !== undefined ? Math.abs(r.gt.ck - tinh.ck) : 0);
      if (d > NGUONG_NHO) lech.push(r.hang); else if (d > 1) lechNho.push(r.hang);
    }
    if (lech.length) out.push({ ma_quy_tac: 'KT-10', phong_ban: 'ke_toan', muc_do: 'chan_gui', dong: lech, noi_dung: `Sheet ${th.ten}: ${lech.length} dòng phòng ban không khớp tổng chi tiết (thành tiền hoặc chiết khấu)` });
    if (lechNho.length) out.push({ ma_quy_tac: 'KT-10', phong_ban: 'ke_toan', muc_do: 'theo_doi', dong: lechNho, noi_dung: `Sheet ${th.ten}: ${lechNho.length} dòng phòng ban lệch nhỏ (≤ ${NGUONG_NHO.toLocaleString('vi-VN')}đ) so với chi tiết — thường do giá trị ẩn trong ô gộp; bản đã sửa tính lại đúng` });
  }
  if (kq.khongNhanRa.length) out.push({ ma_quy_tac: 'KT-11', phong_ban: 'ke_toan', muc_do: 'theo_doi', dong: [], noi_dung: `Không nhận ra cấu trúc sheet: ${kq.khongNhanRa.join(', ')} — không kiểm` });
  return out;
}

/** Đối chiếu bảng kê với raw (nếu kế toán upload kèm). */
export function doiChieuRaw(bk: DongRaw[], raw: DongRaw[]): CanhBao[] {
  const out: CanhBao[] = [];
  const khoa = (d: DongRaw) => d.loai === 've_may_bay' ? `vmb|${chuan(d.v['Số vé'])}|${Math.sign(n(d.v['Thành tiền chưa VAT']))}`
    : `ks|${chuan(d.v['Mã giao dịch'])}|${chuan(d.v['Họ và tên Khách']).toUpperCase()}`;
  const gom = (ds: DongRaw[]) => { const m = new Map<string, { tien: number; dong: number[]; loai: LoaiDichVu }>();
    for (const d of ds) { if (!chuan(d.v[d.loai === 've_may_bay' ? 'Số vé' : 'Mã giao dịch'])) continue; const k = khoa(d); const g = m.get(k) ?? { tien: 0, dong: [], loai: d.loai }; g.tien += n(d.v['Thành tiền chưa VAT']); g.dong.push(d.dong); m.set(k, g); }
    return m; };
  const a = gom(bk), b = gom(raw);
  for (const loai of ['khach_san', 've_may_bay'] as LoaiDichVu[]) {
    const thieu = [...b.entries()].filter(([k, g]) => g.loai === loai && !a.has(k) && Math.abs(g.tien) > 1);
    const thua = [...a.entries()].filter(([k, g]) => g.loai === loai && !b.has(k) && Math.abs(g.tien) > 1);
    const lech = [...a.entries()].filter(([k, g]) => g.loai === loai && b.has(k) && Math.abs(g.tien - b.get(k)!.tien) > 2);
    const ten = TEN_DICH_VU[loai];
    if (thieu.length) out.push({ ma_quy_tac: 'KT-05', phong_ban: 'ke_toan', muc_do: 'giai_trinh', loai, dong: [], so_tien: thieu.reduce((s, [, g]) => s + g.tien, 0),
      noi_dung: `${ten}: ${thieu.length} giao dịch có trong raw nhưng không có trong bảng kê (VD ${thieu.slice(0, 5).map(([k]) => k.split('|')[1]).join(', ')})` });
    if (thua.length) out.push({ ma_quy_tac: 'KT-05', phong_ban: 'ke_toan', muc_do: 'giai_trinh', loai, dong: thua.flatMap(([, g]) => g.dong), so_tien: thua.reduce((s, [, g]) => s + g.tien, 0),
      noi_dung: `${ten}: ${thua.length} giao dịch có trong bảng kê nhưng không có trong raw` });
    if (lech.length) out.push({ ma_quy_tac: 'KT-05', phong_ban: 'ke_toan', muc_do: 'giai_trinh', loai, dong: lech.flatMap(([, g]) => g.dong),
      noi_dung: `${ten}: ${lech.length} giao dịch lệch thành tiền chưa VAT so với raw (VD ${lech.slice(0, 3).map(([k, g]) => `${k.split('|')[1]}: ${Math.round(g.tien).toLocaleString('vi-VN')} ≠ ${Math.round(b.get(k)!.tien).toLocaleString('vi-VN')}`).join('; ')})` });
  }
  return out;
}

/**
 * Bản đã sửa theo quy tắc: vá trực tiếp các ô trong file kế toán upload (giữ mẫu và công thức).
 * - Ô chiết khấu / phí sai quy tắc: thay bằng giá trị đúng (bỏ công thức sai).
 * - Ô có công thức phụ thuộc (tổng chiết khấu, tổng thành tiền, dòng tổng, sheet phòng ban): giữ công thức, cập nhật kết quả.
 * - Dòng tổng mang số thứ tự: xóa số thứ tự. Tài khoản nhận tiền trên đầu trang: thay bằng tài khoản theo hợp đồng.
 */
export async function taoBanDaSua(buf: Buffer, kq: KetQuaDocBK, thayDoi: ThayDoi[], ts: ThamSoHopDong): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  // Công thức dùng chung (shared formula) → đổi thành công thức thường để vá từng ô an toàn.
  // Hai lượt: tính công thức của mọi ô trước (khi ô gốc còn nguyên), rồi mới gán.
  for (const ws of wb.worksheets) {
    const doi: [ExcelJS.Cell, string, any][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
      const v: any = c.value;
      if (v && typeof v === 'object' && ('sharedFormula' in v || v.shareType === 'shared')) {
        let f: string | undefined; try { f = c.formula; } catch { f = undefined; }
        doi.push([c, f ?? '', v.result]);
      }
    }));
    for (const [c, f, r] of doi) c.value = (f ? { formula: f, result: r } : (r ?? null)) as any;
  }
  const datKQ = (c: ExcelJS.Cell, x: number) => { const v: any = c.value; c.value = (v && typeof v === 'object' && 'formula' in v ? { formula: v.formula, result: x } : x) as any; };
  const dsCot = (sh: SheetCT, ten: string) => sh.cot[ten];
  for (const t of thayDoi) {
    const sh = kq.chiTiet.find((s) => s.loai === t.loai); if (!sh) continue;
    const ci = dsCot(sh, t.cot); if (!ci) continue;
    const c = wb.getWorksheet(sh.ten)!.getRow(t.dong).getCell(ci);
    if (t.ma_quy_tac === 'KT-01' || t.ma_quy_tac === 'KT-02') c.value = t.sau; else datKQ(c, t.sau);
  }
  for (const sh of kq.chiTiet) {
    const ws = wb.getWorksheet(sh.ten)!; const ds = kq.dong.filter((d) => d.loai === sh.loai);
    for (const tr of sh.dongTong) {
      for (const k of Object.keys(tr.gt)) if (tr.gt[k] !== null && sh.cot[k]) datKQ(ws.getRow(tr.hang).getCell(sh.cot[k]), ds.reduce((s, d) => s + n(d.v[k]), 0));
      if (tr.coStt) ws.getRow(tr.hang).getCell(1).value = null;
    }
  }
  if (kq.tongHopPB) {
    const th = kq.tongHopPB; const ws = wb.getWorksheet(th.ten)!; const c = th.cot;
    const cong: Record<string, number> = {};
    for (const r of th.dong) {
      const loai: LoaiDichVu = /bay/i.test(r.dv) ? 've_may_bay' : 'khach_san';
      const ds = kq.dong.filter((d) => d.loai === loai && chuan(d.v['Phòng ban']) === r.pb);
      const s = (k: string) => ds.reduce((a, d) => a + n(d.v[k]), 0);
      const g = { chua_vat: s('Thành tiền chưa VAT'), phi: s('Phí dịch vụ chưa VAT'), ck: s('Chiết khấu trước VAT') } as Record<string, number>;
      g.tong_chua_vat = g.chua_vat + g.phi - g.ck; g.vat = s('VAT') + s('VAT phí dịch vụ') - s('VAT chiết khấu'); g.tong = g.tong_chua_vat + g.vat;
      for (const k of Object.keys(g)) if (c[k]) { datKQ(ws.getRow(r.hang).getCell(c[k]), g[k]); cong[k] = (cong[k] ?? 0) + g[k]; }
    }
    for (const h of th.tong) for (const k of Object.keys(cong)) if (c[k]) datKQ(ws.getRow(h).getCell(c[k]), cong[k]);
  }
  if (ts.tai_khoan?.so) for (const ws of wb.worksheets) for (let r = 1; r <= 14; r++) ws.getRow(r).eachCell((c) => {
    const t = chuan(gt(c.value));
    if (/^số tài khoản/i.test(t) && /\d{5,}/.test(t) && !t.replace(/\s/g, '').includes(ts.tai_khoan.so)) c.value = `Số tài khoản (A/C No.): ${ts.tai_khoan.so} tại ${ts.tai_khoan.ngan_hang}`;
  });
  wb.calcProperties = { ...(wb.calcProperties ?? {}), fullCalcOnLoad: true } as any;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function suaTheoQuyTac(kq: KetQuaDocBK, ts: ThamSoHopDong) { return tuSua(kq.dong, ts); }
export { tongHop };
