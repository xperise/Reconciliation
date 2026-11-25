import { chuoiNgay, ngayISO } from './raw';
const chuoiNgayKhoa = (x: any) => chuoiNgay(x);
import { coTien, COT_TT_DA_VAT, khoangKy, maGiaoDich, tongHop } from './tinh';
import { CanhBao, DongRaw, LoaiDichVu, ThamSoHopDong, TEN_DICH_VU } from './types';

const n = (x: any) => (typeof x === 'number' ? x : 0);
const trong = (x: any) => x === null || x === undefined || String(x).trim() === '';
const fmt = (x: number) => Math.round(x).toLocaleString('vi-VN');

export interface DauVaoKiem {
  dong: DongRaw[];
  ts: ThamSoHopDong;
  thang: string;            // 'YYYY-MM'
  dot?: 1 | 2;
  /** Danh mục phòng ban của khách (tên phòng ban trên sheet Chi phí phòng ban) */
  danh_muc_phong_ban: string[];
  thieu_cot: Record<LoaiDichVu, string[]>;
  /** Tên công ty khách trên cột 'Tên công ty' của raw */
  ten_cong_ty: string;
}

/**
 * Chạy toàn bộ quy tắc tự động trên dữ liệu ĐÃ tự sửa.
 * Mỗi cảnh báo trỏ về số dòng trong file raw để kế toán tra lại.
 */
