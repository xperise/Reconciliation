'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { batBuoc, duocLam } from '@/lib/tuan-thu/db';
import { CONG_CU_DOC, CONG_CU_THAO_TAC, LA_THAO_TAC, chayCongCuDoc, moTa, phongBanCan } from '@/lib/tuan-thu/cong-cu';
import { chanLanChay, chonBanGui, chotQuyTac, duyetMauBangKe, hocMauBangKe, deXuatSuaDoi, duyetBuoc, duyetSuaDoi, goChan, luuGiaiTrinh, suaBangKe, taiLaiRaw, taoHopDong, taoLanChay, xacNhanThayDoi } from './actions';
import { khoiDinhKem, TepDinhKem } from '@/lib/tuan-thu/dinh-kem';
import { docHopDong } from '@/lib/tuan-thu/doc-hop-dong';
import { goiMoHinh, NHA_CUNG_CAP } from '@/lib/tuan-thu/ai-provider';
import { boiCanhLanChay, docJson, goiClaude, goiClaudeCongCu, heThong, MODEL, skillHienHanh } from '@/lib/tuan-thu/agent';
import { GOI_Y_AGENT } from '@/lib/tuan-thu/de-xuat';
import { PhongBan, TEN_PHONG_BAN } from '@/lib/tuan-thu/types';
import { themOrg } from '@/lib/tuan-thu/to-chuc';
import { toChucHienTai } from '@/lib/tuan-thu/to-chuc-server';
import { coQuyenTepCuaToChuc } from '@/lib/tuan-thu/to-chuc';

type KQ = { ok: true; text?: string; thongBao?: string } | { ok: false; loi: string };
const lam = async (fn: () => Promise<KQ>): Promise<KQ> => {
  try { return await fn(); } catch (e) { return { ok: false, loi: e instanceof Error ? e.message : String(e) }; }
};

export type HanhDongTT = { id: number; mo_ta: string; trang_thai: string; ket_qua: string | null };
export type TinNhan = { vai: 'user' | 'assistant'; noi_dung: string; hanh_dong: HanhDongTT[]; tep: { path: string; ten: string }[] };

/**
 * Chat với agent (như Cowork): agent đọc dữ liệu bằng công cụ đọc và ĐỀ XUẤT thao tác bằng công cụ thao tác.
 * Thao tác không chạy ngay — thành thẻ chờ người dùng bấm Thực hiện.
 */
