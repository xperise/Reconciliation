import { supabaseAdmin } from '@/lib/supabase/admin';
import { dsDangChan, fmtVnd } from './db';
import { PhongBan, TEN_DICH_VU, TEN_MUC_DO, TEN_PHONG_BAN, LoaiDichVu } from './types';

/**
 * Agent AI của từng phòng ban: gọi Claude API, đọc skill (có phiên bản) + quy tắc hợp đồng trong scope
 * + dữ liệu lần chạy. Agent chỉ đề xuất; mọi quyết định do head bấm.
 */
export const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

type Msg = { role: 'user' | 'assistant'; content: string };

export async function goiClaude(system: string, messages: Msg[], maxTokens = 1500): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Chưa cấu hình ANTHROPIC_API_KEY trên Vercel — agent AI chưa chạy được. Luồng duyệt theo luật vẫn hoạt động.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system, messages }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude API lỗi ${res.status}: ${data?.error?.message ?? 'không rõ'}`);
  return (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
}

export async function skillHienHanh(pb: PhongBan): Promise<{ phien_ban: number; noi_dung: string }> {
  const { data } = await supabaseAdmin().from('tt_skill').select('phien_ban, noi_dung')
    .eq('phong_ban', pb).order('phien_ban', { ascending: false }).limit(1);
  if (!data?.length) throw new Error('Chưa có skill cho phòng ban này — chạy supabase/migrations/39_tuan_thu_agent.sql.');
  return data[0] as any;
}

/** Tóm tắt bộ tham số máy đang áp dụng để agent đọc. */
function thamSoChu(t: any): string {
  if (!t) return '(chưa có)';
  const pct = (x: number) => `${((x ?? 0) * 100).toLocaleString('vi-VN')}%`;
  const dm = (t.dinh_muc_phong ?? []).map((g: any) => `  - ${g.nhom}: ${g.muc ? `nhóm I–II ${fmtVnd(g.muc[0])}đ, nhóm III ${fmtVnd(g.muc[1])}đ /ngày/phòng` : 'phòng Suite'}`).join('\n');
  return [
    `- Kỳ bảng kê: ${t.ky?.kieu === 'hai_dot' ? `2 đợt (1–${t.ky.ngay_cat}, ${t.ky.ngay_cat + 1}–cuối tháng)` : '1 kỳ/tháng'}`,
    `- Chiết khấu: khách sạn ${pct(t.ty_le_chiet_khau?.khach_san)}, vé ${pct(t.ty_le_chiet_khau?.ve_may_bay)}`,
    `- Phí dịch vụ: khách sạn ${fmtVnd(t.phi_dich_vu?.khach_san)}đ, vé ${fmtVnd(t.phi_dich_vu?.ve_may_bay)}đ`,
    `- Tài khoản nhận tiền: ${t.tai_khoan?.so} — ${t.tai_khoan?.ngan_hang}`,
    `- Hạn mức mua sắm/tháng: ${fmtVnd(t.han_muc_thang)}đ`,
    `- Định mức tiền phòng app đang dùng để kiểm (đã gồm thuế):\n${dm}`,
  ].join('\n');
}

/**
 * System prompt. Agent của mọi phòng ban đều nắm TOÀN BỘ hợp đồng, toàn bộ bộ quy tắc (cả 4 phòng),
 * tham số đang áp dụng và các sửa đổi — để head hỏi gì cũng trả lời được. Chuyên môn, góc nhìn
 * và cách đề xuất theo skill riêng của phòng.
 */
export async function heThong(pb: PhongBan, hopDongId: string | null) {
  const sb = supabaseAdmin();
  const sk = await skillHienHanh(pb);
  let hopDong = '', quyTac = '', thamSo = '', suaDoi = '';
  if (hopDongId) {
    const [{ data: hd }, { data: qt }, { data: bo }, { data: sd }] = await Promise.all([
      sb.from('tt_hop_dong').select('*').eq('id', hopDongId).single(),
      sb.from('tt_quy_tac').select('ma, phong_ban, noi_dung, gia_tri, can_cu, muc_do, chot').eq('hop_dong_id', hopDongId).order('ma'),
      sb.from('tt_bo_quy_tac').select('phien_ban, hieu_luc_tu, tham_so, ghi_chu').eq('hop_dong_id', hopDongId).order('phien_ban', { ascending: false }),
      sb.from('tt_sua_doi').select('so, ma_quy_tac, noi_dung_moi, gia_tri_moi, hieu_luc_tu, trang_thai, can_cu').eq('hop_dong_id', hopDongId).order('so'),
    ]);
    hopDong = (hd as any)?.tom_tat_dieu_khoan ?? `${(hd as any)?.ten_khach ?? ''} — HĐ ${(hd as any)?.so_hop_dong ?? ''} (chưa có bản tóm tắt điều khoản; chạy SQL 41)`;
    const PBS: PhongBan[] = ['ke_toan', 'demand', 'supply', 'ceo'];
    quyTac = PBS.map((p) => {
      const ds = (qt ?? []).filter((q: any) => q.phong_ban === p);
      return `[${TEN_PHONG_BAN[p]}${p === pb ? ' — scope của bạn' : ''}]\n` + ds.map((q: any) =>
        `${q.ma}: ${q.noi_dung} | giá trị: ${q.gia_tri ?? ''} | căn cứ: ${q.can_cu ?? ''} | ${TEN_MUC_DO[q.muc_do as keyof typeof TEN_MUC_DO] ?? q.muc_do}${q.chot !== 'dong_y' ? ' | head chưa chốt' : ''}`).join('\n');
    }).join('\n\n');
    const hh = (bo ?? [])[0] as any;
    thamSo = hh ? `Phiên bản v${hh.phien_ban} (hiệu lực từ ${hh.hieu_luc_tu}):\n${thamSoChu(hh.tham_so)}\nCác phiên bản: ${(bo ?? []).map((b: any) => `v${b.phien_ban} từ ${b.hieu_luc_tu}: ${b.ghi_chu ?? ''}`).join('; ')}` : '(chưa có)';
    suaDoi = (sd ?? []).map((x: any) => `SĐ-${String(x.so).padStart(2, '0')} ${x.ma_quy_tac}: ${x.noi_dung_moi}${x.gia_tri_moi ? ` — ${x.gia_tri_moi}` : ''} | hiệu lực từ ${x.hieu_luc_tu} | ${x.trang_thai === 'hieu_luc' ? 'ĐÃ CÓ HIỆU LỰC' : x.trang_thai === 'tu_choi' ? 'bị từ chối' : 'đang chờ 4 head duyệt'} | căn cứ: ${x.can_cu ?? 'chưa có'}`).join('\n') || 'không có';
  }
  const system = `${sk.noi_dung}

