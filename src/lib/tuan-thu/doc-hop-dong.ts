import { supabaseAdmin } from '@/lib/supabase/admin';
import { BUCKET_TT } from './db';
import { MODEL, skillHienHanh } from './agent';
import { goiMoHinh } from './ai-provider';
import { PhongBan, TEN_PHONG_BAN, ThamSoHopDong } from './types';
import { docCauHinhQuyTrinh } from './cau-hinh-db';
import { themOrg } from './to-chuc';

/**
 * Agent đọc hợp đồng mới upload (PDF hợp đồng + phụ lục):
 *  1) một lượt đọc chung: tóm tắt điều khoản, tham số máy, các điểm còn mở;
 *  2) agent của từng phòng (theo skill riêng) rút quy tắc thuộc scope của mình.
 * Kết quả là BẢN NHÁP: hợp đồng ở trạng thái chờ chốt, mọi quy tắc "chờ chốt", chưa chạy bảng kê được.
 */

/** Tiền tố mã quy tắc của các role mặc định. Role khác dùng 2 ký tự đầu của mã role. */
const TIEN_TO_MAC_DINH: Record<string, string> = { ke_toan: 'KT', demand: 'DM', supply: 'SP', ceo: 'CEO' };
const tienTo = (pb: PhongBan) => TIEN_TO_MAC_DINH[pb] ?? pb.slice(0, 2).toUpperCase();

async function goiAPI(body: any): Promise<any> {
  const { model: _m, ...req } = body;
  return goiMoHinh(req);
}

class QuaDai extends Error {}
async function thuLai<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) {
    if (e instanceof QuaDai) throw e;   // quá dài: thử lại y hệt cũng vậy → để bên gọi rút gọn yêu cầu
    await new Promise((r) => setTimeout(r, 2000));
    return fn();
  }
}

