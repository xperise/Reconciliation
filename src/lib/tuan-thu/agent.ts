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

/** System prompt: vai trò + skill + quy tắc hợp đồng thuộc scope + giới hạn hành vi. */
export async function heThong(pb: PhongBan, hopDongId: string | null) {
  const sk = await skillHienHanh(pb);
  let quyTac = '';
  if (hopDongId) {
    const { data: qt } = await supabaseAdmin().from('tt_quy_tac').select('ma, noi_dung, gia_tri, can_cu, muc_do, chot')
      .eq('hop_dong_id', hopDongId).eq('phong_ban', pb).order('ma');
    quyTac = (qt ?? []).map((q: any) => `${q.ma}: ${q.noi_dung} | giá trị: ${q.gia_tri ?? ''} | căn cứ: ${q.can_cu ?? ''} | ${TEN_MUC_DO[q.muc_do as keyof typeof TEN_MUC_DO] ?? q.muc_do}${q.chot !== 'dong_y' ? ' | (head chưa chốt)' : ''}`).join('\n');
  }
  const system = `${sk.noi_dung}

QUY TẮC HỢP ĐỒNG THUỘC SCOPE ${TEN_PHONG_BAN[pb].toUpperCase()}:
${quyTac || '(chưa có)'}

CÁCH LÀM VIỆC:
- Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào việc; trích mã quy tắc (KT-.., DM-.., SP-.., CEO-..) khi nêu căn cứ.
- Chỉ dựa trên dữ liệu được cung cấp. Không bịa số liệu, tên, số hóa đơn. Mục nào thiếu dữ liệu thì nói rõ là chưa kiểm được.
- Bạn chỉ đề xuất; quyết định duyệt, trả về, sửa quy tắc thuộc về head. Không tuyên bố đã thực hiện thao tác nào.
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
  const nhom = new Map<string, { n: number; chenh: number; xn: number }>();
  for (const t of td ?? []) {
    const k = `${t.ma_quy_tac} ${TEN_DICH_VU[t.loai as LoaiDichVu]} cột ${t.cot}`;
    const g = nhom.get(k) ?? { n: 0, chenh: 0, xn: 0 }; g.n++; g.chenh += Number(t.sau) - Number(t.truoc); if (t.xac_nhan) g.xn++; nhom.set(k, g);
  }
  const hd: any = lc.tt_hop_dong;
  const text = `LẦN CHẠY BẢNG KÊ ${hd.ten_khach} — HĐ ${hd.so_hop_dong} — ${th.nhan_ky ?? lc.thang}${lc.dot ? ` (đợt ${lc.dot})` : ''}
Quy tắc phiên bản v${lc.phien_ban_quy_tac}, bước hiện tại: ${lc.buoc}, vòng ${lc.vong}${lc.loi ? `, LỖI XỬ LÝ: ${lc.loi}` : ''}.
Tổng: vé ${fmtVnd(th.tong?.ve_may_bay)}đ (${th.so_dong?.ve_may_bay ?? 0} dòng), khách sạn ${fmtVnd(th.tong?.khach_san)}đ (${th.so_dong?.khach_san ?? 0} dòng), tổng gửi khách ${fmtVnd(th.tong_cong)}đ, chiết khấu ${fmtVnd((th.chiet_khau?.khach_san ?? 0) + (th.chiet_khau?.ve_may_bay ?? 0))}đ.

APP TỰ SỬA THEO QUY TẮC:
${[...nhom.entries()].map(([k, g]) => `- ${k}: ${g.n} ô, chênh ${fmtVnd(g.chenh)}đ, kế toán đã xác nhận ${g.xn}/${g.n}`).join('\n') || '- không có'}

CẢNH BÁO:
${(cb ?? []).map((c: any) => `- [#${c.id}] ${c.ma_quy_tac} (${TEN_PHONG_BAN[c.phong_ban as PhongBan]}, ${TEN_MUC_DO[c.muc_do as keyof typeof TEN_MUC_DO]}): ${c.noi_dung}${c.so_tien != null ? ` | số tiền ${fmtVnd(c.so_tien)}đ` : ''} | ${c.dong?.length ?? 0} dòng raw | giải trình: ${c.giai_trinh ?? 'chưa có'}`).join('\n') || '- không có'}

QUY TRÌNH: kế toán duyệt → CEO duyệt & gửi. Demand và Supply không duyệt; họ nhận cảnh báo và chỉ CHẶN hoặc TRẢ VỀ khi cần kiểm soát.
ĐANG CHẶN: ${chan.map((c: any) => `${TEN_PHONG_BAN[c.phong_ban as PhongBan]} — ${c.ly_do}`).join('; ') || 'không'}

DUYỆT VÒNG HIỆN TẠI:
${(dy ?? []).map((d: any) => `- ${TEN_PHONG_BAN[d.buoc as PhongBan]}: ${d.quyet_dinh === 'duyet' ? 'duyệt' : 'trả về'}${d.y_kien ? ` — ${d.y_kien}` : ''}`).join('\n') || '- chưa có'}`;
  return { text, hopDongId: lc.hop_dong_id, vong: lc.vong };
}

/** Lấy JSON từ câu trả lời của model (bỏ rào ```json nếu có). */
export function docJson<T>(s: string): T {
  const t = s.replace(/```json|```/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  return JSON.parse(a >= 0 ? t.slice(a, b + 1) : t);
}