PHẠM VI KIẾN THỨC: Bạn nắm TOÀN BỘ hợp đồng, toàn bộ bộ quy tắc của cả 4 phòng ban, tham số app đang áp dụng và các sửa đổi dưới đây. Head hỏi bất kỳ điều khoản hay quy tắc nào cũng phải trả lời đầy đủ, trích điều khoản (Đ…, PL…) và mã quy tắc. Chuyên môn, góc nhìn rủi ro và đề xuất của bạn theo skill ở trên; khi nội dung thuộc scope phòng khác, vẫn trả lời và ghi rõ phòng nào phụ trách chốt.

=== HỢP ĐỒNG ===
${hopDong || '(chưa có)'}

=== BỘ QUY TẮC (cả 4 phòng) ===
${quyTac || '(chưa có)'}

=== THAM SỐ APP ĐANG ÁP DỤNG ===
${thamSo || '(chưa có)'}

=== SỬA ĐỔI QUY TẮC SO VỚI HỢP ĐỒNG ===
${suaDoi || 'không có'}
Khi tham số hoặc quy tắc đã sửa đổi khác hợp đồng gốc, nói rõ cả hai: hợp đồng gốc quy định gì, đang áp dụng gì, căn cứ sửa đổi.

CÁCH LÀM VIỆC:
- Trả lời bằng tiếng Việt, đi thẳng vào câu hỏi; dùng gạch đầu dòng khi liệt kê.
- Chỉ dựa trên dữ liệu được cung cấp. Không bịa số liệu, tên, số hóa đơn. Mục nào không có trong dữ liệu thì nói rõ.
- Bạn chỉ đề xuất; quyết định duyệt, chặn, trả về, sửa quy tắc thuộc về head. Không tuyên bố đã thực hiện thao tác nào.
- Số tiền viết theo kiểu Việt Nam (1.234.567đ).`;
  return { system, skill: sk.phien_ban };
}

/** Bối cảnh một lần chạy để đưa vào tin nhắn. */
export async function boiCanhLanChay(lanChayId: string): Promise<{ text: string; hopDongId: string; vong: number }> {
  const sb = supabaseAdmin();
  const { data: lc } = await sb.from('tt_lan_chay').select('*, tt_hop_dong(ma_khach, ten_khach, so_hop_dong)').eq('id', lanChayId).single();
  if (!lc) throw new Error('Không tìm thấy lần chạy.');
  const [{ data: cb }, { data: td }, { data: dy }] = await Promise.all([
    sb.from('tt_canh_bao').select('*').eq('lan_chay_id', lanChayId).order('id'),
    sb.from('tt_thay_doi').select('ma_quy_tac, loai, cot, truoc, sau, xac_nhan').eq('lan_chay_id', lanChayId).limit(10000),
    sb.from('tt_duyet').select('*').eq('lan_chay_id', lanChayId).eq('vong', lc.vong).order('luc'),
  ]);
  const th: any = lc.tong_hop ?? {};
  const chan = await dsDangChan(lanChayId);
  const { data: aiKq } = await sb.from('tt_ai_ket_qua').select('phong_ban, noi_dung, luc').eq('lan_chay_id', lanChayId)
    .eq('loai', 'ra_soat').eq('vong', lc.vong).order('luc', { ascending: false });
  const aiMoiNhat = (['ke_toan', 'demand', 'supply', 'ceo'] as PhongBan[]).map((p) => ({ p, k: (aiKq ?? []).find((x: any) => x.phong_ban === p) as any })).filter((x) => x.k);
  const nhom = new Map<string, { n: number; chenh: number; xn: number }>();
  for (const t of td ?? []) {
    const k = `${t.ma_quy_tac} ${TEN_DICH_VU[t.loai as LoaiDichVu]} cột ${t.cot}`;
    const g = nhom.get(k) ?? { n: 0, chenh: 0, xn: 0 }; g.n++; g.chenh += Number(t.sau) - Number(t.truoc); if (t.xac_nhan) g.xn++; nhom.set(k, g);
  }
  const hd: any = lc.tt_hop_dong;
  const text = `LẦN CHẠY BẢNG KÊ ${hd.ten_khach} — HĐ ${hd.so_hop_dong} — ${th.nhan_ky ?? lc.thang}${lc.dot ? ` (đợt ${lc.dot})` : ''}
