'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { batBuoc, duocLam } from '@/lib/tuan-thu/db';
import { CONG_CU_DOC, CONG_CU_THAO_TAC, LA_THAO_TAC, chayCongCuDoc, moTa, phongBanCan } from '@/lib/tuan-thu/cong-cu';
import { chanLanChay, chotQuyTac, deXuatSuaDoi, duyetBuoc, duyetSuaDoi, goChan, luuGiaiTrinh, suaBangKe, xacNhanThayDoi } from './actions';
import { boiCanhLanChay, docJson, goiClaude, goiClaudeCongCu, heThong, MODEL, skillHienHanh } from '@/lib/tuan-thu/agent';
import { GOI_Y_AGENT } from '@/lib/tuan-thu/de-xuat';
import { PhongBan, TEN_PHONG_BAN } from '@/lib/tuan-thu/types';

type KQ = { ok: true; text?: string; thongBao?: string } | { ok: false; loi: string };
const lam = async (fn: () => Promise<KQ>): Promise<KQ> => {
  try { return await fn(); } catch (e) { return { ok: false, loi: e instanceof Error ? e.message : String(e) }; }
};

export type HanhDongTT = { id: number; mo_ta: string; trang_thai: string; ket_qua: string | null };
export type TinNhan = { vai: 'user' | 'assistant'; noi_dung: string; hanh_dong: HanhDongTT[] };

/**
 * Chat với agent (như Cowork): agent đọc dữ liệu bằng công cụ đọc và ĐỀ XUẤT thao tác bằng công cụ thao tác.
 * Thao tác không chạy ngay — thành thẻ chờ người dùng bấm Thực hiện.
 */
