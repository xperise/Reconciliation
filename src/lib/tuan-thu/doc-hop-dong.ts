import { supabaseAdmin } from '@/lib/supabase/admin';
import { BUCKET_TT } from './db';
import { docJson, MODEL, skillHienHanh } from './agent';
import { PhongBan, TEN_PHONG_BAN, ThamSoHopDong } from './types';

/**
 * Agent đọc hợp đồng mới upload (PDF hợp đồng + phụ lục):
 *  1) một lượt đọc chung: tóm tắt điều khoản, tham số máy, các điểm còn mở;
 *  2) agent của từng phòng (theo skill riêng) rút quy tắc thuộc scope của mình.
 * Kết quả là BẢN NHÁP: hợp đồng ở trạng thái chờ chốt, mọi quy tắc "chờ chốt", chưa chạy bảng kê được.
 */

const PBS: PhongBan[] = ['ke_toan', 'demand', 'supply', 'ceo'];
const TIEN_TO: Record<PhongBan, string> = { ke_toan: 'KT', demand: 'DM', supply: 'SP', ceo: 'CEO' };

async function goiTaiLieu(system: string, docs: any[], yeuCau: string, maxTokens: number): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Chưa cấu hình ANTHROPIC_API_KEY trên Vercel.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: [...docs, { type: 'text', text: yeuCau }] }] }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude API lỗi ${res.status}: ${data?.error?.message ?? 'không rõ'}`);
  return (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
}

const MAC_DINH: Partial<ThamSoHopDong> = {
  ty_le_chiet_khau: { khach_san: 0, ve_may_bay: 0 }, phi_dich_vu: { khach_san: 0, ve_may_bay: 0 }, ky: { kieu: 'thang' },
  dinh_muc_phong: [], dia_ban_nhom_1_2: [],
  ten_trang_thai: { 'khach_san:completed': 'Có lưu trú', 'khach_san:canceled': 'Đã hủy', 'khach_san:pending checkin': 'Chờ nhận phòng',
    've_may_bay:completed': 'Đã sử dụng', 've_may_bay:cancelled': 'Đã hủy' },
};

export async function docHopDong(hopDongId: string) {
  const sb = supabaseAdmin();
  const { data: hd } = await sb.from('tt_hop_dong').select('*').eq('id', hopDongId).single();
  if (!hd) throw new Error('Không tìm thấy hợp đồng.');
  if (hd.trang_thai === 'hieu_luc') throw new Error('Hợp đồng đã kích hoạt; muốn đổi quy tắc hãy dùng luồng sửa đổi.');
  await sb.from('tt_hop_dong').update({ trang_thai: 'dang_doc', loi_doc: null }).eq('id', hopDongId);
  try {
    const teps = (hd.tep_hop_dong ?? []) as { path: string; ten: string }[];
    if (!teps.length) throw new Error('Chưa có file hợp đồng.');
    const docs: any[] = [];
    for (const t of teps) {
      const { data } = await sb.storage.from(BUCKET_TT).download(t.path);
      if (!data) throw new Error(`Không tải được ${t.ten}.`);
      docs.push({ type: 'document', title: t.ten, source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(await data.arrayBuffer()).toString('base64') } });
    }

    // Cấu trúc quy tắc mẫu (từ hợp đồng đã kích hoạt gần nhất) để mã quy tắc thống nhất giữa các khách
    const { data: mau } = await sb.from('tt_hop_dong').select('id').eq('trang_thai', 'hieu_luc').order('created_at').limit(1);
    const { data: qtMau } = mau?.length ? await sb.from('tt_quy_tac').select('ma, phong_ban, nhom, noi_dung, cach_kiem, muc_do').eq('hop_dong_id', mau[0].id).order('ma') : { data: [] as any[] };

    const sysChung = `Bạn là agent pháp chế - vận hành của Xperise (Công ty Cổ phần Universal Travel Solutions Network). Đọc hợp đồng khách hàng để hệ thống kiểm bảng kê gửi khách tuân thủ đúng hợp đồng. Chỉ dựa trên văn bản; không suy đoán. Trả lời tiếng Việt.`;
    const yeuCauChung = `Đọc toàn bộ hợp đồng và phụ lục đính kèm. Trả về DUY NHẤT một JSON:
{
 "so_hop_dong": "...", "ngay_ky": "YYYY-MM-DD hoặc null",
 "tom_tat_dieu_khoan": "tóm tắt đầy đủ theo từng điều và phụ lục (các bên, MST, địa chỉ, tài khoản nhận tiền; phạm vi dịch vụ; giá, phí, chiết khấu; hạn mức; kỳ và hạn gửi bảng kê, hồ sơ thanh toán; thời hạn phản hồi và thanh toán; tạm ứng; định mức/chính sách chi của khách nếu có — ghi đủ con số; phạt, chấm dứt, khiếu nại; SLA; điều khoản sửa đổi). Viết như văn bản tham chiếu, giữ nguyên con số.",
 "tham_so": {
   "ty_le_chiet_khau": {"khach_san": số thập phân (0.05 = 5%), "ve_may_bay": số} — 0 nếu hợp đồng không quy định mức chiết khấu,
   "phi_dich_vu": {"khach_san": đồng/dòng chưa VAT, "ve_may_bay": ...} — 0 nếu không quy định,
   "ky": {"kieu": "thang"} hoặc {"kieu": "hai_dot", "ngay_cat": số},
   "tai_khoan": {"so": "...", "ngan_hang": "..."},
   "ben_ban": {"ten": "...", "mst": "...", "dia_chi": "...", "dien_thoai": "..."},
   "ben_mua": {"ten": "...", "mst": "...", "dia_chi": "...", "dien_thoai": "..."},
   "han_muc_thang": số đồng hoặc null,
   "dinh_muc_phong": [{"nhom": "tên nhóm đối tượng", "tu_khoa": ["từ khóa chức danh viết thường"], "muc": [mức nhóm địa bàn cao, mức nhóm địa bàn thấp] hoặc null nếu phòng Suite/không giới hạn}] — [] nếu không có; nhóm "Các đối tượng khác" để tu_khoa [] và đặt CUỐI,
   "dia_ban_nhom_1_2": ["địa danh không dấu viết thường thuộc nhóm địa bàn mức cao"] — [] nếu không có
 },
 "cau_hoi_mo": ["điểm chưa rõ hoặc mâu thuẫn trong hợp đồng mà head cần quyết, kèm điều khoản"]
}`;
    const tasks: Promise<any>[] = [goiTaiLieu(sysChung, docs, yeuCauChung, 8000).then((t) => docJson<any>(t))];
    for (const pb of PBS) {
      tasks.push((async () => {
        const sk = await skillHienHanh(pb);
        const mauPb = (qtMau ?? []).filter((q: any) => q.phong_ban === pb).map((q: any) => `${q.ma} [${q.nhom}] ${q.noi_dung} (${q.cach_kiem}, ${q.muc_do})`).join('\n');
        const t = await goiTaiLieu(`${sk.noi_dung}\n\nBạn đang đọc hợp đồng của một khách mới để lập bộ quy tắc kiểm bảng kê trong scope ${TEN_PHONG_BAN[pb]}. Chỉ dựa trên văn bản hợp đồng; điều hợp đồng không quy định thì ghi rõ "Hợp đồng không quy định" và nêu cách hiểu an toàn. Trả lời tiếng Việt.`, docs,
          `Rút các quy tắc thuộc scope ${TEN_PHONG_BAN[pb]} để kiểm bảng kê và hồ sơ thanh toán của khách này.