export async function hoiAgent(lanChayId: string | null, pb: PhongBan, cauHoi: string, tep: TepDinhKem[] = []): Promise<{ ok: true; text: string; hanh_dong: HanhDongTT[] } | { ok: false; loi: string }> {
  try {
    const n = await batBuoc(pb);
    const toChuc = await toChucHienTai();
    const teps = tep.filter((t) => typeof t.path === 'string' && coQuyenTepCuaToChuc(t.path, toChuc));
    const q = cauHoi.trim() || (teps.length ? 'Đọc giúp tôi các tệp đính kèm.' : '');
    if (!q) throw new Error('Nhập câu hỏi.');
    const sb = supabaseAdmin();
    let hopDongId: string | null = null, boiCanh = '';
    if (lanChayId) { const b = await boiCanhLanChay(lanChayId); hopDongId = b.hopDongId; boiCanh = b.text; }
    else { const { data } = await sb.from('tt_hop_dong').select('id').eq('org_id', await toChucHienTai()).order('ma_khach').limit(1); hopDongId = data?.[0]?.id ?? null; }
    const { system: sys0 } = await heThong(pb, hopDongId);
    const system = `${sys0}

LÀM VIỆC QUA CÔNG CỤ:
- Bạn đang làm việc cho ${n.full_name || n.email}, vai trò ${n.phong_ban ? TEN_PHONG_BAN[n.phong_ban] : 'admin (làm thay được mọi phòng)'}, đang nói chuyện với tư cách agent ${TEN_PHONG_BAN[pb]}.
- Dùng công cụ đọc (ds_lan_chay, xem_lan_chay, xem_dong, ds_hop_dong, xem_hop_dong, ds_sua_doi) để lấy số liệu trước khi trả lời hoặc đề xuất; không đoán id, số dòng, tên cột.
- Khi người dùng muốn làm việc gì (sửa ô, ghi giải trình, duyệt, trả về, chặn, gỡ chặn, đề xuất/duyệt sửa đổi, chốt quy tắc, thêm skill), gọi đúng công cụ thao tác. Thao tác KHÔNG chạy ngay: người dùng sẽ thấy thẻ và tự bấm Thực hiện. Sau khi gọi, nói ngắn gọn thao tác đang chờ xác nhận; không nói là đã làm xong.
- Hợp đồng mới upload qua màn hình Thêm hợp đồng (PDF); bạn giúp head đọc bản nháp, giải thích điểm còn mở, chốt quy tắc (chot_quy_tac, chot_nhieu_quy_tac). Kích hoạt hợp đồng do CEO bấm trên màn hình Hợp đồng & quy tắc.
- Không tự đề xuất thao tác người dùng không yêu cầu, trừ khi hỏi lại để xác nhận. Nếu thiếu thông tin bắt buộc (lý do, giá trị mới), hỏi lại trước.
- Duyệt của CEO sẽ gửi thư cho khách ngay khi người dùng xác nhận — nhắc rõ điều này.
- Người dùng có thể đính kèm tệp (PDF, Excel, CSV, ảnh, Word). Đọc kỹ nội dung tệp trước khi trả lời. Tệp raw (.xlsx) dùng cho tao_lan_chay (tep_paths) / tai_lai_raw; bảng kê kế toán ĐÃ FORMAT dùng cho tao_lan_chay với bang_ke_path (raw kèm theo chỉ để đối chiếu), cho tai_lai_raw với bang_ke_path khi kế toán gửi bản chỉnh tay, hoặc cho hoc_mau_bang_ke khi người dùng muốn app ghi nhớ mẫu của khách — phân biệt bằng nội dung tệp (bảng kê đã format có đầu trang Tên đơn vị bán hàng, các sheet theo mẫu khách); PDF hợp đồng dùng được cho tao_hop_dong — truyền đúng "đường dẫn để dùng trong công cụ" ghi cạnh tên tệp. Nếu thiếu thông tin bắt buộc (tháng, đợt, mã khách, số hợp đồng…) thì hỏi lại hoặc đọc từ chính tệp.${lanChayId ? `\n- Lần chạy đang mở: ${lanChayId}.` : ''}`;

    let ls = sb.from('tt_chat').select('vai, noi_dung, tep').eq('org_id', await toChucHienTai()).eq('user_id', n.id).eq('phong_ban', pb).order('luc', { ascending: false }).limit(12);
    ls = lanChayId ? ls.eq('lan_chay_id', lanChayId) : ls.is('lan_chay_id', null);
    const { data: cu } = await ls;
    const lichSu = (cu ?? []).reverse().map((m: any) => ({ role: m.vai, content: `${m.noi_dung}${(m.tep ?? []).length ? `\n(Đã đính kèm: ${(m.tep as any[]).map((t) => `${t.ten} — ${t.path}`).join('; ')})` : ''}` }));
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
    if (teps.length) {
      const cuoi = messages[messages.length - 1];
      cuoi.content = [...(await khoiDinhKem(teps)), { type: 'text', text: String(cuoi.content) }];
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
              const { data: row, error } = await sb.from('tt_hanh_dong').insert(themOrg({ user_id: n.id, phong_ban: pb, lan_chay_id: u.input?.lan_chay_id ?? lanChayId,
                cong_cu: u.name, tham_so: u.input ?? {}, mo_ta: mt }, await toChucHienTai())).select('id').single();
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
    await sb.from('tt_chat').insert(themOrg([
      { user_id: n.id, phong_ban: pb, lan_chay_id: lanChayId, vai: 'user', noi_dung: q, ...(teps.length ? { tep: teps } : {}) },
      { user_id: n.id, phong_ban: pb, lan_chay_id: lanChayId, vai: 'assistant', noi_dung: text, hanh_dong_ids: hd.map((x) => x.id) },
    ], await toChucHienTai()));
    return { ok: true, text, hanh_dong: hd };
  } catch (e) { return { ok: false, loi: e instanceof Error ? e.message : String(e) }; }
}

/** Lịch sử chat kèm trạng thái các thẻ thao tác. */
export async function taiChat(lanChayId: string | null, pb: PhongBan): Promise<TinNhan[]> {
  const n = await batBuoc(pb);
  const sb = supabaseAdmin();
  let q = sb.from('tt_chat').select('vai, noi_dung, hanh_dong_ids, tep').eq('org_id', await toChucHienTai()).eq('user_id', n.id).eq('phong_ban', pb).order('luc').limit(60);
  q = lanChayId ? q.eq('lan_chay_id', lanChayId) : q.is('lan_chay_id', null);
  const { data } = await q;
  const ids = (data ?? []).flatMap((m: any) => m.hanh_dong_ids ?? []);
  const { data: hds } = ids.length ? await sb.from('tt_hanh_dong').select('id, mo_ta, trang_thai, ket_qua').eq('org_id', await toChucHienTai()).in('id', ids) : { data: [] as any[] };
  return (data ?? []).map((m: any) => ({ vai: m.vai, noi_dung: m.noi_dung, tep: m.tep ?? [],
    hanh_dong: (m.hanh_dong_ids ?? []).map((i: number) => (hds ?? []).find((h: any) => h.id === i)).filter(Boolean) }));
}

/** Người dùng bấm Thực hiện: chạy thao tác bằng quyền của chính người đó. */
export async function thucHienHanhDong(id: number): Promise<KQ> {
  return lam(async () => {
    const sb = supabaseAdmin();
    const { data: h } = await sb.from('tt_hanh_dong').select('*').eq('org_id', await toChucHienTai()).eq('id', id).single();
    if (!h) throw new Error('Không tìm thấy thao tác.');
    const n = await batBuoc();
    if (h.user_id !== n.id) throw new Error('Thao tác này do người khác tạo.');
    if (h.trang_thai !== 'cho') throw new Error('Thao tác đã xử lý.');
    const i = h.tham_so ?? {};
    let kq: any;
    // Một khách có thể có nhiều hợp đồng: ưu tiên hợp đồng chờ chốt mới nhất (đang làm việc), rồi tới hợp đồng hiệu lực mới nhất
    const hdMa = async (ma?: string, id?: string) => {
      if (id) return id;
      const { data } = await sb.from('tt_hop_dong').select('id, trang_thai').eq('org_id', await toChucHienTai()).eq('ma_khach', (ma || 'VCB').toUpperCase()).order('created_at', { ascending: false });
      const ds = (data ?? []) as any[]; const h = ds.find((x) => x.trang_thai === 'cho_chot') ?? ds.find((x) => !x.trang_thai || x.trang_thai === 'hieu_luc') ?? ds[0];
      if (!h) throw new Error('Không tìm thấy hợp đồng.'); return h.id;
    };
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
        const { data: qt } = await sb.from('tt_quy_tac').select('id').eq('org_id', await toChucHienTai()).eq('hop_dong_id', await hdMa(i.ma_khach, i.hop_dong_id)).eq('ma', i.ma).single();
        if (!qt) throw new Error(`Không có quy tắc ${i.ma}.`);
        kq = await chotQuyTac(qt.id, i.dong_y ? 'dong_y' : 'can_sua', String(i.y_kien ?? '')); break;
      }
      case 'chot_nhieu_quy_tac': {
        let q = sb.from('tt_quy_tac').select('id, ma, phong_ban, chot').eq('org_id', await toChucHienTai()).eq('hop_dong_id', i.hop_dong_id).eq('phong_ban', h.phong_ban);
        if (Array.isArray(i.ma) && i.ma.length) q = q.in('ma', i.ma); else q = q.neq('chot', 'dong_y');
        const { data: ds } = await q;
        if (!(ds ?? []).length) throw new Error('Không có quy tắc nào khớp thuộc phòng này.');
        let ok = 0; const loi: string[] = [];
        for (const r of ds as any[]) { const k = await chotQuyTac(r.id, i.dong_y ? 'dong_y' : 'can_sua', String(i.y_kien ?? '')); if (k.ok) ok++; else loi.push(`${r.ma}: ${k.loi}`); }
        kq = loi.length && !ok ? { ok: false, loi: loi.join('; ') } : { ok: true, thongBao: `Đã ${i.dong_y ? 'đồng ý' : 'đánh dấu cần sửa'} ${ok} quy tắc.${loi.length ? ` Lỗi: ${loi.join('; ')}` : ''}` };
        break;
      }
      case 'tao_lan_chay': {
        const fd = new FormData();
        fd.set('hop_dong_id', i.hop_dong_id); fd.set('thang', i.thang); fd.set('dot', i.dot ? String(i.dot) : '');
        if (i.bang_ke_path) { fd.set('che_do', 'da_format'); fd.set('bk_json', JSON.stringify([{ path: i.bang_ke_path, ten: String(i.bang_ke_path).split('/').pop() }])); }
        fd.set('raw_json', JSON.stringify((i.tep_paths ?? []).map((p: string) => ({ path: p, ten: p.split('/').pop() }))));
        kq = await taoLanChay(fd);
        if (kq.ok && kq.id) kq = { ok: true, thongBao: `Đã tạo và xử lý lần chạy — mở: /tuan-thu/chay/${kq.id}` };
        break;
      }
      case 'chon_ban_gui': kq = await chonBanGui(i.lan_chay_id, i.ban); break;
      case 'tai_lai_raw': {
        const fd = new FormData();
        fd.set('id', i.lan_chay_id);
        fd.set('raw_json', JSON.stringify((i.tep_paths ?? []).map((p: string) => ({ path: p, ten: p.split('/').pop() }))));
        if (i.bang_ke_path) fd.set('bk_json', JSON.stringify([{ path: i.bang_ke_path, ten: String(i.bang_ke_path).split('/').pop() }]));
        kq = await taiLaiRaw(fd); break;
      }
      case 'hoc_mau_bang_ke': {
        const fd = new FormData(); fd.set('ma_khach', i.ma_khach); fd.set('mau_json', JSON.stringify([{ path: i.tep_path, ten: String(i.tep_path).split('/').pop() }]));
        kq = await hocMauBangKe(fd); break;
      }
      case 'duyet_mau_bang_ke': { kq = await duyetMauBangKe(i.mau_id); break;
      }
      case 'tao_hop_dong': {
        const fd = new FormData();
        for (const k of ['ma_khach', 'ten_khach', 'ten_cong_ty_raw', 'so_hop_dong', 'ngay_ky', 'hieu_luc_tu']) if (i[k]) fd.set(k, String(i[k]));
        fd.set('tep_json', JSON.stringify((i.tep_paths ?? []).map((p: string) => ({ path: p, ten: p.split('/').pop() }))));
        const t = await taoHopDong(fd);
        if (!t.ok || !t.id) { kq = t; break; }
        try { const d = await docHopDong(t.id); kq = { ok: true, thongBao: `Đã thêm hợp đồng, agent đọc xong: ${d.so_quy_tac} quy tắc nháp, ${d.cau_hoi_mo} điểm còn mở. Mở Hợp đồng & quy tắc để 4 head chốt.` }; }
        catch (e) { kq = { ok: true, thongBao: `Đã lưu hợp đồng nhưng agent đọc lỗi: ${e instanceof Error ? e.message : String(e)}. Bấm "Agent đọc lại" ở trang Hợp đồng & quy tắc.` }; }
        break;
      }
      case 'bo_sung_skill': {
        const cu = await skillHienHanh(h.phong_ban as PhongBan);
        kq = await luuSkill(h.phong_ban as PhongBan, `${cu.noi_dung}\n- ${i.noi_dung_them}`, i.ly_do ? `Qua agent: ${i.ly_do}` : 'Qua agent'); break;
      }
      default: throw new Error('Thao tác không hỗ trợ.');
    }
    const ok = !!kq?.ok;
    const ketQua = ok ? (kq.thongBao ?? 'Đã thực hiện.') : kq?.loi ?? 'Lỗi không rõ.';
    await sb.from('tt_hanh_dong').update({ trang_thai: ok ? 'da_lam' : 'loi', ket_qua: ketQua, xu_ly_luc: new Date().toISOString() }).eq('org_id', await toChucHienTai()).eq('id', id);
    await sb.from('tt_chat').insert(themOrg({ user_id: n.id, phong_ban: h.phong_ban, lan_chay_id: h.lan_chay_id, vai: 'assistant', noi_dung: `${ok ? '✓ Đã thực hiện' : '✗ Không thực hiện được'}: ${h.mo_ta}\nKết quả: ${ketQua}` }, await toChucHienTai()));
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.agent_thuc_hien', entity: 'tt_hanh_dong', entityId: String(id), after: { cong_cu: h.cong_cu, ok, ketQua } });
    if (!ok) return { ok: false, loi: ketQua };
    return { ok: true, thongBao: ketQua };
  });
}