export function kiemTra(x: DauVaoKiem): CanhBao[] {
  const out: CanhBao[] = [];
  const add = (c: CanhBao) => { out.push(c); };
  const { dong, ts } = x;

  // KT-11 thiếu cột bắt buộc
  for (const loai of Object.keys(x.thieu_cot) as LoaiDichVu[]) {
    if (x.thieu_cot[loai].length) add({ ma_quy_tac: 'KT-11', phong_ban: 'ke_toan', muc_do: 'chan_gui', loai, dong: [],
      noi_dung: `File raw ${TEN_DICH_VU[loai]} thiếu cột: ${x.thieu_cot[loai].join(', ')}` });
  }

  for (const loai of ['khach_san', 've_may_bay'] as LoaiDichVu[]) {
    const ds = dong.filter((d) => d.loai === loai);
    const ten = TEN_DICH_VU[loai];

    // KT-08 đúng khách hàng
    const khac = ds.filter((d) => String(d.v['Tên công ty'] ?? '').trim().toUpperCase() !== x.ten_cong_ty.trim().toUpperCase());
    if (khac.length) add({ ma_quy_tac: 'KT-08', phong_ban: 'ke_toan', muc_do: 'chan_gui', loai, dong: khac.map((d) => d.dong),
      noi_dung: `${ten}: ${khac.length} dòng không thuộc ${x.ten_cong_ty}` });

    // KT-03 số học: chưa VAT + VAT = thành tiền đã VAT
    const sai = ds.filter((d) => coTien(d) &&
      Math.abs(n(d.v['Thành tiền chưa VAT']) + n(d.v['VAT']) - n(d.v[COT_TT_DA_VAT[loai]])) > 1);
    if (sai.length) add({ ma_quy_tac: 'KT-03', phong_ban: 'ke_toan', muc_do: 'chan_gui', loai, dong: sai.map((d) => d.dong),
      noi_dung: `${ten}: ${sai.length} dòng có Thành tiền chưa VAT + VAT ≠ Thành tiền đã VAT` });

    // KT-05 trùng giao dịch
    // Trùng y hệt: cùng mã/số vé, cùng khách, cùng ngày, CÙNG số tiền. Cặp đặt (+) / hủy (−) là hợp lệ, không tính.
    const khoa = (d: DongRaw) => [maGiaoDich(d), d.v['Họ và tên Khách'], chuoiNgayKhoa(d.v['Ngày checkin/Ngày đi']),
      Math.round(n(d.v['Thành tiền chưa VAT']))].join('|');
    const dem = new Map<string, number[]>();
    ds.filter((d) => !trong(maGiaoDich(d)) && Math.round(n(d.v['Thành tiền chưa VAT'])) !== 0).forEach((d) => { const k = khoa(d); dem.set(k, [...(dem.get(k) ?? []), d.dong]); });
    const trung = [...dem.values()].filter((v) => v.length > 1);
    if (trung.length) add({ ma_quy_tac: 'KT-05', phong_ban: 'ke_toan', muc_do: 'giai_trinh', loai, dong: trung.flat(),
      noi_dung: `${ten}: ${trung.length} nhóm dòng trùng y hệt (cùng mã, khách, ngày và số tiền) — có thể bị tính hai lần` });

    // KT-09 thiếu hóa đơn
    const khongHd = ds.filter((d) => coTien(d) && trong(d.v['Số hóa đơn']));
    if (khongHd.length) add({ ma_quy_tac: 'KT-09', phong_ban: 'ke_toan', muc_do: 'giai_trinh', loai, dong: khongHd.map((d) => d.dong),
      so_tien: khongHd.reduce((s, d) => s + n(d.v['Tổng thành tiền']), 0),
      noi_dung: `${ten}: ${khongHd.length} dòng có tiền nhưng chưa có số hóa đơn` });

    // DM-01 ngoài kỳ
    const ky = khoangKy(ts, x.thang, x.dot);
    const ngoai = ds.filter((d) => { const i = ngayISO(d.v['Ngày giao dịch']); return !i || i < ky.tu || i > ky.den; });
    if (ngoai.length) add({ ma_quy_tac: 'DM-01', phong_ban: 'demand', muc_do: 'giai_trinh', loai, dong: ngoai.map((d) => d.dong),
      noi_dung: `${ten}: ${ngoai.length} dòng có ngày giao dịch ngoài kỳ (${ky.nhan}) — kế toán giải trình` });

    // DM-07 Trip ID và người duyệt
    const thieuDuyet = ds.filter((d) => trong(d.v['Trip ID']) || trong(d.v['Người duyệt chuyến đi']));
    if (thieuDuyet.length) add({ ma_quy_tac: 'DM-07', phong_ban: 'demand', muc_do: 'chan_gui', loai, dong: thieuDuyet.map((d) => d.dong),
      noi_dung: `${ten}: ${thieuDuyet.length} dòng thiếu Trip ID hoặc người duyệt chuyến đi` });

    // DM-08 mã cán bộ
    const thieuMa = ds.filter((d) => trong(d.v['Mã cán bộ']));
    if (thieuMa.length) add({ ma_quy_tac: 'DM-08', phong_ban: 'demand', muc_do: 'giai_trinh', loai, dong: thieuMa.map((d) => d.dong),
      noi_dung: `${ten}: ${thieuMa.length} dòng thiếu mã cán bộ` });

    // SP-05 quốc tế
    const qt = ds.filter((d) => String(d.v['Nội địa/Quốc tế'] ?? '').toLowerCase().includes('quốc tế'));
    if (qt.length) add({ ma_quy_tac: 'SP-05', phong_ban: 'supply', muc_do: 'giai_trinh', loai, dong: qt.map((d) => d.dong),
      noi_dung: `${ten}: ${qt.length} giao dịch quốc tế — cần xác nhận phạm vi` });

    // Thông tin: giao dịch hủy/hoàn được giữ theo raw
    const huy = ds.filter((d) => /cancel/i.test(String(d.v['Trạng thái'] ?? '')));
    if (huy.length) add({ ma_quy_tac: 'KT-05', phong_ban: 'ke_toan', muc_do: 'theo_doi', loai, dong: huy.map((d) => d.dong),
      so_tien: huy.reduce((s, d) => s + n(d.v['Tổng thành tiền']), 0),
      noi_dung: `${ten}: ${huy.length} dòng trạng thái hủy được giữ theo raw, tổng ${fmt(huy.reduce((s, d) => s + n(d.v['Tổng thành tiền']), 0))}đ` });
  }

  // DM-08 một mã cán bộ — nhiều người
  const theoMa = new Map<string, Set<string>>(); const dongMa = new Map<string, number[]>();
  for (const d of dong) {
    const ma = String(d.v['Mã cán bộ'] ?? '').trim(); if (!ma) continue;
    const ten = String(d.v['Họ và tên Khách'] ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toUpperCase().replace(/\s+/g, ' ').trim();
    theoMa.set(ma, (theoMa.get(ma) ?? new Set()).add(ten)); dongMa.set(ma, [...(dongMa.get(ma) ?? []), d.dong]);
  }
  const maTrung = [...theoMa.entries()].filter(([, s]) => s.size > 1);
  if (maTrung.length) add({ ma_quy_tac: 'DM-08', phong_ban: 'demand', muc_do: 'giai_trinh', dong: maTrung.flatMap(([m]) => dongMa.get(m)!),
    noi_dung: `${maTrung.length} mã cán bộ gắn với nhiều tên khác nhau: ${maTrung.slice(0, 5).map(([m, s]) => `${m} (${[...s].join(' / ')})`).join('; ')}${maTrung.length > 5 ? '…' : ''}` });

  // DM-04 định mức tiền phòng (giá/đêm đã gồm thuế, theo chức danh × nhóm địa bàn PL2b)
  const khongDau = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const laNhom12 = (diaChi: string) => {
    const a = ` ${khongDau(diaChi).replace(/[^a-z0-9]+/g, ' ')} `;
    return (ts.dia_ban_nhom_1_2 ?? []).some((k) => k === 'vinh'
      ? / vinh (?!long|phuc|yen|hy|chau|loi)/.test(a) : a.includes(` ${k} `));
  };
  const vuot: number[] = [], canXem: number[] = [];
  let tienVuot = 0;
  for (const d of dong.filter((d) => d.loai === 'khach_san' && coTien(d))) {
    if (n(d.v['Thành tiền chưa VAT']) <= 0) continue;            // dòng hủy/hoàn tiền
    const dem = n(d.v['Số lượng phòng']) * n(d.v['Số lượng đêm']);
    if (!dem) continue;
    const moiDem = n(d.v['Thành tiền (đã VAT)']) / dem;
    const chucDanh = String(d.v['Chức danh hành khách'] ?? '').toLowerCase();
    const nhom = (ts.dinh_muc_phong ?? []).find((g) => g.tu_khoa.length === 0 || g.tu_khoa.some((k) => chucDanh.includes(k)));
    if (!nhom || !nhom.muc) continue;   // hợp đồng không có định mức → không kiểm
    const [cao, thap] = nhom.muc;
    const muc = laNhom12(String(d.v['Địa bàn'] ?? '') + ' ' + String(d.v['Tên khách sạn'] ?? '')) ? cao : thap;
    if (moiDem > cao + 1) { vuot.push(d.dong); tienVuot += (moiDem - cao) * dem; }
    else if (moiDem > muc + 1) canXem.push(d.dong);
  }
  if (vuot.length) add({ ma_quy_tac: 'DM-04', phong_ban: 'demand', muc_do: 'chan_gui', loai: 'khach_san', dong: vuot, so_tien: tienVuot,
    noi_dung: `${vuot.length} phòng vượt định mức ở mọi nhóm địa bàn, phần vượt ước ${fmt(tienVuot)}đ — cần tờ trình phê duyệt trước (Đ6.2), nếu không VCB không thanh toán phần vượt` });
  if (canXem.length) add({ ma_quy_tac: 'DM-04', phong_ban: 'demand', muc_do: 'giai_trinh', loai: 'khach_san', dong: canXem,
    noi_dung: `${canXem.length} phòng vượt định mức nhóm III; địa chỉ không khớp danh mục nhóm I–II (ước theo địa chỉ) — head xác nhận nhóm địa bàn` });

  // DM-03 hạn mức tháng
  const th = tongHop(dong);
  if (ts.han_muc_thang && th.tong_cong > ts.han_muc_thang) add({ ma_quy_tac: 'DM-03', phong_ban: 'demand', muc_do: 'giai_trinh', dong: [], so_tien: th.tong_cong,
    noi_dung: `Tổng kỳ ${fmt(th.tong_cong)}đ vượt hạn mức tháng ${fmt(ts.han_muc_thang)}đ` });

  // Dòng có tiền nhưng trống phòng ban: vẫn vào sheet tổng hợp ở mục '(Chưa có phòng ban)'
  const trongPB = dong.filter((d) => coTien(d) && trong(d.v['Phòng ban']));
  if (trongPB.length) add({ ma_quy_tac: 'KT-10', phong_ban: 'ke_toan', muc_do: 'giai_trinh', dong: trongPB.map((d) => d.dong),
    so_tien: trongPB.reduce((s, d) => s + n(d.v['Tổng thành tiền']), 0),
    noi_dung: `${trongPB.length} dòng có tiền nhưng trống Phòng ban — đang xếp vào mục "(Chưa có phòng ban)" trên sheet tổng hợp` });

  // Phòng ban chưa có trong danh mục (sheet Chi phí phòng ban)
  const dm = new Set(x.danh_muc_phong_ban.map((s) => s.trim()));
  const moi = new Map<string, number[]>();
  for (const d of dong) { const p = String(d.v['Phòng ban'] ?? '').trim(); if (p && !dm.has(p)) moi.set(p, [...(moi.get(p) ?? []), d.dong]); }
  if (dm.size && moi.size) add({ ma_quy_tac: 'KT-10', phong_ban: 'ke_toan', muc_do: 'giai_trinh', dong: [...moi.values()].flat(),
    noi_dung: `${moi.size} phòng ban chưa có trong danh mục Chi phí phòng ban: ${[...moi.keys()].join('; ')}` });

  // Giai đoạn 2: nói rõ là CHƯA kiểm, không im lặng coi như đạt
  for (const [ma, pb, nd] of [
    ['SP-01', 'supply', 'Chưa kiểm giá vé so với giá hãng — chưa có dữ liệu giá hãng tại thời điểm đặt'],
    ['SP-02', 'supply', 'Chưa kiểm giá phòng so với giá khách sạn chào VCB — chưa có danh sách giá corporate'],
    ['SP-04', 'supply', 'Chưa đối ứng giao dịch nhà cung cấp — chưa có dữ liệu NCC'],
    ['CEO-01', 'ceo', 'Chưa tính P&L từng giao dịch — chưa có giá vốn NCC'],
  ] as const) add({ ma_quy_tac: ma, phong_ban: pb, muc_do: 'theo_doi', dong: [], noi_dung: nd });

  return out;
}