/** Đọc tài liệu, trả lời dạng chữ (dùng cho tóm tắt điều khoản — không ép JSON nên không vỡ định dạng). */
async function goiChu(system: string, docs: any[], yeuCau: string, maxTokens: number): Promise<string> {
  const d = await thuLai(() => goiAPI({ max_tokens: maxTokens, system, messages: [{ role: 'user', content: [...docs, { type: 'text', text: yeuCau }] }] }));
  const t = (d.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  return d.stop_reason === 'max_tokens' ? `${t}\n…(tóm tắt bị cắt do quá dài — xem bản PDF gốc cho phần còn lại)` : t;
}

/**
 * Đọc tài liệu, trả kết quả có cấu trúc qua "công cụ" (tool use bắt buộc): API trả về object đã parse sẵn,
 * không phải tự đọc JSON trong chữ — tránh lỗi JSON hỏng hoặc bị cắt dở.
 */
async function goiCauTruc(system: string, docs: any[], yeuCau: string, tool: { name: string; description: string; input_schema: any }, maxTokens: number): Promise<any> {
  const goi = async (epBuoc: boolean) => {
    const d = await goiAPI({ max_tokens: maxTokens, system, tools: [tool], ...(epBuoc ? { tool_choice: { type: 'tool', name: tool.name } } : {}),
      messages: [{ role: 'user', content: [...docs, { type: 'text', text: `${yeuCau}\n\nBẮT BUỘC: trả kết quả bằng cách gọi công cụ ${tool.name} đúng một lần; không viết câu trả lời dạng chữ.` }] }] });
    if (d.stop_reason === 'max_tokens') throw new QuaDai(`Agent trả kết quả quá dài (${tool.name}).`);
    const u = (d.content ?? []).find((b: any) => b.type === 'tool_use' && b.name === tool.name);
    if (u?.input) return u.input;
    // Model không gọi công cụ: thử đọc JSON trong chữ (phương án cuối)
    const t = (d.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    const a = t.indexOf('{'), z = t.lastIndexOf('}');
    if (a >= 0 && z > a) { try { return JSON.parse(t.slice(a, z + 1)); } catch { /* bỏ qua */ } }
    throw new Error(`Agent không trả kết quả có cấu trúc (${tool.name}).`);
  };
  return thuLai(async () => {
    try { return await goi(true); }
    catch (e) {
      // Một số model không hỗ trợ ép gọi công cụ (tool_choice) → gọi lại ở chế độ tự chọn, kèm yêu cầu bắt buộc trong lời nhắn
      if (e instanceof Error && /tool_choice/i.test(e.message)) return goi(false);
      throw e;
    }
  });
}

const CONG_CU_THAM_SO = {
  name: 'ghi_tham_so_hop_dong',
  description: 'Ghi các tham số máy đọc được từ hợp đồng và các điểm còn mở.',
  input_schema: {
    type: 'object',
    properties: {
      so_hop_dong: { type: 'string' }, ngay_ky: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
      tham_so: {
        type: 'object',
        properties: {
          ty_le_chiet_khau: { type: 'object', properties: { khach_san: { type: 'number' }, ve_may_bay: { type: 'number' } }, description: 'số thập phân, 0.05 = 5%; 0 nếu hợp đồng không quy định' },
          phi_dich_vu: { type: 'object', properties: { khach_san: { type: 'number' }, ve_may_bay: { type: 'number' } }, description: 'đồng/dòng chưa VAT; 0 nếu không quy định' },
          ky: { type: 'object', properties: { kieu: { type: 'string', enum: ['thang', 'hai_dot'] }, ngay_cat: { type: 'integer' } } },
          tai_khoan: { type: 'object', properties: { so: { type: 'string' }, ngan_hang: { type: 'string' } } },
          ben_ban: { type: 'object', properties: { ten: { type: 'string' }, mst: { type: 'string' }, dia_chi: { type: 'string' }, dien_thoai: { type: 'string' } } },
          ben_mua: { type: 'object', properties: { ten: { type: 'string' }, mst: { type: 'string' }, dia_chi: { type: 'string' }, dien_thoai: { type: 'string' } } },
          han_muc_thang: { type: ['number', 'null'] },
          dinh_muc_phong: { type: 'array', items: { type: 'object', properties: {
            nhom: { type: 'string' }, tu_khoa: { type: 'array', items: { type: 'string' } },
            muc: { type: ['array', 'null'], items: { type: 'number' }, description: '[mức nhóm địa bàn cao, mức nhóm địa bàn thấp] đồng/đêm đã gồm thuế; null = Suite / không giới hạn' } } },
            description: '[] nếu không có; nhóm "Các đối tượng khác" để tu_khoa [] và đặt cuối' },
          dia_ban_nhom_1_2: { type: 'array', items: { type: 'string' }, description: 'địa danh không dấu viết thường thuộc nhóm địa bàn mức cao; [] nếu không có' },
        },
      },
      cau_hoi_mo: { type: 'array', items: { type: 'string' }, description: 'điểm chưa rõ / mâu thuẫn mà head cần quyết, kèm điều khoản' },
    },
    required: ['tham_so', 'cau_hoi_mo'],
  },
};

const CONG_CU_QUY_TAC = {
  name: 'ghi_quy_tac',
  description: 'Ghi các quy tắc kiểm bảng kê thuộc scope của phòng.',
  input_schema: {
    type: 'object',
    properties: {
      quy_tac: { type: 'array', items: { type: 'object', properties: {
        ma: { type: 'string' }, nhom: { type: 'string' }, noi_dung: { type: 'string' }, gia_tri: { type: 'string' }, can_cu: { type: 'string' },
        cach_kiem: { type: 'string', enum: ['tu_dong', 'head_xem', 'gd2'] }, muc_do: { type: 'string', enum: ['chan_gui', 'giai_trinh', 'theo_doi'] }, du_lieu: { type: 'string' },
      }, required: ['ma', 'noi_dung'] } },
    },
    required: ['quy_tac'],
  },
};

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
    const { data: mau } = await sb.from('tt_hop_dong').select('id').eq('org_id', hd.org_id).eq('trang_thai', 'hieu_luc').order('created_at').limit(1);
    const { data: qtMau } = mau?.length ? await sb.from('tt_quy_tac').select('ma, phong_ban, nhom, noi_dung, cach_kiem, muc_do').eq('hop_dong_id', mau[0].id).order('ma') : { data: [] as any[] };

    const sysChung = `Bạn là agent pháp chế - vận hành của Xperise (Công ty Cổ phần Universal Travel Solutions Network). Đọc hợp đồng khách hàng để hệ thống kiểm bảng kê gửi khách tuân thủ đúng hợp đồng. Chỉ dựa trên văn bản; không suy đoán. Trả lời tiếng Việt.`;
    const yeuCauTomTat = `Đọc toàn bộ hợp đồng và phụ lục đính kèm. Viết TÓM TẮT ĐIỀU KHOẢN đầy đủ theo từng điều và phụ lục để làm văn bản tham chiếu: các bên (tên, MST, địa chỉ, tài khoản nhận tiền); phạm vi dịch vụ; giá, phí, chiết khấu; hạn mức; kỳ và hạn gửi bảng kê, hồ sơ thanh toán; thời hạn phản hồi và thanh toán; tạm ứng; định mức / chính sách chi của khách nếu có (ghi đủ con số); phạt, chấm dứt, khiếu nại; SLA; điều khoản sửa đổi. Giữ nguyên con số, ghi rõ số điều. Chỉ trả về văn bản tóm tắt.`;
    const yeuCauThamSo = `Đọc hợp đồng và phụ lục đính kèm, rồi gọi công cụ ghi_tham_so_hop_dong với các tham số máy để kiểm bảng kê và các điểm còn mở. Điều hợp đồng không quy định: chiết khấu/phí = 0, hạn mức = null, định mức = [], và nêu trong cau_hoi_mo nếu cần head quyết.`;
    const tasks: Promise<any>[] = [
      goiChu(sysChung, docs, yeuCauTomTat, 12000),
      goiCauTruc(sysChung, docs, yeuCauThamSo, CONG_CU_THAM_SO, 8000),
    ];
    const cauHinh = await docCauHinhQuyTrinh();
    const PBS: PhongBan[] = cauHinh.roles.map((r) => r.key);
    for (const pb of PBS) {
      tasks.push((async () => {
        const sk = await skillHienHanh(pb, hd.org_id);
        const mauPb = (qtMau ?? []).filter((q: any) => q.phong_ban === pb).map((q: any) => `${q.ma} [${q.nhom}] ${q.noi_dung} (${q.cach_kiem}, ${q.muc_do})`).join('\n');
        const sys = `${sk.noi_dung}\n\nBạn đang đọc hợp đồng của một khách mới để lập bộ quy tắc kiểm bảng kê trong scope ${(cauHinh.roles.find((r) => r.key === pb)?.ten ?? pb)}. Chỉ dựa trên văn bản hợp đồng; điều hợp đồng không quy định thì ghi rõ "Hợp đồng không quy định" và nêu cách hiểu an toàn. Trả lời tiếng Việt.`;
        const yeuCau = (gioiHan: string) => `Rút các quy tắc thuộc scope ${(cauHinh.roles.find((r) => r.key === pb)?.ten ?? pb)} để kiểm bảng kê và hồ sơ thanh toán của khách này, rồi gọi công cụ ghi_quy_tac.
Bộ quy tắc mẫu của phòng (dùng lại đúng MÃ nếu cùng loại kiểm tra; loại mới thì đánh mã ${tienTo(pb)}-xx tiếp theo):
${mauPb || '(chưa có mẫu)'}
Mỗi quy tắc: nội dung, giá trị/ngưỡng cụ thể, căn cứ (Điều/Phụ lục), cách kiểm (tu_dong | head_xem | gd2), mức độ (chan_gui | giai_trinh | theo_doi).
VIẾT GỌN: ${gioiHan}`;
        let out: any;
        try {
          out = await goiCauTruc(sys, docs, yeuCau('tối đa 25 quy tắc quan trọng nhất cho việc kiểm bảng kê; nội dung ≤ 35 từ, giá trị ≤ 20 từ, căn cứ chỉ ghi số Điều/Phụ lục, bỏ trống du_lieu nếu không cần; gộp các điều khoản cùng loại vào một quy tắc.'), CONG_CU_QUY_TAC, 16000);
        } catch (e) {
          if (!(e instanceof QuaDai)) throw e;
          // Vẫn quá dài → rút gọn mạnh hơn: chỉ giữ quy tắc quan trọng nhất, mỗi trường thật ngắn
          out = await goiCauTruc(sys, docs, yeuCau('tối đa 12 quy tắc quan trọng nhất; mỗi trường 1 câu ngắn (≤ 15 từ); căn cứ chỉ ghi số Điều; không ghi du_lieu. Điều khoản chưa đưa vào thì head bổ sung sau.'), CONG_CU_QUY_TAC, 16000);
        }
        return { pb, ds: out.quy_tac ?? [] };
      })());
    }
    const [tomTat, thamSoKq, ...theoPb] = await Promise.all(tasks);
    const chung = { ...(thamSoKq ?? {}), tom_tat_dieu_khoan: tomTat };

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
    if (rows.length) { const r = await sb.from('tt_quy_tac').insert(themOrg(rows, hd.org_id)); if (r.error) throw new Error(r.error.message); }
    const ts = { ...MAC_DINH, ...(chung.tham_so ?? {}), ma_khach: hd.ma_khach, so_hop_dong: hd.so_hop_dong };
    if (!Array.isArray(ts.dinh_muc_phong)) ts.dinh_muc_phong = [];
    if (!Array.isArray(ts.dia_ban_nhom_1_2)) ts.dia_ban_nhom_1_2 = [];
    const hieuLuc = hd.hieu_luc_tu ?? new Date().toISOString().slice(0, 7);
    const r2 = await sb.from('tt_bo_quy_tac').insert(themOrg({ hop_dong_id: hopDongId, phien_ban: 1, tham_so: ts, hieu_luc_tu: hieuLuc, ghi_chu: `Agent đọc hợp đồng ${hd.so_hop_dong} (${MODEL()}) — bản nháp chờ 4 head chốt` }, hd.org_id));
    if (r2.error) throw new Error(r2.error.message);
    await sb.from('tt_hop_dong').update({ trang_thai: 'cho_chot', tom_tat_dieu_khoan: chung.tom_tat_dieu_khoan ?? null,
      cau_hoi_mo: chung.cau_hoi_mo ?? [], ...(chung.ngay_ky && !hd.ngay_ky ? { ngay_ky: chung.ngay_ky } : {}) }).eq('id', hopDongId);
    return { so_quy_tac: rows.length, cau_hoi_mo: (chung.cau_hoi_mo ?? []).length };
  } catch (e) {
    await sb.from('tt_hop_dong').update({ trang_thai: 'loi', loi_doc: e instanceof Error ? e.message : String(e) }).eq('id', hopDongId);
    throw e;
  }
}
