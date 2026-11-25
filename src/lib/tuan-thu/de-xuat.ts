/**
 * "Agent" đề xuất cho từng bước duyệt — bản đầu chạy bằng luật cố định (không gọi AI),
 * để mọi đề xuất đều giải thích được. Bước sau sẽ thêm agent AI chat theo skill của từng head.
 */
export type DeXuat = { ket_luan: 'duyet' | 'tra_ve'; ly_do: string[]; luu_y: string[] };
type CB = { id: number; ma_quy_tac: string; phong_ban: string; muc_do: string; noi_dung: string; giai_trinh: string | null; so_tien: number | null };
type TD = { xac_nhan: boolean; ma_quy_tac: string; cot: string };
type DY = { buoc: string; quyet_dinh: string };

/** Giải trình còn là gợi ý của agent (chưa được kế toán sửa lại) thì coi như chưa có. */
export const GOI_Y_AGENT = '[Gợi ý agent';
const coGt = (c: CB) => !!c.giai_trinh?.trim() && !c.giai_trinh.startsWith(GOI_Y_AGENT);
const canGiaiTrinh = (c: CB) => (c.muc_do === 'chan_gui' || c.muc_do === 'giai_trinh') && !coGt(c);

export function deXuatBuoc(buoc: string, cb: CB[], td: TD[], dy: DY[], dangChan: { phong_ban: string; ly_do: string }[] = [], tuyChon: { chuaChonBan?: boolean; banGui?: string | null } = {}): DeXuat {
  const ly_do: string[] = [], luu_y: string[] = [];
  const chuaXn = td.filter((t) => !t.xac_nhan).length;

  if (buoc === 'ke_toan') {
    if (tuyChon.chuaChonBan) ly_do.push('Chưa chọn bản gửi khách: bảng kê kế toán upload hay bản đã sửa theo quy tắc.');
    if (chuaXn && tuyChon.banGui !== 'goc') ly_do.push(`${chuaXn} ô app tự sửa chưa được kế toán xác nhận.`);
    if (tuyChon.banGui === 'goc' && td.length) luu_y.push(`Kế toán chọn gửi bản tự format: ${td.length} ô khác quy tắc vẫn giữ nguyên trong file gửi khách — các cảnh báo liên quan phải có giải trình.`);
    const thieu = cb.filter(canGiaiTrinh);
    if (thieu.length) ly_do.push(`${thieu.length} cảnh báo chặn gửi / cần giải trình chưa có giải trình (${[...new Set(thieu.map((c) => c.ma_quy_tac))].join(', ')}).`);
    if (td.length) luu_y.push(`App đã tự sửa ${td.length} ô theo bộ quy tắc — xem tab "App tự sửa".`);
    return { ket_luan: ly_do.length ? 'tra_ve' : 'duyet', ly_do, luu_y };
  }

  // Demand/Supply không duyệt: 'duyet' nghĩa là KHÔNG CẦN CHẶN, 'tra_ve' nghĩa là NÊN CHẶN / TRẢ VỀ
  if (buoc === 'demand' || buoc === 'supply') {
    const cua = cb.filter((c) => c.phong_ban === buoc);
    const chan = cua.filter((c) => c.muc_do === 'chan_gui');
    const chanThieu = chan.filter((c) => !coGt(c));
    if (chanThieu.length) ly_do.push(`${chanThieu.length} cảnh báo chặn gửi thuộc scope chưa có giải trình.`);
    for (const c of chan.filter(coGt)) luu_y.push(`${c.ma_quy_tac}: ${c.noi_dung} — kế toán giải trình: "${c.giai_trinh}"`);
    const gt = cua.filter((c) => c.muc_do === 'giai_trinh').length;
    if (gt) luu_y.push(`${gt} cảnh báo cần giải trình thuộc scope, đã có giải trình — đọc lại trước khi duyệt.`);
    const chua = cua.filter((c) => c.muc_do === 'theo_doi' && /^Chưa/.test(c.noi_dung));
    for (const c of chua) luu_y.push(`${c.ma_quy_tac}: ${c.noi_dung}`);
    return { ket_luan: ly_do.length ? 'tra_ve' : 'duyet', ly_do, luu_y };
  }

  // CEO: kế toán đã duyệt; Demand/Supply không chặn; không còn chặn gửi thiếu giải trình
  if (!dy.some((d) => d.buoc === 'ke_toan' && d.quyet_dinh === 'duyet')) ly_do.push('Kế toán chưa duyệt.');
  for (const c of dangChan) ly_do.push(`${c.phong_ban === 'demand' ? 'Demand' : 'Supply'} đang chặn: ${c.ly_do}`);
  const chanThieu = cb.filter((c) => c.muc_do === 'chan_gui' && !coGt(c));
  if (chanThieu.length) ly_do.push(`${chanThieu.length} cảnh báo chặn gửi chưa có giải trình.`);
  if (tuyChon.chuaChonBan) ly_do.push('Kế toán chưa chọn bản gửi khách.');
  if (chuaXn && tuyChon.banGui !== 'goc') ly_do.push(`${chuaXn} ô app tự sửa chưa được kế toán xác nhận.`);
  if (tuyChon.banGui === 'goc' && td.length) luu_y.push(`Gửi BẢN KẾ TOÁN TỰ FORMAT: ${td.length} ô khác bộ quy tắc vẫn giữ nguyên trong file gửi khách.`);
  else if (td.length) luu_y.push(`Bảng kê gửi khách khác ${tuyChon.banGui === 'da_sua' ? 'file kế toán upload' : 'raw'} ở ${td.length} ô do app sửa theo quy tắc (đã được kế toán xác nhận).`);
  const daGt = cb.filter((c) => c.muc_do !== 'theo_doi' && coGt(c));
  if (daGt.length) luu_y.push(`${daGt.length} ngoại lệ được gửi đi kèm giải trình — xem danh sách bên dưới.`);
  return { ket_luan: ly_do.length ? 'tra_ve' : 'duyet', ly_do, luu_y };
}

export const textDeXuat = (d: DeXuat) =>
  `${d.ket_luan === 'duyet' ? 'Đề xuất DUYỆT' : 'Đề xuất TRẢ VỀ'}${d.ly_do.length ? ': ' + d.ly_do.join(' ') : ''}`;