export async function hoiAgent(lanChayId: string | null, pb: PhongBan, cauHoi: string): Promise<{ ok: true; text: string; hanh_dong: HanhDongTT[] } | { ok: false; loi: string }> {
  try {
    const n = await batBuoc(pb);
    const q = cauHoi.trim(); if (!q) throw new Error('Nhập câu hỏi.');
    const sb = supabaseAdmin();
    let hopDongId: string | null = null, boiCanh = '';
    if (lanChayId) { const b = await boiCanhLanChay(lanChayId); hopDongId = b.hopDongId; boiCanh = b.text; }
    else { const { data } = await sb.from('tt_hop_dong').select('id').order('ma_khach').limit(1); hopDongId = data?.[0]?.id ?? null; }
    const { system: sys0 } = await heThong(pb, hopDongId);
    const system = `${sys0}

LÀM VIỆC QUA CÔNG CỤ:
- Bạn đang làm việc cho ${n.full_name || n.email}, vai trò ${n.phong_ban ? TEN_PHONG_BAN[n.phong_ban] : 'admin (làm thay được mọi phòng)'}, đang nói chuyện với tư cách agent ${TEN_PHONG_BAN[pb]}.
- Dùng công cụ đọc (ds_lan_chay, xem_lan_chay, xem_dong, ds_sua_doi) để lấy số liệu trước khi trả lời hoặc đề xuất; không đoán id, số dòng, tên cột.
- Khi người dùng muốn làm việc gì (sửa ô, ghi giải trình, duyệt, trả về, chặn, gỡ chặn, đề xuất/duyệt sửa đổi, chốt quy tắc, thêm skill), gọi đúng công cụ thao tác. Thao tác KHÔNG chạy ngay: người dùng sẽ thấy thẻ và tự bấm Thực hiện. Sau khi gọi, nói ngắn gọn thao tác đang chờ xác nhận; không nói là đã làm xong.
- Không tự đề xuất thao tác người dùng không yêu cầu, trừ khi hỏi lại để xác nhận. Nếu thiếu thông tin bắt buộc (lý do, giá trị mới), hỏi lại trước.
- Duyệt của CEO sẽ gửi thư cho khách ngay khi người dùng xác nhận — nhắc rõ điều này.${lanChayId ? `\n- Lần chạy đang mở: ${lanChayId}.` : ''}`;

    let ls = sb.from('tt_chat').select('vai, noi_dung').eq('user_id', n.id).eq('phong_ban', pb).order('luc', { ascending: false }).limit(12);
    ls = lanChayId ? ls.eq('lan_chay_id', lanChayId) : ls.is('lan_chay_id', null);
    const { data: cu } = await ls;
    const lichSu = (cu ?? []).reverse().map((m: any) => ({ role: m.vai, content: m.noi_dung }));
    // API yêu cầu user/assistant xen kẽ: gộp các tin liền nhau cùng vai
    const messages: any[] = [];
    for (const m of [
      { role: 'user', content: `${boiCanh ? boiCanh + '\n\n' : ''}(Bối cảnh hiện tại. Dùng công cụ để đọc thêm khi cần.)` },
      { role: 'assistant', content: 'Tôi đã đọc bối cảnh. Anh/chị cần gì?' },
      ...lichSu,
      { role: 'user', content: q },
    ]) {
      const cuoi = messages[messages.length - 1];
      if (cuoi && cuoi.role === m.role) cuoi.content = `${cuoi.content}\n\n${m.content}`;
      else messages.push({ ...m });
    }
    const tools = [...CONG_CU_DOC, ...CONG_CU_THAO_TAC];
    const hd: HanhDongTT[] = [];
    let text = '';
    for (let vong = 0; vong < 6; vong++) {
      const r = await goiClaudeCongCu(system, messages, tools, 1500);
      const blocks: any[] = r.content ?? [];
      text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      const uses = blocks.filter((b) => b.type === 'tool_use');
      if (r.stop_reason !== 'tool_use' || !uses.length) break;
      messages.push({ role: 'assistant', content: blocks });
      const results: any[] = [];
      for (const u of uses) {
        let out: string;
        try {
          if (LA_THAO_TAC.has(u.name)) {
            const can = phongBanCan(u.name, u.input, pb);
            if (!duocLam(n, can)) out = `Người dùng không có quyền thao tác thay phòng ${TEN_PHONG_BAN[can]}.`;
            else {
              const mt = moTa(u.name, u.input);
              const { data: row, error } = await sb.from('tt_hanh_dong').insert({ user_id: n.id, phong_ban: pb, lan_chay_id: u.input?.lan_chay_id ?? lanChayId,
                cong_cu: u.name, tham_so: u.input ?? {}, mo_ta: mt }).select('id').single();
              if (error || !row) throw new Error(error?.message ?? 'Không tạo được thao tác (cần SQL 42).');
              hd.push({ id: row.id, mo_ta: mt, trang_thai: 'cho', ket_qua: null });
              out = `Đã tạo thẻ thao tác #${row.id} chờ người dùng bấm Thực hiện: ${mt}`;
            }
          } else out = await chayCongCuDoc(u.name, u.input ?? {});
        } catch (e) { out = `Lỗi: ${e instanceof Error ? e.message : String(e)}`; }
        results.push({ type: 'tool_result', tool_use_id: u.id, content: out.slice(0, 20000) });
      }
      messages.push({ role: 'user', content: results });
    }
    if (!text) text = hd.length ? 'Tôi đã chuẩn bị thao tác bên dưới, anh/chị xem và bấm Thực hiện.' : '(Agent không có câu trả lời.)';
    await sb.from('tt_chat').insert([
      { user_id: n.id, phong_ban: pb, lan_chay_id: lanChayId, vai: 'user', noi_dung: q },
      { user_id: n.id, phong_ban: pb, lan_chay_id: lanChayId, vai: 'assistant', noi_dung: text, hanh_dong_ids: hd.map((x) => x.id) },
    ]);
    return { ok: true, text, hanh_dong: hd };
  } catch (e) { return { ok: false, loi: e instanceof Error ? e.message : String(e) }; }
}

