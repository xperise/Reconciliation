'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { batBuoc } from '@/lib/tuan-thu/db';
import { boiCanhLanChay, docJson, goiClaude, heThong, MODEL, skillHienHanh } from '@/lib/tuan-thu/agent';
import { GOI_Y_AGENT } from '@/lib/tuan-thu/de-xuat';
import { PhongBan, TEN_PHONG_BAN } from '@/lib/tuan-thu/types';

type KQ = { ok: true; text?: string; thongBao?: string } | { ok: false; loi: string };
const lam = async (fn: () => Promise<KQ>): Promise<KQ> => {
  try { return await fn(); } catch (e) { return { ok: false, loi: e instanceof Error ? e.message : String(e) }; }
};

/** Chat với agent của một phòng ban, theo lần chạy (nếu có). Lưu cả câu hỏi và trả lời. */
export async function hoiAgent(lanChayId: string | null, pb: PhongBan, cauHoi: string): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc(pb);
    const q = cauHoi.trim(); if (!q) throw new Error('Nhập câu hỏi.');
    const sb = supabaseAdmin();
    let hopDongId: string | null = null, boiCanh = '';
    if (lanChayId) { const b = await boiCanhLanChay(lanChayId); hopDongId = b.hopDongId; boiCanh = b.text; }
    else { const { data } = await sb.from('tt_hop_dong').select('id').order('ma_khach').limit(1); hopDongId = data?.[0]?.id ?? null; }
    const { system } = await heThong(pb, hopDongId);

    let ls = sb.from('tt_chat').select('vai, noi_dung').eq('user_id', n.id).eq('phong_ban', pb).order('luc', { ascending: false }).limit(10);
    ls = lanChayId ? ls.eq('lan_chay_id', lanChayId) : ls.is('lan_chay_id', null);
    const { data: cu } = await ls;
    const lichSu = (cu ?? []).reverse().map((m: any) => ({ role: m.vai, content: m.noi_dung }));
    // Tin nhắn đầu luôn mang bối cảnh mới nhất của lần chạy
    const messages = [
      { role: 'user' as const, content: `${boiCanh ? boiCanh + '\n\n' : ''}(Bối cảnh ở trên là dữ liệu hiện tại; dùng nó để trả lời các câu hỏi tiếp theo.)` },
      { role: 'assistant' as const, content: 'Tôi đã đọc dữ liệu. Anh/chị cần gì?' },
      ...lichSu,
      { role: 'user' as const, content: q },
    ];
    const tl = await goiClaude(system, messages, 1200);
    await sb.from('tt_chat').insert([
      { user_id: n.id, phong_ban: pb, lan_chay_id: lanChayId, vai: 'user', noi_dung: q },
      { user_id: n.id, phong_ban: pb, lan_chay_id: lanChayId, vai: 'assistant', noi_dung: tl },
    ]);
    return { ok: true, text: tl };
  });
}

export async function xoaChat(lanChayId: string | null, pb: PhongBan): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc(pb);
    let q = supabaseAdmin().from('tt_chat').delete().eq('user_id', n.id).eq('phong_ban', pb);
    q = lanChayId ? q.eq('lan_chay_id', lanChayId) : q.is('lan_chay_id', null);
    await q;
    return { ok: true };
  });
}