Quy tắc phiên bản v${lc.phien_ban_quy_tac}, bước hiện tại: ${lc.buoc}, vòng ${lc.vong}${lc.loi ? `, LỖI XỬ LÝ: ${lc.loi}` : ''}.
Nguồn: ${lc.che_do === 'da_format' ? `BẢNG KÊ KẾ TOÁN ĐÃ FORMAT (${lc.bk_goc_ten ?? ''}); tổng file kế toán ${fmtVnd(th.goc?.tong_cong)}đ, chiết khấu ${fmtVnd(th.goc?.chiet_khau)}đ; ${lc.bk_sua_path ? `có bản đã sửa theo quy tắc (tổng ${fmtVnd(th.tong_cong)}đ)` : 'file đã đúng quy tắc'}; bản gửi khách: ${lc.ban_gui === 'da_sua' ? 'bản đã sửa' : lc.ban_gui === 'goc' ? 'bản kế toán upload' : 'CHƯA CHỌN'}. "App tự sửa" = các ô bản đã sửa khác file kế toán.` : 'raw, app format theo mẫu'}
Tổng: vé ${fmtVnd(th.tong?.ve_may_bay)}đ (${th.so_dong?.ve_may_bay ?? 0} dòng), khách sạn ${fmtVnd(th.tong?.khach_san)}đ (${th.so_dong?.khach_san ?? 0} dòng), tổng gửi khách ${fmtVnd(th.tong_cong)}đ, chiết khấu ${fmtVnd((th.chiet_khau?.khach_san ?? 0) + (th.chiet_khau?.ve_may_bay ?? 0))}đ.