/** Lịch sử chat kèm trạng thái các thẻ thao tác. */
export async function taiChat(lanChayId: string | null, pb: PhongBan): Promise<TinNhan[]> {
  const n = await batBuoc(pb);
  const sb = supabaseAdmin();
  let q = sb.from('tt_chat').select('vai, noi_dung, hanh_dong_ids').eq('user_id', n.id).eq('phong_ban', pb).order('luc').limit(60);
  q = lanChayId ? q.eq('lan_chay_id', lanChayId) : q.is('lan_chay_id', null);
  const { data } = await q;
  const ids = (data ?? []).flatMap((m: any) => m.hanh_dong_ids ?? []);
  const { data: hds } = ids.length ? await sb.from('tt_hanh_dong').select('id, mo_ta, trang_thai, ket_qua').in('id', ids) : { data: [] as any[] };
  return (data ?? []).map((m: any) => ({ vai: m.vai, noi_dung: m.noi_dung,
    hanh_dong: (m.hanh_dong_ids ?? []).map((i: number) => (hds ?? []).find((h: any) => h.id === i)).filter(Boolean) }));
}

/** Người dùng bấm Thực hiện: chạy thao tác bằng quyền của chính người đó. */
export async function thucHienHanhDong(id: number): Promise<KQ> {
  return lam(async () => {
    const sb = supabaseAdmin();
    const { data: h } = await sb.from('tt_hanh_dong').select('*').eq('id', id).single();
    if (!h) throw new Error('Không tìm thấy thao tác.');
    const n = await batBuoc();
    if (h.user_id !== n.id) throw new Error('Thao tác này do người khác tạo.');
    if (h.trang_thai !== 'cho') throw new Error('Thao tác đã xử lý.');
    const i = h.tham_so ?? {};
    let kq: any;
    const hdMa = async (ma?: string) => { const { data } = await sb.from('tt_hop_dong').select('id').eq('ma_khach', ma || 'VCB').single(); if (!data) throw new Error('Không tìm thấy hợp đồng.'); return data.id; };
    switch (h.cong_cu) {
      case 'sua_o_bang_ke': kq = await suaBangKe(i.lan_chay_id, i.thay_doi ?? [], i.ly_do ?? ''); break;
      case 'ghi_giai_trinh': kq = await luuGiaiTrinh(Number(i.canh_bao_id), String(i.noi_dung ?? '')); break;
      case 'xac_nhan_o_tu_sua': kq = await xacNhanThayDoi(i.lan_chay_id, 'tat_ca'); break;
      case 'duyet_buoc': kq = await duyetBuoc(i.lan_chay_id, i.buoc, 'duyet', String(i.y_kien ?? '')); break;
      case 'tra_ve_ke_toan': kq = await duyetBuoc(i.lan_chay_id, i.phong_ban, 'tra_ve', String(i.ly_do ?? '')); break;
      case 'chan_bang_ke': kq = await chanLanChay(i.lan_chay_id, i.phong_ban, String(i.ly_do ?? '')); break;
      case 'go_chan': kq = await goChan(Number(i.chan_id), String(i.ghi_chu ?? '')); break;
      case 'de_xuat_sua_doi': {
        const fd = new FormData();
        fd.set('hop_dong_id', await hdMa(i.ma_khach)); fd.set('ma_quy_tac', i.ma_quy_tac); fd.set('noi_dung_moi', i.noi_dung_moi ?? '');
        fd.set('gia_tri_moi', i.gia_tri_moi ?? ''); fd.set('ly_do', i.ly_do ?? ''); fd.set('can_cu', i.can_cu ?? ''); fd.set('hieu_luc_tu', i.hieu_luc_tu ?? '');
        fd.set('phong_ban', h.phong_ban); fd.set('loai_tham_so', i.loai_tham_so ?? '');
        for (const k of ['ngay_cat', 'ck_ks', 'ck_vmb', 'phi_ks', 'phi_vmb', 'tk_so', 'tk_ngan_hang', 'han_muc']) if (i[k] !== undefined) fd.set(k, String(i[k]));
        kq = await deXuatSuaDoi(fd); break;
      }
      case 'duyet_sua_doi': kq = await duyetSuaDoi(i.sua_doi_id, h.phong_ban as PhongBan, i.dong_y ? 'dong_y' : 'khong_dong_y', String(i.y_kien ?? '')); break;
      case 'chot_quy_tac': {
        const { data: qt } = await sb.from('tt_quy_tac').select('id').eq('hop_dong_id', await hdMa(i.ma_khach)).eq('ma', i.ma).single();
        if (!qt) throw new Error(`Không có quy tắc ${i.ma}.`);
        kq = await chotQuyTac(qt.id, i.dong_y ? 'dong_y' : 'can_sua', String(i.y_kien ?? '')); break;
      }
      case 'bo_sung_skill': {
        const cu = await skillHienHanh(h.phong_ban as PhongBan);
        kq = await luuSkill(h.phong_ban as PhongBan, `${cu.noi_dung}\n- ${i.noi_dung_them}`, i.ly_do ? `Qua agent: ${i.ly_do}` : 'Qua agent'); break;
      }
      default: throw new Error('Thao tác không hỗ trợ.');
    }
    const ok = !!kq?.ok;
    const ketQua = ok ? (kq.thongBao ?? 'Đã thực hiện.') : kq?.loi ?? 'Lỗi không rõ.';
    await sb.from('tt_hanh_dong').update({ trang_thai: ok ? 'da_lam' : 'loi', ket_qua: ketQua, xu_ly_luc: new Date().toISOString() }).eq('id', id);
    await sb.from('tt_chat').insert({ user_id: n.id, phong_ban: h.phong_ban, lan_chay_id: h.lan_chay_id, vai: 'assistant', noi_dung: `${ok ? '✓ Đã thực hiện' : '✗ Không thực hiện được'}: ${h.mo_ta}\nKết quả: ${ketQua}` });
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.agent_thuc_hien', entity: 'tt_hanh_dong', entityId: String(id), after: { cong_cu: h.cong_cu, ok, ketQua } });
    if (!ok) return { ok: false, loi: ketQua };
    return { ok: true, thongBao: ketQua };
  });
}