export async function boQuaHanhDong(id: number): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc();
    const sb = supabaseAdmin();
    const { data: h } = await sb.from('tt_hanh_dong').select('user_id, trang_thai').eq('org_id', await toChucHienTai()).eq('id', id).single();
    if (!h || h.user_id !== n.id) throw new Error('Không tìm thấy thao tác.');
    if (h.trang_thai === 'cho') await sb.from('tt_hanh_dong').update({ trang_thai: 'bo_qua', xu_ly_luc: new Date().toISOString() }).eq('org_id', await toChucHienTai()).eq('id', id);
    return { ok: true };
  });
}

export async function xoaChat(lanChayId: string | null, pb: PhongBan): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc(pb);
    let q = supabaseAdmin().from('tt_chat').delete().eq('org_id', await toChucHienTai()).eq('user_id', n.id).eq('phong_ban', pb);
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
    await supabaseAdmin().from('tt_ai_ket_qua').insert(themOrg({ loai: 'ra_soat', phong_ban: buoc, lan_chay_id: lanChayId, vong: b.vong,
      skill_phien_ban: skill, noi_dung: tl, model: MODEL(), nguoi: n.id }, await toChucHienTai()));
    revalidatePath(`/tuan-thu/chay/${lanChayId}`);
    return { ok: true, text: tl };
  });
}

