/**
 * "Agent" đề xuất cho từng bước duyệt — bản đầu chạy bằng luật cố định (không gọi AI),
 * để mọi đề xuất đều giải thích được. Bước sau sẽ thêm agent AI chat theo skill của từng head.
 */
export type DeXuat = { ket_luan: 'duyet' | 'tra_ve'; ly_do: string[]; luu_y: string[] };
type CB = { id: number; ma_quy_tac: string; phong_ban: string; muc_do: string; noi_dung: string; giai_trinh: string | null; so_tien: number | null };
type TD = { xac_nhan: boolean; ma_quy_tac: string; cot: string };
type DY = { buoc: string; quyet_dinh: string };

const canGiaiTrinh = (c: CB) => (c.muc_do === 'chan_gui' || c.muc_do === 'giai_trinh') && !c.giai_trinh?.trim();

export function deXuatBuoc(buoc: string, cb: CB[], td: TD[], dy: DY[]): DeXuat {
  const ly_do: string[] = [], luu_y: string[] = [];
  const chuaXn = td.filter((t) => !t.xac_nhan).length;

  if (buoc === 'ke_toan') {
    if (chuaXn) ly_do.push(`${chuaXn} ô app tự sửa chưa được kế toán xác nhận.`);
    const thieu = cb.filter(canGiaiTrinh);
    if (thieu.length) ly_do.push(`${thieu.length} cảnh báo chặn gửi / cần giải trình chưa có giải trình (${[...new Set(thieu.map((c) => c.ma_quy_tac))].join(', ')}).`);
    if (td.length) luu_y.push(`App đã tự sửa ${td.length} ô theo bộ quy tắc — xem tab "App tự sửa".`);
    return { ket_luan: ly_do.length ? 'tra_ve' : 'duyet', ly_do, luu_y };
  }

  if (buoc === 'demand' || buoc === 'supply') {
    const cua = cb.filter((c) => c.phong_ban === buoc);
    const chan = cua.filter((c) => c.muc_do === 'chan_gui');
    const chanThieu = chan.filter((c) => !c.giai_trinh?.trim());
    if (chanThieu.length) ly_do.push(`${chanThieu.length} cảnh báo chặn gửi thuộc scope chưa có giải trình.`);
    for (const c of chan.filter((c) => c.giai_trinh?.trim())) luu_y.push(`${c.ma_quy_tac}: ${c.noi_dung} — kế toán giải trình: "${c.giai_trinh}"`);
    const gt = cua.filter((c) => c.muc_do === 'giai_trinh').length;
    if (gt) luu_y.push(`${gt} cảnh báo cần giải trình thuộc scope, đã có giải trình — đọc lại trước khi duyệt.`);
    const chua = cua.filter((c) => c.muc_do === 'theo_doi' && /^Chưa/.test(c.noi_dung));
    for (const c of chua) luu_y.push(`${c.ma_quy_tac}: ${c.noi_dung}`);
    return { ket_luan: ly_do.length ? 'tra_ve' : 'duyet', ly_do, luu_y };
  }

  // CEO: mọi bước trước phải duyệt; không còn chặn gửi thiếu giải trình
  for (const b of ['ke_toan', 'demand', 'supply']) {
    if (!dy.some((d) => d.buoc === b && d.quyet_dinh === 'duyet')) ly_do.push(`Bước ${b} chưa duyệt.`);
  }
  const chanThieu = cb.filter((c) => c.muc_do === 'chan_gui' && !c.giai_trinh?.trim());
  if (chanThieu.length) ly_do.push(`${chanThieu.length} cảnh báo chặn gửi chưa có giải trình.`);
  if (chuaXn) ly_do.push(`${chuaXn} ô app tự sửa chưa được kế toán xác nhận.`);
  if (td.length) luu_y.push(`Bảng kê khác raw ở ${td.length} ô do app tự sửa theo quy tắc (đã được kế toán xác nhận).`);
  const coGt = cb.filter((c) => c.muc_do !== 'theo_doi' && c.giai_trinh?.trim());
  if (coGt.length) luu_y.push(`${coGt.length} ngoại lệ được gửi đi kèm giải trình — xem danh sách bên dưới.`);
  return { ket_luan: ly_do.length ? 'tra_ve' : 'duyet', ly_do, luu_y };
}

export const textDeXuat = (d: DeXuat) =>
  `${d.ket_luan === 'duyet' ? 'Đề xuất DUYỆT' : 'Đề xuất TRẢ VỀ'}${d.ly_do.length ? ': ' + d.ly_do.join(' ') : ''}`;
