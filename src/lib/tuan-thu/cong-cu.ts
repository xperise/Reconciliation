import { supabaseAdmin } from '@/lib/supabase/admin';
import { dsDangChan, duocLam, fmtVnd, nhanThang, NguoiTT, TEN_BUOC } from './db';
import { boiCanhLanChay } from './agent';
import { docDongLanChay } from './xu-ly';
import { PhongBan, TEN_PHONG_BAN, TEN_DICH_VU, LoaiDichVu } from './types';

/**
 * Công cụ của agent (Claude tool use).
 * - Công cụ ĐỌC chạy ngay.
 * - Công cụ THAO TÁC không chạy ngay: tạo một thẻ "chờ xác nhận" trong chat; người dùng bấm Thực hiện
 *   thì mới chạy, bằng đúng quyền của người đó (kiểm lại ở server action).
 */
type Tool = { name: string; description: string; input_schema: any };
const obj = (properties: any, required: string[] = []) => ({ type: 'object', properties, required });
const S = (description: string) => ({ type: 'string', description });
const I = (description: string) => ({ type: 'integer', description });

export const CONG_CU_DOC: Tool[] = [
  { name: 'ds_lan_chay', description: 'Liệt kê các lần chạy bảng kê gần nhất (id, khách, kỳ, bước, vòng, tổng tiền, đang chặn hay không).', input_schema: obj({}) },
  { name: 'xem_lan_chay', description: 'Xem đầy đủ một lần chạy: tổng tiền, ô app tự sửa, cảnh báo (kèm id cảnh báo và số dòng raw), giải trình, duyệt, lần chặn (kèm id chặn), sửa tay.', input_schema: obj({ lan_chay_id: S('id lần chạy') }, ['lan_chay_id']) },
  { name: 'xem_dong', description: 'Đọc nội dung các dòng raw của một lần chạy (đã áp sửa tay). Dùng trước khi đề xuất sửa ô. Tối đa 30 dòng mỗi lần; có thể tìm theo chuỗi (mã giao dịch, số vé, tên khách).',
    input_schema: obj({ lan_chay_id: S('id lần chạy'), loai: { type: 'string', enum: ['khach_san', 've_may_bay'] }, dong: { type: 'array', items: { type: 'integer' }, description: 'số dòng trong file raw' }, tim: S('chuỗi cần tìm (không bắt buộc)') }, ['lan_chay_id']) },
  { name: 'ds_hop_dong', description: 'Liệt kê các hợp đồng (id, mã khách, số HĐ, trạng thái, số quy tắc đã chốt theo phòng).', input_schema: obj({}) },
  { name: 'xem_hop_dong', description: 'Đọc đầy đủ một hợp đồng: tóm tắt điều khoản, tham số máy, toàn bộ quy tắc của 4 phòng kèm trạng thái chốt, điểm còn mở. Dùng khi hỏi về khách khác với hợp đồng trong bối cảnh.', input_schema: obj({ hop_dong_id: S('id hợp đồng') }, ['hop_dong_id']) },
  { name: 'ds_sua_doi', description: 'Liệt kê các đề xuất sửa đổi quy tắc (id, quy tắc, nội dung, trạng thái, phòng nào đã đồng ý).', input_schema: obj({}) },
];