/** Agent Kế toán gợi ý giải trình cho cảnh báo chưa có giải trình. Gợi ý có tiền tố, kế toán phải sửa lại mới được tính. */
export async function goiYGiaiTrinh(lanChayId: string): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc('ke_toan');
    const sb = supabaseAdmin();
    const { data: cb } = await sb.from('tt_canh_bao').select('id, ma_quy_tac, noi_dung, muc_do, giai_trinh').eq('org_id', await toChucHienTai()).eq('lan_chay_id', lanChayId);
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
      await sb.from('tt_canh_bao').update({ giai_trinh: `${GOI_Y_AGENT} — kế toán sửa lại] ${String(g.text).slice(0, 800)}` }).eq('org_id', await toChucHienTai()).eq('id', g.id).is('giai_trinh', null);
      dem++;
    }
    await sb.from('tt_ai_ket_qua').insert(themOrg({ loai: 'goi_y_giai_trinh', phong_ban: 'ke_toan', lan_chay_id: lanChayId, vong: b.vong, skill_phien_ban: skill, noi_dung: tl, model: MODEL(), nguoi: n.id }, await toChucHienTai()));
    revalidatePath(`/tuan-thu/chay/${lanChayId}`);
    return { ok: true, thongBao: `Đã điền ${dem} gợi ý. Gợi ý chỉ được tính là giải trình khi kế toán sửa lại (bỏ phần [Gợi ý agent…]).` };
  });
}