Bộ quy tắc mẫu của phòng (dùng lại đúng MÃ nếu cùng loại kiểm tra; loại mới thì đánh mã ${TIEN_TO[pb]}-xx tiếp theo):
${mauPb || '(chưa có mẫu)'}
Trả về DUY NHẤT JSON: {"quy_tac":[{"ma":"${TIEN_TO[pb]}-01","nhom":"...","noi_dung":"quy tắc","gia_tri":"giá trị/ngưỡng cụ thể","can_cu":"Điều/Phụ lục","cach_kiem":"tu_dong|head_xem|gd2","muc_do":"chan_gui|giai_trinh|theo_doi","du_lieu":"dữ liệu cần để kiểm"}]}`, 6000);
        return { pb, ds: docJson<any>(t).quy_tac ?? [] };
      })());
    }
    const [chung, ...theoPb] = await Promise.all(tasks);

    // Ghi bản nháp (xóa bản nháp cũ nếu đọc lại)
    await sb.from('tt_quy_tac').delete().eq('hop_dong_id', hopDongId);
    await sb.from('tt_bo_quy_tac').delete().eq('hop_dong_id', hopDongId);
    const daCo = new Set<string>();
    const rows = (theoPb as { pb: PhongBan; ds: any[] }[]).flatMap(({ pb, ds }) => ds.filter((q) => q?.ma && q?.noi_dung).map((q) => {
      let ma = String(q.ma).trim().toUpperCase(); while (daCo.has(ma)) ma = `${ma}B`; daCo.add(ma);
      return { hop_dong_id: hopDongId, ma, phong_ban: pb, nhom: q.nhom ?? null, noi_dung: String(q.noi_dung), gia_tri: q.gia_tri ?? null,
        can_cu: q.can_cu ?? null, cach_kiem: ['tu_dong', 'head_xem', 'gd2'].includes(q.cach_kiem) ? q.cach_kiem : 'head_xem',
        muc_do: ['chan_gui', 'giai_trinh', 'theo_doi'].includes(q.muc_do) ? q.muc_do : 'giai_trinh', du_lieu: q.du_lieu ?? null, chot: 'cho' };
    }));
    if (rows.length) { const r = await sb.from('tt_quy_tac').insert(rows); if (r.error) throw new Error(r.error.message); }
    const ts = { ...MAC_DINH, ...(chung.tham_so ?? {}), ma_khach: hd.ma_khach, so_hop_dong: hd.so_hop_dong };
    if (!Array.isArray(ts.dinh_muc_phong)) ts.dinh_muc_phong = [];
    if (!Array.isArray(ts.dia_ban_nhom_1_2)) ts.dia_ban_nhom_1_2 = [];
    const hieuLuc = hd.hieu_luc_tu ?? new Date().toISOString().slice(0, 7);
    const r2 = await sb.from('tt_bo_quy_tac').insert({ hop_dong_id: hopDongId, phien_ban: 1, tham_so: ts, hieu_luc_tu: hieuLuc, ghi_chu: `Agent đọc hợp đồng ${hd.so_hop_dong} (${MODEL()}) — bản nháp chờ 4 head chốt` });
    if (r2.error) throw new Error(r2.error.message);
    await sb.from('tt_hop_dong').update({ trang_thai: 'cho_chot', tom_tat_dieu_khoan: chung.tom_tat_dieu_khoan ?? null,
      cau_hoi_mo: chung.cau_hoi_mo ?? [], ...(chung.ngay_ky && !hd.ngay_ky ? { ngay_ky: chung.ngay_ky } : {}) }).eq('id', hopDongId);
    return { so_quy_tac: rows.length, cau_hoi_mo: (chung.cau_hoi_mo ?? []).length };
  } catch (e) {
    await sb.from('tt_hop_dong').update({ trang_thai: 'loi', loi_doc: e instanceof Error ? e.message : String(e) }).eq('id', hopDongId);
    throw e;
  }
}