export const CONG_CU_THAO_TAC: Tool[] = [
  { name: 'sua_o_bang_ke', description: 'Kế toán: sửa giá trị một hoặc nhiều ô của bảng kê (theo dòng raw). Sau khi sửa, app xử lý lại lần chạy, mọi duyệt của vòng hiện tại mất hiệu lực. Ô tiền vẫn bị app chỉnh theo bộ quy tắc nếu sai quy tắc.',
    input_schema: obj({ lan_chay_id: S('id lần chạy'), thay_doi: { type: 'array', items: obj({ loai: { type: 'string', enum: ['khach_san', 've_may_bay'] }, dong: I('số dòng raw'), cot: S('tên cột đúng như raw, ví dụ "Mã cán bộ", "Phòng ban", "Số hóa đơn"'), gia_tri_moi: S('giá trị mới') }, ['loai', 'dong', 'cot', 'gia_tri_moi']) }, ly_do: S('lý do sửa') }, ['lan_chay_id', 'thay_doi', 'ly_do']) },
  { name: 'ghi_giai_trinh', description: 'Kế toán: ghi giải trình cho một cảnh báo.', input_schema: obj({ canh_bao_id: I('id cảnh báo'), noi_dung: S('giải trình') }, ['canh_bao_id', 'noi_dung']) },
  { name: 'xac_nhan_o_tu_sua', description: 'Kế toán: xác nhận toàn bộ các ô app tự sửa theo quy tắc là đúng.', input_schema: obj({ lan_chay_id: S('id lần chạy') }, ['lan_chay_id']) },
  { name: 'duyet_buoc', description: 'Duyệt bước của mình: kế toán duyệt (chuyển CEO) hoặc CEO duyệt (app GỬI bảng kê cho khách ngay).', input_schema: obj({ lan_chay_id: S('id lần chạy'), buoc: { type: 'string', enum: ['ke_toan', 'ceo'] }, y_kien: S('ý kiến') }, ['lan_chay_id', 'buoc']) },
  { name: 'tra_ve_ke_toan', description: 'Trả lần chạy về kế toán kèm lý do (mở vòng mới).', input_schema: obj({ lan_chay_id: S('id lần chạy'), phong_ban: { type: 'string', enum: ['ke_toan', 'demand', 'supply', 'ceo'] }, ly_do: S('lý do') }, ['lan_chay_id', 'phong_ban', 'ly_do']) },
  { name: 'chan_bang_ke', description: 'Demand/Supply: chặn lần chạy, CEO không duyệt được cho tới khi gỡ.', input_schema: obj({ lan_chay_id: S('id lần chạy'), phong_ban: { type: 'string', enum: ['demand', 'supply'] }, ly_do: S('lý do') }, ['lan_chay_id', 'phong_ban', 'ly_do']) },
  { name: 'go_chan', description: 'Demand/Supply: gỡ một lần chặn (id chặn lấy từ xem_lan_chay).', input_schema: obj({ chan_id: I('id lần chặn'), ghi_chu: S('đã xử lý thế nào') }, ['chan_id']) },
  { name: 'de_xuat_sua_doi', description: 'Đề xuất sửa một quy tắc so với hợp đồng (cần đủ 4 head đồng ý). Có thể kèm thay đổi tham số máy.',
    input_schema: obj({ ma_khach: S('mã khách, mặc định VCB'), ma_quy_tac: S('ví dụ DM-01'), noi_dung_moi: S('nội dung quy tắc mới'), gia_tri_moi: S('giá trị / ngưỡng mới'), ly_do: S('lý do'), can_cu: S('căn cứ: phụ lục, email khách'), hieu_luc_tu: S('YYYY-MM'),
      loai_tham_so: { type: 'string', enum: ['', 'ky_hai_dot', 'ky_thang', 'chiet_khau', 'phi', 'tai_khoan', 'han_muc'] }, ngay_cat: I('ngày cuối đợt 1 khi ky_hai_dot'), ck_ks: { type: 'number', description: '% chiết khấu khách sạn' }, ck_vmb: { type: 'number', description: '% chiết khấu vé' },
      phi_ks: { type: 'number' }, phi_vmb: { type: 'number' }, tk_so: S('số tài khoản'), tk_ngan_hang: S('ngân hàng'), han_muc: { type: 'number' } }, ['ma_quy_tac', 'noi_dung_moi', 'ly_do', 'hieu_luc_tu']) },
  { name: 'duyet_sua_doi', description: 'Đồng ý hoặc không đồng ý một đề xuất sửa đổi thay cho phòng của người dùng.', input_schema: obj({ sua_doi_id: S('id đề xuất'), dong_y: { type: 'boolean' }, y_kien: S('ý kiến (bắt buộc khi không đồng ý)') }, ['sua_doi_id', 'dong_y']) },
  { name: 'chot_quy_tac', description: 'Chốt một quy tắc thuộc phòng của người dùng: đồng ý hoặc cần sửa.', input_schema: obj({ hop_dong_id: S('id hợp đồng (ưu tiên dùng)'), ma_khach: S('mặc định VCB'), ma: S('mã quy tắc'), dong_y: { type: 'boolean' }, y_kien: S('ý kiến') }, ['ma', 'dong_y']) },
  { name: 'chot_nhieu_quy_tac', description: 'Chốt nhiều quy tắc thuộc phòng của người dùng trong một lần (ví dụ toàn bộ quy tắc nháp của một hợp đồng mới).',
    input_schema: obj({ hop_dong_id: S('id hợp đồng (lấy từ ds_hop_dong)'), ma: { type: 'array', items: { type: 'string' }, description: 'danh sách mã; để trống = mọi quy tắc của phòng đang chờ chốt' }, dong_y: { type: 'boolean' }, y_kien: S('ý kiến') }, ['hop_dong_id', 'dong_y']) },
  { name: 'bo_sung_skill', description: 'Thêm một dòng hướng dẫn vào skill của phòng (tạo phiên bản skill mới).', input_schema: obj({ noi_dung_them: S('dòng hướng dẫn cần thêm'), ly_do: S('lý do') }, ['noi_dung_them']) },
];