/** Agent của một phòng ban phân tích tác động của đề xuất sửa đổi quy tắc lên scope của phòng. */
export async function phanTichSuaDoi(suaDoiId: string, pb: PhongBan): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc(pb);
    const sb = supabaseAdmin();
    const { data: sd } = await sb.from('tt_sua_doi').select('*').eq('org_id', await toChucHienTai()).eq('id', suaDoiId).single();
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
    await sb.from('tt_ai_ket_qua').insert(themOrg({ loai: 'tac_dong', phong_ban: pb, sua_doi_id: suaDoiId, skill_phien_ban: skill, noi_dung: tl, model: MODEL(), nguoi: n.id }, await toChucHienTai()));
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
    const { error } = await supabaseAdmin().from('tt_skill').insert(themOrg({ phong_ban: pb, phien_ban: cu.phien_ban + 1, noi_dung: t, ly_do: lyDo.trim() || 'Head sửa', tao_boi: n.id }, await toChucHienTai()));
    if (error) throw new Error(error.message);
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.luu_skill', entity: 'tt_skill', entityId: `${pb}:v${cu.phien_ban + 1}` });
    revalidatePath('/tuan-thu/agent');
    return { ok: true, thongBao: `Đã lưu skill v${cu.phien_ban + 1}.` };
  });
}