APP TỰ SỬA THEO QUY TẮC:
${[...nhom.entries()].map(([k, g]) => `- ${k}: ${g.n} ô, chênh ${fmtVnd(g.chenh)}đ, kế toán đã xác nhận ${g.xn}/${g.n}`).join('\n') || '- không có'}

CẢNH BÁO:
${(cb ?? []).map((c: any) => `- [#${c.id}] ${c.ma_quy_tac} (${TEN_PHONG_BAN[c.phong_ban as PhongBan]}, ${TEN_MUC_DO[c.muc_do as keyof typeof TEN_MUC_DO]}): ${c.noi_dung}${c.so_tien != null ? ` | số tiền ${fmtVnd(c.so_tien)}đ` : ''} | ${c.dong?.length ?? 0} dòng raw | giải trình: ${c.giai_trinh ?? 'chưa có'}`).join('\n') || '- không có'}

QUY TRÌNH: kế toán duyệt → CEO duyệt & gửi. Demand và Supply không duyệt; họ nhận cảnh báo và chỉ CHẶN hoặc TRẢ VỀ khi cần kiểm soát.
ĐANG CHẶN: ${chan.map((c: any) => `${TEN_PHONG_BAN[c.phong_ban as PhongBan]} — ${c.ly_do}`).join('; ') || 'không'}

KẾT QUẢ RÀ SOÁT AI MỚI NHẤT CỦA CÁC PHÒNG (vòng này):
${aiMoiNhat.map((x) => `[${TEN_PHONG_BAN[x.p]}]\n${String(x.k.noi_dung).slice(0, 1500)}`).join('\n\n') || '- chưa có'}

DUYỆT VÒNG HIỆN TẠI:
${(dy ?? []).map((d: any) => `- ${TEN_PHONG_BAN[d.buoc as PhongBan]}: ${d.quyet_dinh === 'duyet' ? 'duyệt' : 'trả về'}${d.y_kien ? ` — ${d.y_kien}` : ''}`).join('\n') || '- chưa có'}`;
  return { text, hopDongId: lc.hop_dong_id, vong: lc.vong };
}

/** Gọi Claude có công cụ; trả nguyên phản hồi để xử lý tool_use. */
export async function goiClaudeCongCu(system: string, messages: any[], tools: any[], maxTokens = 1500, batBuocCongCu?: string): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Chưa cấu hình ANTHROPIC_API_KEY trên Vercel — agent AI chưa chạy được.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system, messages, tools, ...(batBuocCongCu ? { tool_choice: { type: 'tool', name: batBuocCongCu } } : {}) }),
  });
  const data: any = await res.json().catch(() => ({}));
  // Model không hỗ trợ ép gọi công cụ → gọi lại ở chế độ tự chọn
  if (!res.ok && batBuocCongCu && /tool_choice/i.test(data?.error?.message ?? '')) return goiClaudeCongCu(system, messages, tools, maxTokens);
  if (!res.ok) throw new Error(`Claude API lỗi ${res.status}: ${data?.error?.message ?? 'không rõ'}`);
  return data;
}

/** Lấy JSON từ câu trả lời của model (bỏ rào ```json nếu có). */
export function docJson<T>(s: string): T {
  const t = s.replace(/```json|```/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  return JSON.parse(a >= 0 ? t.slice(a, b + 1) : t);
}