export const LA_THAO_TAC = new Set(CONG_CU_THAO_TAC.map((t) => t.name));

/** Chạy công cụ đọc, trả về chuỗi cho model. */
export async function chayCongCuDoc(ten: string, input: any): Promise<string> {
  const sb = supabaseAdmin();
  if (ten === 'ds_lan_chay') {
    const { data } = await sb.from('tt_lan_chay').select('id, thang, dot, buoc, vong, tong_hop, loi, tt_hop_dong(ma_khach)').order('created_at', { ascending: false }).limit(20);
    const { data: ch } = await sb.from('tt_chan').select('lan_chay_id').is('go_luc', null);
    const chan = new Set((ch ?? []).map((c: any) => c.lan_chay_id));
    return (data ?? []).map((r: any) => `${r.id} | ${r.tt_hop_dong?.ma_khach} ${nhanThang(r.thang, r.dot)} | ${TEN_BUOC[r.buoc] ?? r.buoc} | vòng ${r.vong} | tổng ${fmtVnd(r.tong_hop?.tong_cong)}đ${chan.has(r.id) ? ' | ĐANG CHẶN' : ''}${r.loi ? ' | LỖI' : ''}`).join('\n') || 'Chưa có lần chạy nào.';
  }
  if (ten === 'xem_lan_chay') {
    const b = await boiCanhLanChay(input.lan_chay_id);
    const chan = await dsDangChan(input.lan_chay_id);
    const { data: st } = await sb.from('tt_sua_tay').select('loai, dong, cot, gia_tri_cu, gia_tri_moi, ly_do, nguoi_email').eq('lan_chay_id', input.lan_chay_id).order('id');
    return `${b.text}\n\nID LẦN CHẶN ĐANG HIỆU LỰC: ${chan.map((c: any) => `#${c.id} (${TEN_PHONG_BAN[c.phong_ban as PhongBan]}: ${c.ly_do})`).join('; ') || 'không'}\nSỬA TAY: ${(st ?? []).map((x: any) => `${TEN_DICH_VU[x.loai as LoaiDichVu]} dòng ${x.dong} cột ${x.cot}: "${x.gia_tri_cu ?? ''}" → "${x.gia_tri_moi ?? ''}" (${x.ly_do}, ${x.nguoi_email})`).join('; ') || 'không'}`;
  }
  if (ten === 'xem_dong') {
    let ds = await docDongLanChay(input.lan_chay_id);
    if (input.loai) ds = ds.filter((d) => d.loai === input.loai);
    if (Array.isArray(input.dong) && input.dong.length) ds = ds.filter((d) => input.dong.includes(d.dong));
    if (input.tim) { const t = String(input.tim).toLowerCase(); ds = ds.filter((d) => JSON.stringify(d.v).toLowerCase().includes(t)); }
    const out = ds.slice(0, 30).map((d) => `[${TEN_DICH_VU[d.loai]} · dòng ${d.dong}] ` + Object.entries(d.v).filter(([, v]) => v !== null && v !== '').map(([k, v]) => `${k}: ${v instanceof Date ? v.toISOString().slice(0, 10) : v}`).join(' | '));
    return out.join('\n') || 'Không tìm thấy dòng nào.';
  }
  if (ten === 'ds_hop_dong') {
    const { data } = await sb.from('tt_hop_dong').select('id, ma_khach, ten_khach, so_hop_dong, trang_thai, cau_hoi_mo, tt_quy_tac(phong_ban, chot)').order('ma_khach');
    return (data ?? []).map((h: any) => {
      const dem = (['ke_toan', 'demand', 'supply', 'ceo'] as PhongBan[]).map((p) => { const ds = (h.tt_quy_tac ?? []).filter((q: any) => q.phong_ban === p); return `${TEN_PHONG_BAN[p]} ${ds.filter((q: any) => q.chot === 'dong_y').length}/${ds.length}`; }).join(', ');
      return `${h.id} | ${h.ma_khach} — ${h.ten_khach} | HĐ ${h.so_hop_dong} | ${h.trang_thai ?? 'hieu_luc'} | đã chốt: ${dem}${(h.cau_hoi_mo ?? []).length ? ` | điểm còn mở: ${(h.cau_hoi_mo as string[]).join(' / ')}` : ''}`;
    }).join('\n') || 'Chưa có hợp đồng.';
  }
  if (ten === 'xem_hop_dong') {
    const [{ data: h }, { data: qt }, { data: bo }] = await Promise.all([
      sb.from('tt_hop_dong').select('*').eq('id', input.hop_dong_id).single(),
      sb.from('tt_quy_tac').select('ma, phong_ban, noi_dung, gia_tri, can_cu, muc_do, chot').eq('hop_dong_id', input.hop_dong_id).order('ma'),
      sb.from('tt_bo_quy_tac').select('phien_ban, hieu_luc_tu, tham_so').eq('hop_dong_id', input.hop_dong_id).order('phien_ban', { ascending: false }).limit(1),
    ]);
    if (!h) return 'Không tìm thấy hợp đồng.';
    return `${h.ma_khach} — ${h.ten_khach} | HĐ ${h.so_hop_dong} | trạng thái ${h.trang_thai ?? 'hieu_luc'}\nTÓM TẮT:\n${h.tom_tat_dieu_khoan ?? '(chưa có)'}\n\nĐIỂM CÒN MỞ: ${((h.cau_hoi_mo ?? []) as string[]).join(' / ') || 'không'}\n\nTHAM SỐ v${bo?.[0]?.phien_ban ?? '?'}: ${JSON.stringify(bo?.[0]?.tham_so ?? {})}\n\nQUY TẮC:\n${(qt ?? []).map((q: any) => `${q.ma} [${TEN_PHONG_BAN[q.phong_ban as PhongBan]}] ${q.noi_dung} | ${q.gia_tri ?? ''} | ${q.can_cu ?? ''} | ${q.muc_do} | chốt: ${q.chot}`).join('\n')}`;
  }
  if (ten === 'ds_sua_doi') {
    const { data } = await sb.from('tt_sua_doi').select('id, so, ma_quy_tac, noi_dung_moi, trang_thai, hieu_luc_tu, tt_sua_doi_duyet(phong_ban, quyet_dinh)').order('so');
    return (data ?? []).map((x: any) => `${x.id} | SĐ-${x.so} ${x.ma_quy_tac}: ${x.noi_dung_moi} | từ ${x.hieu_luc_tu} | ${x.trang_thai} | đã ý kiến: ${(x.tt_sua_doi_duyet ?? []).map((d: any) => `${TEN_PHONG_BAN[d.phong_ban as PhongBan]} ${d.quyet_dinh === 'dong_y' ? 'đồng ý' : 'không'}`).join(', ') || 'chưa'}`).join('\n') || 'Không có đề xuất nào.';
  }
  return `Không có công cụ ${ten}.`;
}