export async function xuLyGoiY(id: number, nhan: boolean): Promise<KQ> {
  return lam(async () => {
    const sb = supabaseAdmin();
    const { data: g } = await sb.from('tt_skill_goi_y').select('*').eq('org_id', await toChucHienTai()).eq('id', id).single();
    if (!g) throw new Error('Không tìm thấy gợi ý.');
    const n = await batBuoc(g.phong_ban as PhongBan);
    if (nhan) {
      const cu = await skillHienHanh(g.phong_ban as PhongBan);
      const r = await sb.from('tt_skill').insert(themOrg({ phong_ban: g.phong_ban, phien_ban: cu.phien_ban + 1,
        noi_dung: `${cu.noi_dung}\n- ${g.noi_dung}`, ly_do: `Học từ quyết định: ${g.nguon ?? ''}`, tao_boi: n.id }, await toChucHienTai()));
      if (r.error) throw new Error(r.error.message);
    }
    await sb.from('tt_skill_goi_y').update({ trang_thai: nhan ? 'da_nhan' : 'bo_qua', xu_ly_boi: n.id }).eq('org_id', await toChucHienTai()).eq('id', id);
    revalidatePath('/tuan-thu/agent');
    return { ok: true, thongBao: nhan ? 'Đã thêm vào skill.' : 'Đã bỏ qua.' };
  });
}

/** Kiểm tra kết nối Claude API: key, model, thời gian phản hồi, và đọc được PDF. */
export async function kiemTraClaude(): Promise<KQ> {
  return lam(async () => {
    await batBuoc();
    const t0 = Date.now();
    const tl = await goiClaude('Trả lời đúng một từ.', [{ role: 'user', content: 'Trả lời: OK' }], 20);
    const ms1 = Date.now() - t0;
    // PDF nhỏ dựng sẵn để kiểm tra khả năng đọc tài liệu
    const pdf = Buffer.from('JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAzMDAgMTAwXS9Db250ZW50cyA0IDAgUi9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNSAwIFI+Pj4+Pj4KZW5kb2JqCjQgMCBvYmoKPDwvTGVuZ3RoIDQ3Pj5zdHJlYW0KQlQgL0YxIDE4IFRmIDIwIDQwIFRkIChIT1AgRE9ORyBURVNUIDEyMykgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYT4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1NCAwMDAwMCBuIAowMDAwMDAwMTA1IDAwMDAwIG4gCjAwMDAwMDAyMTcgMDAwMDAgbiAKMDAwMDAwMDMxMSAwMDAwMCBuIAp0cmFpbGVyCjw8L1NpemUgNi9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjM3NAolJUVPRgo=', 'base64');
    const t1 = Date.now();
    const j: any = await goiMoHinh({ max_tokens: 60, messages: [{ role: 'user', content: [
      { type: 'document', title: 'kiem-tra.pdf', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
      { type: 'text', text: 'Chép lại đúng dòng chữ trong tài liệu.' }] }] }).catch((e) => { throw new Error(`Gọi thường OK (${ms1}ms) nhưng đọc PDF lỗi: ${e instanceof Error ? e.message : e}`); });
    const pdfTxt = (j.content ?? []).map((b: any) => b.text ?? '').join(' ').trim();
    return { ok: true, thongBao: `${NHA_CUNG_CAP() === 'openai' ? 'OpenAI' : 'Claude'} · model ${MODEL()} · trả lời "${tl}" sau ${ms1}ms · đọc PDF: "${pdfTxt}" sau ${Date.now() - t1}ms` };
  });
}