/** Agent AI rà soát một bước duyệt — lưu kết quả để head và CEO xem lại. */
export async function raSoatBuoc(lanChayId: string, buoc: PhongBan): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc(buoc);
    const b = await boiCanhLanChay(lanChayId);
    const { system, skill } = await heThong(buoc, b.hopDongId);
    const tl = await goiClaude(system, [{ role: 'user', content: `${b.text}

NHIỆM VỤ: Rà soát bước ${TEN_PHONG_BAN[buoc]} của lần chạy này theo skill và quy tắc của bạn.
Dòng đầu tiên chỉ ghi một trong hai: ĐỀ XUẤT DUYỆT hoặc ĐỀ XUẤT TRẢ VỀ.
Sau đó tối đa 6 gạch đầu dòng: rủi ro theo mức độ (kèm số tiền nếu có), giải trình nào chưa thuyết phục, việc cần làm trước khi duyệt.` }], 1000);
    await supabaseAdmin().from('tt_ai_ket_qua').insert({ loai: 'ra_soat', phong_ban: buoc, lan_chay_id: lanChayId, vong: b.vong,
      skill_phien_ban: skill, noi_dung: tl, model: MODEL(), nguoi: n.id });
    revalidatePath(`/tuan-thu/chay/${lanChayId}`);
    return { ok: true, text: tl };
  });
}

/** Agent Kế toán gợi ý giải trình cho cảnh báo chưa có giải trình. Gợi ý có tiền tố, kế toán phải sửa lại mới được tính. */
export async function goiYGiaiTrinh(lanChayId: string): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc('ke_toan');
    const sb = supabaseAdmin();
    const { data: cb } = await sb.from('tt_canh_bao').select('id, ma_quy_tac, noi_dung, muc_do, giai_trinh').eq('lan_chay_id', lanChayId);
    const can = (cb ?? []).filter((c: any) => c.muc_do !== 'theo_doi' && !c.giai_trinh?.trim());
    if (!can.length) return { ok: true, thongBao: 'Mọi cảnh báo đã có giải trình.' };
    const b = await boiCanhLanChay(lanChayId);
    const { system, skill } = await heThong('ke_toan', b.hopDongId);
    const tl = await goiClaude(system, [{ role: 'user', content: `${b.text}

NHIỆM VỤ: Với mỗi cảnh báo dưới đây (chưa có giải trình), soạn MỘT câu gợi ý: hoặc việc kế toán cần làm ("Cần sửa raw: …", "Cần bổ sung hóa đơn cho …"), hoặc lý do ngoại lệ hợp lệ kèm chứng từ cần đính kèm. Không khẳng định điều không có trong dữ liệu.
Chỉ trả về JSON: {"goi_y":[{"id":<số>,"text":"..."}]}
${can.map((c: any) => `#${c.id} ${c.ma_quy_tac}: ${c.noi_dung}`).join('\n')}` }], 1500);
    const out = docJson<{ goi_y: { id: number; text: string }[] }>(tl);
    let dem = 0;
    for (const g of out.goi_y ?? []) {
      if (!can.some((c: any) => c.id === g.id)) continue;
      await sb.from('tt_canh_bao').update({ giai_trinh: `${GOI_Y_AGENT} — kế toán sửa lại] ${String(g.text).slice(0, 800)}` }).eq('id', g.id).is('giai_trinh', null);
      dem++;
    }
    await sb.from('tt_ai_ket_qua').insert({ loai: 'goi_y_giai_trinh', phong_ban: 'ke_toan', lan_chay_id: lanChayId, vong: b.vong, skill_phien_ban: skill, noi_dung: tl, model: MODEL(), nguoi: n.id });
    revalidatePath(`/tuan-thu/chay/${lanChayId}`);
    return { ok: true, thongBao: `Đã điền ${dem} gợi ý. Gợi ý chỉ được tính là giải trình khi kế toán sửa lại (bỏ phần [Gợi ý agent…]).` };
  });
}