/** Phòng ban cần có quyền cho thao tác (để báo lỗi sớm nếu người dùng không có quyền). */
export function phongBanCan(ten: string, input: any, macDinh: PhongBan): PhongBan {
  if (['sua_o_bang_ke', 'ghi_giai_trinh', 'xac_nhan_o_tu_sua'].includes(ten)) return 'ke_toan';
  if (ten === 'duyet_buoc') return input.buoc;
  if (ten === 'tra_ve_ke_toan' || ten === 'chan_bang_ke') return input.phong_ban;
  return macDinh;
}

/** Mô tả dễ đọc cho thẻ xác nhận. */
export function moTa(ten: string, i: any): string {
  switch (ten) {
    case 'sua_o_bang_ke': return `Sửa ${i.thay_doi?.length ?? 0} ô bảng kê (${(i.thay_doi ?? []).slice(0, 4).map((t: any) => `${TEN_DICH_VU[t.loai as LoaiDichVu]} dòng ${t.dong}, ${t.cot} → "${t.gia_tri_moi}"`).join('; ')}${(i.thay_doi?.length ?? 0) > 4 ? '…' : ''}). Lý do: ${i.ly_do}. App xử lý lại, duyệt của vòng hiện tại mất hiệu lực.`;
    case 'ghi_giai_trinh': return `Ghi giải trình cho cảnh báo #${i.canh_bao_id}: "${i.noi_dung}"`;
    case 'xac_nhan_o_tu_sua': return 'Xác nhận toàn bộ ô app tự sửa theo quy tắc là đúng.';
    case 'duyet_buoc': return i.buoc === 'ceo' ? `CEO DUYỆT VÀ GỬI bảng kê cho khách ngay${i.y_kien ? ` — ý kiến: ${i.y_kien}` : ''}.` : `Kế toán duyệt, chuyển CEO${i.y_kien ? ` — ý kiến: ${i.y_kien}` : ''}.`;
    case 'tra_ve_ke_toan': return `${TEN_PHONG_BAN[i.phong_ban as PhongBan]} trả về kế toán. Lý do: ${i.ly_do}`;
    case 'chan_bang_ke': return `${TEN_PHONG_BAN[i.phong_ban as PhongBan]} CHẶN bảng kê. Lý do: ${i.ly_do}`;
    case 'go_chan': return `Gỡ chặn #${i.chan_id}${i.ghi_chu ? ` — ${i.ghi_chu}` : ''}.`;
    case 'de_xuat_sua_doi': return `Đề xuất sửa ${i.ma_quy_tac}: ${i.noi_dung_moi}${i.gia_tri_moi ? ` — ${i.gia_tri_moi}` : ''}; hiệu lực từ ${i.hieu_luc_tu}; lý do: ${i.ly_do}${i.loai_tham_so ? `; tham số: ${i.loai_tham_so}` : ''}.`;
    case 'duyet_sua_doi': return `${i.dong_y ? 'Đồng ý' : 'Không đồng ý'} đề xuất sửa đổi${i.y_kien ? ` — ${i.y_kien}` : ''}.`;
    case 'chot_quy_tac': return `${i.dong_y ? 'Đồng ý' : 'Đánh dấu cần sửa'} quy tắc ${i.ma}${i.y_kien ? ` — ${i.y_kien}` : ''}.`;
    case 'chot_nhieu_quy_tac': return `${i.dong_y ? 'Đồng ý' : 'Đánh dấu cần sửa'} ${i.ma?.length ? `${i.ma.length} quy tắc (${i.ma.slice(0, 6).join(', ')}${i.ma.length > 6 ? '…' : ''})` : 'mọi quy tắc đang chờ chốt của phòng'} trong hợp đồng ${i.hop_dong_id}${i.y_kien ? ` — ${i.y_kien}` : ''}.`;
    case 'bo_sung_skill': return `Thêm vào skill: "${i.noi_dung_them}"${i.ly_do ? ` (lý do: ${i.ly_do})` : ''}.`;
    default: return ten;
  }
}

export const coQuyen = (n: NguoiTT, pb: PhongBan) => duocLam(n, pb);