export async function boQuaHanhDong(id: number): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc();
    const sb = supabaseAdmin();
    const { data: h } = await sb.from('tt_hanh_dong').select('user_id, trang_thai').eq('id', id).single();
    if (!h || h.user_id !== n.id) throw new Error('Không tìm thấy thao tác.');
    if (h.trang_thai === 'cho') await sb.from('tt_hanh_dong').update({ trang_thai: 'bo_qua', xu_ly_luc: new Date().toISOString() }).eq('id', id);
    return { ok: true };
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

${buoc === 'demand' || buoc === 'supply'
  ? `NHIỆM VỤ: Bạn KHÔNG duyệt bảng kê. Rà soát các cảnh báo thuộc scope ${TEN_PHONG_BAN[buoc]} và cho biết có cần can thiệp không.
Dòng đầu tiên chỉ ghi một trong ba: KHÔNG CẦN CHẶN, NÊN CHẶN, hoặc NÊN TRẢ VỀ KẾ TOÁN.
Sau đó tối đa 6 gạch đầu dòng: rủi ro thật (kèm số tiền nếu có), giải trình nào chưa thuyết phục, nếu chặn thì điều kiện để gỡ chặn.`
  : `NHIỆM VỤ: Rà soát bước ${TEN_PHONG_BAN[buoc]} của lần chạy này theo skill và quy tắc của bạn.
Dòng đầu tiên chỉ ghi một trong hai: ĐỀ XUẤT DUYỆT hoặc ĐỀ XUẤT TRẢ VỀ.
Sau đó tối đa 6 gạch đầu dòng: rủi ro theo mức độ (kèm số tiền nếu có), giải trình nào chưa thuyết phục, lần chặn nào của Demand/Supply còn hiệu lực, việc cần làm trước khi duyệt.`}` }], 1000);
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