/** Agent của một phòng ban phân tích tác động của đề xuất sửa đổi quy tắc lên scope của phòng. */
export async function phanTichSuaDoi(suaDoiId: string, pb: PhongBan): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc(pb);
    const sb = supabaseAdmin();
    const { data: sd } = await sb.from('tt_sua_doi').select('*').eq('id', suaDoiId).single();
    if (!sd) throw new Error('Không tìm thấy đề xuất.');
    const { system, skill } = await heThong(pb, sd.hop_dong_id);
    const tl = await goiClaude(system, [{ role: 'user', content: `ĐỀ XUẤT SỬA ĐỔI SĐ-${String(sd.so).padStart(2, '0')} cho quy tắc ${sd.ma_quy_tac} (đề xuất bởi ${TEN_PHONG_BAN[sd.phong_ban as PhongBan]}):
- Đang áp dụng: ${sd.noi_dung_goc}
- Đề xuất: ${sd.noi_dung_moi}${sd.gia_tri_moi ? ` — ${sd.gia_tri_moi}` : ''}
- Thay đổi tham số máy: ${sd.thay_doi_tham_so ? JSON.stringify(sd.thay_doi_tham_so) : 'không'}
- Lý do: ${sd.ly_do}
- Căn cứ: ${sd.can_cu ?? 'chưa có'}
- Hiệu lực từ: ${sd.hieu_luc_tu}

NHIỆM VỤ: Phân tích tác động lên công việc thuộc scope ${TEN_PHONG_BAN[pb]} (tối đa 5 gạch đầu dòng), chỉ ra mâu thuẫn với điều khoản khác của hợp đồng nếu có (lưu ý Điều 12: sửa đổi cần văn bản ký dưới dạng phụ lục), rồi kết luận một dòng: NÊN ĐỒNG Ý / CHƯA NÊN ĐỒNG Ý kèm điều kiện.` }], 900);
    await sb.from('tt_ai_ket_qua').insert({ loai: 'tac_dong', phong_ban: pb, sua_doi_id: suaDoiId, skill_phien_ban: skill, noi_dung: tl, model: MODEL(), nguoi: n.id });
    revalidatePath('/tuan-thu/sua-doi');
    return { ok: true, text: tl };
  });
}

// ---------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------
export async function luuSkill(pb: PhongBan, noiDung: string, lyDo: string): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc(pb);
    const t = noiDung.trim(); if (t.length < 20) throw new Error('Skill quá ngắn.');
    const cu = await skillHienHanh(pb);
    if (cu.noi_dung.trim() === t) return { ok: true, thongBao: 'Skill chưa thay đổi.' };
    const { error } = await supabaseAdmin().from('tt_skill').insert({ phong_ban: pb, phien_ban: cu.phien_ban + 1, noi_dung: t, ly_do: lyDo.trim() || 'Head sửa', tao_boi: n.id });
    if (error) throw new Error(error.message);
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.luu_skill', entity: 'tt_skill', entityId: `${pb}:v${cu.phien_ban + 1}` });
    revalidatePath('/tuan-thu/agent');
    return { ok: true, thongBao: `Đã lưu skill v${cu.phien_ban + 1}.` };
  });
}

export async function xuLyGoiY(id: number, nhan: boolean): Promise<KQ> {
  return lam(async () => {
    const sb = supabaseAdmin();
    const { data: g } = await sb.from('tt_skill_goi_y').select('*').eq('id', id).single();
    if (!g) throw new Error('Không tìm thấy gợi ý.');
    const n = await batBuoc(g.phong_ban as PhongBan);
    if (nhan) {
      const cu = await skillHienHanh(g.phong_ban as PhongBan);
      const r = await sb.from('tt_skill').insert({ phong_ban: g.phong_ban, phien_ban: cu.phien_ban + 1,
        noi_dung: `${cu.noi_dung}\n- ${g.noi_dung}`, ly_do: `Học từ quyết định: ${g.nguon ?? ''}`, tao_boi: n.id });
      if (r.error) throw new Error(r.error.message);
    }
    await sb.from('tt_skill_goi_y').update({ trang_thai: nhan ? 'da_nhan' : 'bo_qua', xu_ly_boi: n.id }).eq('id', id);
    revalidatePath('/tuan-thu/agent');
    return { ok: true, thongBao: nhan ? 'Đã thêm vào skill.' : 'Đã bỏ qua.' };
  });
}
