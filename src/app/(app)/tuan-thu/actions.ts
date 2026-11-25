'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { sendMail } from '@/lib/google/gmail';
import { refSubject, tplBangKe } from '@/lib/email-templates';
import { periodFull } from '@/lib/period';
import { signedUrl } from '@/lib/storage';
import { batBuoc, BuocDuyet, duocLam, gopSau, nguoiTT, thamSoHieuLuc, BUCKET_TT, dsDangChan } from '@/lib/tuan-thu/db';
import { docDongLanChay, luuTep, xuLyLanChay } from '@/lib/tuan-thu/xu-ly';
import { deXuatBuoc, textDeXuat } from '@/lib/tuan-thu/de-xuat';
import { PhongBan, TEN_PHONG_BAN } from '@/lib/tuan-thu/types';
import { baoChoPhongBan } from '@/lib/tuan-thu/thong-bao';

type KQ = { ok: true; id?: string; thongBao?: string } | { ok: false; loi: string };
const loi = (e: unknown): KQ => ({ ok: false, loi: e instanceof Error ? e.message : String(e) });
const lam = async (fn: () => Promise<KQ>): Promise<KQ> => { try { return await fn(); } catch (e) { return loi(e); } };

async function ghiRaw(lanId: string, maKhach: string, thang: string, files: File[], daTai: { path: string; ten: string }[] = []) {
  const paths: Record<string, string> = {}, ten: Record<string, string> = {};
  for (const t of daTai) { const k = `tep_${Object.keys(paths).length + 1}`; paths[k] = t.path; ten[k] = t.ten; }
  for (const f of files) {
    if (!f || !f.size) continue;
    const buf = Buffer.from(await f.arrayBuffer());
    const safe = f.name.normalize('NFC').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 120);
    const p = `tuan-thu/${maKhach}/${thang}/${lanId}/raw/${Date.now().toString(36)}_${safe}`;
    await luuTep(p, buf);
    const k = `tep_${Object.keys(paths).length + 1}`;
    paths[k] = p; ten[k] = f.name;
  }
  if (!Object.keys(paths).length) throw new Error('Chưa chọn file raw.');
  return { paths, ten };
}

// ---------------------------------------------------------------------
// Lần chạy bảng kê
// ---------------------------------------------------------------------
export async function taoLanChay(fd: FormData): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc('ke_toan');
    const sb = supabaseAdmin();
    const hopDongId = String(fd.get('hop_dong_id') ?? '');
    const thang = String(fd.get('thang') ?? '');
    const dotS = String(fd.get('dot') ?? '');
    if (!/^\d{4}-\d{2}$/.test(thang)) throw new Error('Chọn tháng.');
    const { data: hd } = await sb.from('tt_hop_dong').select('*').eq('id', hopDongId).single();
    if (!hd) throw new Error('Không tìm thấy hợp đồng.');
    if (hd.trang_thai && hd.trang_thai !== 'hieu_luc') throw new Error('Hợp đồng chưa kích hoạt — 4 head phải chốt quy tắc và CEO kích hoạt trước.');
    const { phien_ban } = await thamSoHieuLuc(hopDongId, thang);
    const { data: lc, error } = await sb.from('tt_lan_chay').insert({
      hop_dong_id: hopDongId, thang, dot: dotS ? Number(dotS) : null, phien_ban_quy_tac: phien_ban, created_by: n.id,
    }).select('id').single();
    if (error || !lc) throw new Error(error?.message ?? 'Không tạo được lần chạy.');
    try {
      const { paths, ten } = await ghiRaw(lc.id, hd.ma_khach, thang, fd.getAll('raw') as File[], tepDaTai(fd, 'raw_json'));
      await sb.from('tt_lan_chay').update({ raw_paths: paths, raw_ten: ten }).eq('id', lc.id);
      await xuLyLanChay(lc.id);
      await baoChoPhongBan(lc.id, ['demand', 'supply'], 'xu_ly');
    } catch (e) {
      await sb.from('tt_lan_chay').update({ loi: e instanceof Error ? e.message : String(e) }).eq('id', lc.id);
    }
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.tao_lan_chay', entity: 'tt_lan_chay', entityId: lc.id, after: { thang, dot: dotS } });
    revalidatePath('/tuan-thu');
    return { ok: true, id: lc.id };
  });
}

/** Kế toán tự sửa raw rồi tải lại: xử lý lại từ đầu, mọi duyệt trước đó mất hiệu lực (vòng mới). */
export async function taiLaiRaw(fd: FormData): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc('ke_toan');
    const sb = supabaseAdmin();
    const id = String(fd.get('id'));
    const { data: lc } = await sb.from('tt_lan_chay').select('*, tt_hop_dong(ma_khach)').eq('id', id).single();
    if (!lc) throw new Error('Không tìm thấy lần chạy.');
    if (lc.buoc === 'da_gui') throw new Error('Bảng kê đã gửi, không tải lại được. Tạo lần chạy mới.');
    const { paths, ten } = await ghiRaw(id, (lc as any).tt_hop_dong.ma_khach, lc.thang, fd.getAll('raw') as File[], tepDaTai(fd, 'raw_json'));
    const { phien_ban } = await thamSoHieuLuc(lc.hop_dong_id, lc.thang);
    await sb.from('tt_lan_chay').update({ raw_paths: paths, raw_ten: ten, vong: lc.vong + 1, buoc: 'cho_ke_toan', phien_ban_quy_tac: phien_ban }).eq('id', id);
    await xuLyLanChay(id);
    await baoChoPhongBan(id, ['demand', 'supply'], 'xu_ly');
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.tai_lai_raw', entity: 'tt_lan_chay', entityId: id });
    revalidatePath(`/tuan-thu/chay/${id}`);
    return { ok: true, thongBao: 'Đã xử lý lại raw. Các duyệt trước đó cần làm lại.' };
  });
}

export async function xacNhanThayDoi(lanId: string, ids: number[] | 'tat_ca'): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc('ke_toan');
    const sb = supabaseAdmin();
    let q = sb.from('tt_thay_doi').update({ xac_nhan: true, xac_nhan_boi: n.id, xac_nhan_luc: new Date().toISOString() }).eq('lan_chay_id', lanId);
    if (ids !== 'tat_ca') q = q.in('id', ids);
    const { error } = await q; if (error) throw new Error(error.message);
    revalidatePath(`/tuan-thu/chay/${lanId}`);
    return { ok: true };
  });
}

export async function luuGiaiTrinh(canhBaoId: number, text: string): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc('ke_toan');
    const sb = supabaseAdmin();
    const { data: cb } = await sb.from('tt_canh_bao').select('lan_chay_id').eq('id', canhBaoId).single();
    if (!cb) throw new Error('Không tìm thấy cảnh báo.');
    await sb.from('tt_canh_bao').update({ giai_trinh: text.trim() || null, giai_trinh_boi: n.id, giai_trinh_luc: new Date().toISOString() }).eq('id', canhBaoId);
    revalidatePath(`/tuan-thu/chay/${cb.lan_chay_id}`);
    return { ok: true };
  });
}

/**
 * Quy trình: kế toán duyệt → CEO duyệt & gửi.
 * Demand và Supply không duyệt; họ chỉ TRẢ VỀ kế toán (khi chưa gửi) hoặc CHẶN (xem chanLanChay).
 */
const BUOC_DANG: Record<BuocDuyet, string[]> = { ke_toan: ['cho_ke_toan'], demand: ['cho_ke_toan', 'cho_ceo'], supply: ['cho_ke_toan', 'cho_ceo'], ceo: ['cho_ceo'] };


export async function duyetBuoc(lanId: string, buoc: BuocDuyet, quyetDinh: 'duyet' | 'tra_ve', yKien: string): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc(buoc as PhongBan);
    const sb = supabaseAdmin();
    const { data: lc } = await sb.from('tt_lan_chay').select('*').eq('id', lanId).single();
    if (!lc) throw new Error('Không tìm thấy lần chạy.');
    if (lc.loi) throw new Error('Lần chạy đang lỗi xử lý raw, hãy tải lại raw.');
    if (!BUOC_DANG[buoc].includes(lc.buoc)) throw new Error('Lần chạy không ở bước này.');
    if ((buoc === 'demand' || buoc === 'supply') && quyetDinh === 'duyet') throw new Error('Demand và Supply không duyệt bảng kê — chỉ chặn hoặc trả về khi cần.');
    if (quyetDinh === 'tra_ve' && !yKien.trim()) throw new Error('Trả về phải ghi lý do.');

    const [{ data: cb }, { data: td }, { data: dy }] = await Promise.all([
      sb.from('tt_canh_bao').select('*').eq('lan_chay_id', lanId),
      sb.from('tt_thay_doi').select('xac_nhan, ma_quy_tac, cot').eq('lan_chay_id', lanId),
      sb.from('tt_duyet').select('buoc, quyet_dinh').eq('lan_chay_id', lanId).eq('vong', lc.vong),
    ]);
    const chan = await dsDangChan(lanId);
    const dx = deXuatBuoc(buoc, (cb ?? []) as any, (td ?? []) as any, (dy ?? []) as any, chan);
    // Điều kiện cứng: không duyệt được khi còn việc bắt buộc (chỉ cho phép ghi đè ở bước demand/supply bằng ý kiến)
    if (quyetDinh === 'duyet' && dx.ket_luan === 'tra_ve' && (buoc === 'ke_toan' || buoc === 'ceo'))
      throw new Error('Chưa đủ điều kiện duyệt: ' + dx.ly_do.join(' '));
    if (quyetDinh === 'duyet' && dx.ket_luan === 'tra_ve' && !yKien.trim())
      throw new Error('Duyệt khác đề xuất của agent phải ghi ý kiến.');

    // Phiên bản skill đang dùng (SQL 39); chưa chạy SQL 39 thì bỏ qua cột này
    const { data: sk } = await sb.from('tt_skill').select('phien_ban').eq('phong_ban', buoc).order('phien_ban', { ascending: false }).limit(1);
    const dongDuyet: any = { lan_chay_id: lanId, vong: lc.vong, buoc, quyet_dinh: quyetDinh, y_kien: yKien.trim() || null,
      de_xuat_agent: textDeXuat(dx), nguoi: n.id, nguoi_email: n.email };
    if (sk?.length) dongDuyet.skill_phien_ban = sk[0].phien_ban;
    let ins = await sb.from('tt_duyet').insert(dongDuyet).select('id').single();
    if (ins.error && /skill_phien_ban/.test(ins.error.message)) { delete dongDuyet.skill_phien_ban; ins = await sb.from('tt_duyet').insert(dongDuyet).select('id').single(); }
    if (ins.error) throw new Error(ins.error.message);
    // Học từ quyết định: head duyệt trong khi agent AI (lần rà soát mới nhất của bước này) đề xuất trả về
    const { data: aiMoi } = await sb.from('tt_ai_ket_qua').select('noi_dung').eq('lan_chay_id', lanId).eq('vong', lc.vong)
      .eq('loai', 'ra_soat').eq('phong_ban', buoc).order('luc', { ascending: false }).limit(1);
    const aiTraVe = !!aiMoi?.[0]?.noi_dung && /^\s*\**\s*ĐỀ XUẤT TRẢ VỀ/i.test(aiMoi[0].noi_dung);
    if (quyetDinh === 'duyet' && aiTraVe && yKien.trim()) {
      await sb.from('tt_skill_goi_y').insert({ phong_ban: buoc, lan_chay_id: lanId, nguon: `Duyệt khác agent AI · ${lc.thang}${lc.dot ? ` đợt ${lc.dot}` : ''}`,
        noi_dung: `Agent AI đề xuất trả về nhưng head đã duyệt với lý do: ${yKien.trim()}. Lần sau cân nhắc tình huống này là ngoại lệ hợp lệ nếu cùng điều kiện.` });
    }
    if (quyetDinh === 'duyet' && dx.ket_luan === 'tra_ve' && yKien.trim()) {
      await sb.from('tt_skill_goi_y').insert({ phong_ban: buoc, lan_chay_id: lanId, nguon: `Duyệt khác đề xuất · ${lc.thang}${lc.dot ? ` đợt ${lc.dot}` : ''}`,
        noi_dung: `Tình huống: ${dx.ly_do.join(' ')} — head đã duyệt với lý do: ${yKien.trim()}. Lần sau coi là ngoại lệ hợp lệ nếu cùng điều kiện.` });
    }

    if (quyetDinh === 'tra_ve') {
      await sb.from('tt_lan_chay').update({ buoc: 'cho_ke_toan', vong: lc.vong + 1 }).eq('id', lanId);
    } else if (buoc === 'ceo') {
      try { await guiBangKe(lanId); }
      catch (e) {
        // Gửi thất bại: bỏ dòng duyệt vừa ghi để CEO bấm lại sau khi sửa nguyên nhân
        if (ins.data?.id) await sb.from('tt_duyet').delete().eq('id', ins.data.id);
        const m = e instanceof Error ? e.message : String(e);
        if (/invalid_grant/i.test(m)) throw new Error('Chưa gửi được: kết nối Gmail của hệ thống đã hết hiệu lực (invalid_grant). Admin vào Cài đặt → Kết nối lại Google bằng hộp thư gửi (cs@uts.network), rồi CEO bấm duyệt lại. Bảng kê vẫn đang chờ CEO.');
        throw new Error(`Chưa gửi được bảng kê: ${m}. Bảng kê vẫn đang chờ CEO.`);
      }
    } else {
      await sb.from('tt_lan_chay').update({ buoc: 'cho_ceo' }).eq('id', lanId);
      await baoChoPhongBan(lanId, ['ceo', 'demand', 'supply'], 'cho_ceo');
    }
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: `tuan_thu.${quyetDinh}`, entity: 'tt_lan_chay', entityId: lanId, after: { buoc, yKien } });
    revalidatePath(`/tuan-thu/chay/${lanId}`); revalidatePath('/tuan-thu');
    return { ok: true, thongBao: buoc === 'ceo' && quyetDinh === 'duyet' ? 'Đã duyệt và gửi bảng kê cho khách.' : undefined };
  });
}

/**
 * Thư gửi bảng kê — dùng đúng mẫu của WF1 (refSubject + tplBangKe), đính kèm file bảng kê.
 * Phạm vi đợt lấy từ lịch gửi của nhóm Master Data (pham_vi_nhan) nếu có, không thì tính theo kỳ của lần chạy.
 * Không truyền linkBangKe (xem trước) thì nút "Xem bảng kê" trỏ tạm về '#'.
 */
export async function thongTinGui(lanId: string, linkBangKe?: string) {
  const sb = supabaseAdmin();
  const { data: lc } = await sb.from('tt_lan_chay').select('*, tt_hop_dong(*, billing_groups(*))').eq('id', lanId).single();
  const hd: any = (lc as any)?.tt_hop_dong; const g: any = hd?.billing_groups;
  const to = g?.email_l1 ?? '';
  const cc = [g?.email_ke_toan, g?.email_cc, g?.email_pm, hd?.cc_them].filter((x) => x && String(x).includes('@')).join(',');
  const [y, m] = String(lc?.thang ?? '').split('-');
  const ky = `T${m}.${y}`;
  let phamVi: string | null = null;
  if (lc?.dot) {
    if (g?.id) {
      const { data: lich } = await sb.from('billing_schedules').select('pham_vi_nhan').eq('group_id', g.id).eq('dot', lc.dot).limit(1);
      phamVi = (lich ?? [])[0]?.pham_vi_nhan ?? null;
    }
    if (!phamVi) {
      const nk = String((lc?.tong_hop as any)?.nhan_ky ?? '').match(/(\d{2})\/(\d{2})\/\d{4}.*?(\d{2})\/(\d{2})\/\d{4}/);
      phamVi = nk ? `Đợt ${lc.dot}: ${nk[1]}/${nk[2]}–${nk[3]}/${nk[4]}` : `Đợt ${lc.dot}`;
    }
  }
  const tenNhom = g?.ten_nhom ?? hd?.ten_khach ?? '';
  const subject = refSubject(tenNhom, periodFull(ky, phamVi, lc?.dot ?? undefined));
  const html = tplBangKe(tenNhom, ky, linkBangKe ?? '#', phamVi, 1);
  return { lc, hd, g, to, cc, subject, html };
}

async function guiBangKe(lanId: string) {
  const sb = supabaseAdmin();
  const { data: lc0 } = await sb.from('tt_lan_chay').select('bang_ke_path').eq('id', lanId).single();
  if (!lc0?.bang_ke_path) throw new Error('Chưa có file bảng kê.');
  const tenTep = lc0.bang_ke_path.split('/').pop()!;
  const link = await signedUrl(lc0.bang_ke_path, tenTep);
  const { to, cc, subject, html } = await thongTinGui(lanId, link);
  if (!to.includes('@')) throw new Error('Hợp đồng chưa gắn nhóm Master Data có email đầu mối khách (email_l1). Gắn ở trang Hợp đồng & quy tắc.');
  const { data } = await sb.storage.from(BUCKET_TT).download(lc0.bang_ke_path);
  if (!data) throw new Error('Không tải được file bảng kê.');
  const sent = await sendMail({ to, cc: cc || undefined, subject, html,
    attachments: [{ filename: tenTep, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: Buffer.from(await data.arrayBuffer()) }] });
  await sb.from('tt_lan_chay').update({ buoc: 'da_gui', gui_luc: new Date().toISOString(), gui_den: to, gui_cc: cc, thread_id: sent.threadId }).eq('id', lanId);
}

// ---------------------------------------------------------------------
// Hợp đồng, quy tắc, sửa đổi
// ---------------------------------------------------------------------
export async function chotQuyTac(id: string, chot: 'dong_y' | 'can_sua' | 'cho', yKien: string): Promise<KQ> {
  return lam(async () => {
    const sb = supabaseAdmin();
    const { data: qt } = await sb.from('tt_quy_tac').select('phong_ban').eq('id', id).single();
    if (!qt) throw new Error('Không tìm thấy quy tắc.');
    const n = await batBuoc(qt.phong_ban as PhongBan);
    await sb.from('tt_quy_tac').update({ chot, chot_y_kien: yKien.trim() || null, chot_boi: n.id, chot_luc: new Date().toISOString() }).eq('id', id);
    revalidatePath('/tuan-thu/quy-tac');
    return { ok: true };
  });
}

export async function capNhatHopDong(id: string, groupId: string | null, ccThem: string): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc();
    if (!n.laAdmin) throw new Error('Chỉ admin sửa thông tin hợp đồng.');
    const { error } = await supabaseAdmin().from('tt_hop_dong').update({ group_id: groupId || null, cc_them: ccThem.trim() || null }).eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath('/tuan-thu/quy-tac');
    return { ok: true };
  });
}

function vaThamSo(fd: FormData): any | null {
  const loai = String(fd.get('loai_tham_so') ?? '');
  const so = (k: string) => Number(String(fd.get(k) ?? '').replace(/[^\d.]/g, ''));
  switch (loai) {
    case 'ky_hai_dot': { const c = so('ngay_cat'); if (!(c >= 1 && c <= 27)) throw new Error('Ngày cắt đợt 1 phải từ 1 đến 27.'); return { ky: { kieu: 'hai_dot', ngay_cat: c } }; }
    case 'ky_thang': return { ky: { kieu: 'thang' } };
    case 'chiet_khau': return { ty_le_chiet_khau: { khach_san: so('ck_ks') / 100, ve_may_bay: so('ck_vmb') / 100 } };
    case 'phi': return { phi_dich_vu: { khach_san: so('phi_ks'), ve_may_bay: so('phi_vmb') } };
    case 'tai_khoan': return { tai_khoan: { so: String(fd.get('tk_so') ?? '').trim(), ngan_hang: String(fd.get('tk_ngan_hang') ?? '').trim() } };
    case 'han_muc': return { han_muc_thang: so('han_muc') };
    case 'json': { try { return JSON.parse(String(fd.get('json') ?? '{}')); } catch { throw new Error('JSON tham số không hợp lệ.'); } }
    default: return null;
  }
}

export async function deXuatSuaDoi(fd: FormData): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc();
    const pb = (n.phong_ban ?? String(fd.get('phong_ban') ?? '')) as PhongBan;
    if (!duocLam(n, pb)) throw new Error('Chọn phòng ban đề xuất.');
    const sb = supabaseAdmin();
    const hopDongId = String(fd.get('hop_dong_id')), ma = String(fd.get('ma_quy_tac'));
    const { data: qt } = await sb.from('tt_quy_tac').select('*').eq('hop_dong_id', hopDongId).eq('ma', ma).single();
    if (!qt) throw new Error('Không tìm thấy quy tắc.');
    const moi = String(fd.get('noi_dung_moi') ?? '').trim(), lyDo = String(fd.get('ly_do') ?? '').trim();
    const hieuLuc = String(fd.get('hieu_luc_tu') ?? '');
    if (!moi || !lyDo) throw new Error('Nhập nội dung mới và lý do.');
    if (!/^\d{4}-\d{2}$/.test(hieuLuc)) throw new Error('Chọn tháng bắt đầu hiệu lực.');
    const { count } = await sb.from('tt_sua_doi').select('id', { count: 'exact', head: true }).eq('hop_dong_id', hopDongId);
    const { data: sd, error } = await sb.from('tt_sua_doi').insert({
      hop_dong_id: hopDongId, so: (count ?? 0) + 1, ma_quy_tac: ma, phong_ban: pb,
      noi_dung_goc: `${qt.noi_dung}${qt.gia_tri ? ` — ${qt.gia_tri}` : ''}`, noi_dung_moi: moi,
      gia_tri_moi: String(fd.get('gia_tri_moi') ?? '').trim() || null, thay_doi_tham_so: vaThamSo(fd),
      ly_do: lyDo, can_cu: String(fd.get('can_cu') ?? '').trim() || null, hieu_luc_tu: hieuLuc, de_xuat_boi: n.id,
    }).select('id').single();
    if (error || !sd) throw new Error(error?.message ?? 'Không lưu được đề xuất.');
    await sb.from('tt_sua_doi_duyet').insert({ sua_doi_id: sd.id, phong_ban: pb, quyet_dinh: 'dong_y', y_kien: 'Phòng đề xuất', nguoi: n.id });
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.de_xuat_sua_doi', entity: 'tt_sua_doi', entityId: sd.id });
    revalidatePath('/tuan-thu/sua-doi');
    return { ok: true, id: sd.id };
  });
}

export async function duyetSuaDoi(id: string, pb: PhongBan, quyetDinh: 'dong_y' | 'khong_dong_y', yKien: string): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc(pb);
    const sb = supabaseAdmin();
    const { data: sd } = await sb.from('tt_sua_doi').select('*').eq('id', id).single();
    if (!sd) throw new Error('Không tìm thấy đề xuất.');
    if (sd.trang_thai !== 'cho_duyet') throw new Error('Đề xuất đã chốt.');
    if (quyetDinh === 'khong_dong_y' && !yKien.trim()) throw new Error('Không đồng ý phải ghi lý do.');
    await sb.from('tt_sua_doi_duyet').upsert({ sua_doi_id: id, phong_ban: pb, quyet_dinh: quyetDinh, y_kien: yKien.trim() || null, nguoi: n.id, luc: new Date().toISOString() });
    const { data: ds } = await sb.from('tt_sua_doi_duyet').select('phong_ban, quyet_dinh').eq('sua_doi_id', id);
    let thongBao: string | undefined;
    if ((ds ?? []).some((d: any) => d.quyet_dinh === 'khong_dong_y')) {
      await sb.from('tt_sua_doi').update({ trang_thai: 'tu_choi' }).eq('id', id);
      thongBao = 'Đề xuất bị từ chối.';
    } else if ((['ke_toan', 'supply', 'demand', 'ceo'] as PhongBan[]).every((p) => (ds ?? []).some((d: any) => d.phong_ban === p && d.quyet_dinh === 'dong_y'))) {
      // Đủ 4/4: áp lên bộ tham số (phiên bản mới) và cập nhật quy tắc dạng chữ
      const { data: cuoi } = await sb.from('tt_bo_quy_tac').select('*').eq('hop_dong_id', sd.hop_dong_id).order('phien_ban', { ascending: false }).limit(1).single();
      if (sd.thay_doi_tham_so) {
        await sb.from('tt_bo_quy_tac').insert({ hop_dong_id: sd.hop_dong_id, phien_ban: (cuoi?.phien_ban ?? 0) + 1,
          tham_so: gopSau(cuoi?.tham_so ?? {}, sd.thay_doi_tham_so), hieu_luc_tu: sd.hieu_luc_tu,
          ghi_chu: `SĐ-${String(sd.so).padStart(2, '0')} (${sd.ma_quy_tac}): ${sd.noi_dung_moi}` });
      }
      await sb.from('tt_quy_tac').update({ noi_dung: sd.noi_dung_moi, ...(sd.gia_tri_moi ? { gia_tri: sd.gia_tri_moi } : {}),
        can_cu: `SĐ-${String(sd.so).padStart(2, '0')} hiệu lực từ ${sd.hieu_luc_tu}${sd.can_cu ? ` — ${sd.can_cu}` : ''}`, chot: 'dong_y' })
        .eq('hop_dong_id', sd.hop_dong_id).eq('ma', sd.ma_quy_tac);
      await sb.from('tt_sua_doi').update({ trang_thai: 'hieu_luc' }).eq('id', id);
      thongBao = 'Đủ 4/4 head đồng ý — sửa đổi đã có hiệu lực.';
    }
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: `tuan_thu.sua_doi_${quyetDinh}`, entity: 'tt_sua_doi', entityId: id, after: { pb, yKien } });
    revalidatePath('/tuan-thu/sua-doi'); revalidatePath('/tuan-thu/quy-tac');
    return { ok: true, thongBao };
  });
}

export async function ganThanhVien(userId: string, phongBan: string): Promise<KQ> {
  return lam(async () => {
    const n = await nguoiTT();
    if (!n?.laAdmin) throw new Error('Chỉ admin phân quyền.');
    const sb = supabaseAdmin();
    const { error } = phongBan
      ? await sb.from('tt_thanh_vien').upsert({ user_id: userId, phong_ban: phongBan })
      : await sb.from('tt_thanh_vien').delete().eq('user_id', userId);
    if (error) throw new Error(error.message);
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.gan_thanh_vien', entity: 'tt_thanh_vien', entityId: userId, after: { phongBan } });
    revalidatePath('/tuan-thu/thanh-vien');
    return { ok: true, thongBao: phongBan ? `Đã gán ${TEN_PHONG_BAN[phongBan as PhongBan]}.` : 'Đã bỏ quyền.' };
  });
}

// ---------------------------------------------------------------------
// Demand / Supply kiểm soát: chặn và gỡ chặn
// ---------------------------------------------------------------------
export async function chanLanChay(lanId: string, pb: 'demand' | 'supply', lyDo: string): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc(pb);
    if (!lyDo.trim()) throw new Error('Chặn phải ghi lý do.');
    const sb = supabaseAdmin();
    const { data: lc } = await sb.from('tt_lan_chay').select('buoc').eq('id', lanId).single();
    if (!lc) throw new Error('Không tìm thấy lần chạy.');
    if (lc.buoc === 'da_gui') throw new Error('Bảng kê đã gửi, không chặn được nữa.');
    const { error } = await sb.from('tt_chan').insert({ lan_chay_id: lanId, phong_ban: pb, ly_do: lyDo.trim(), nguoi: n.id, nguoi_email: n.email });
    if (error) throw new Error(/tt_chan/.test(error.message) ? 'Cần chạy supabase/migrations/40_tuan_thu_chan.sql.' : error.message);
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.chan', entity: 'tt_lan_chay', entityId: lanId, after: { pb, lyDo } });
    await baoChoPhongBan(lanId, ['ke_toan', 'ceo'], 'chan', `${TEN_PHONG_BAN[pb]} chặn: ${lyDo.trim()}`);
    revalidatePath(`/tuan-thu/chay/${lanId}`); revalidatePath('/tuan-thu');
    return { ok: true, thongBao: 'Đã chặn. CEO không duyệt được cho tới khi gỡ chặn.' };
  });
}

export async function goChan(chanId: number, ghiChu: string): Promise<KQ> {
  return lam(async () => {
    const sb = supabaseAdmin();
    const { data: c } = await sb.from('tt_chan').select('*').eq('id', chanId).single();
    if (!c) throw new Error('Không tìm thấy lần chặn.');
    const n = await batBuoc(c.phong_ban as PhongBan);
    if (c.go_luc) throw new Error('Đã gỡ trước đó.');
    await sb.from('tt_chan').update({ go_luc: new Date().toISOString(), go_boi: n.id, go_email: n.email, go_ghi_chu: ghiChu.trim() || null }).eq('id', chanId);
    // Học từ quyết định: chặn rồi gỡ kèm cách xử lý → gợi ý bổ sung skill cho phòng đó
    if (ghiChu.trim()) await sb.from('tt_skill_goi_y').insert({ phong_ban: c.phong_ban, lan_chay_id: c.lan_chay_id, nguon: 'Chặn rồi gỡ chặn',
      noi_dung: `Từng chặn vì: ${c.ly_do} — gỡ sau khi: ${ghiChu.trim()}. Lần sau gặp tình huống tương tự, kiểm tra điều kiện gỡ này trước khi đề xuất chặn.` });
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.go_chan', entity: 'tt_lan_chay', entityId: c.lan_chay_id, after: { ghiChu } });
    await baoChoPhongBan(c.lan_chay_id, ['ke_toan', 'ceo'], 'go_chan', `${TEN_PHONG_BAN[c.phong_ban as PhongBan]} đã gỡ chặn${ghiChu.trim() ? `: ${ghiChu.trim()}` : ''}`);
    revalidatePath(`/tuan-thu/chay/${c.lan_chay_id}`); revalidatePath('/tuan-thu');
    return { ok: true, thongBao: 'Đã gỡ chặn.' };
  });
}

// ---------------------------------------------------------------------
// Kế toán sửa tay ô bảng kê (thường làm qua agent)
// ---------------------------------------------------------------------
export async function suaBangKe(lanId: string, thayDoi: { loai: 'khach_san' | 've_may_bay'; dong: number; cot: string; gia_tri_moi: string }[], lyDo: string): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc('ke_toan');
    if (!lyDo.trim()) throw new Error('Sửa bảng kê phải ghi lý do.');
    if (!thayDoi.length) throw new Error('Không có ô nào cần sửa.');
    const sb = supabaseAdmin();
    const { data: lc } = await sb.from('tt_lan_chay').select('*').eq('id', lanId).single();
    if (!lc) throw new Error('Không tìm thấy lần chạy.');
    if (lc.buoc === 'da_gui') throw new Error('Bảng kê đã gửi, không sửa được. Tạo lần chạy mới.');
    const dong = await docDongLanChay(lanId);
    const rows = thayDoi.map((t) => {
      const d = dong.find((x) => x.loai === t.loai && x.dong === Number(t.dong));
      if (!d) throw new Error(`Không có dòng ${t.dong} (${t.loai}) trong raw.`);
      if (!(t.cot in d.v)) throw new Error(`Raw không có cột "${t.cot}".`);
      const cu = d.v[t.cot];
      return { lan_chay_id: lanId, loai: t.loai, dong: Number(t.dong), cot: t.cot, gia_tri_cu: cu === null || cu === undefined ? null : String(cu instanceof Date ? cu.toISOString().slice(0, 10) : cu),
        gia_tri_moi: String(t.gia_tri_moi ?? ''), ly_do: lyDo.trim(), nguoi: n.id, nguoi_email: n.email };
    });
    const { error } = await sb.from('tt_sua_tay').insert(rows);
    if (error) throw new Error(/tt_sua_tay/.test(error.message) ? 'Cần chạy supabase/migrations/42_tuan_thu_agent_hanh_dong.sql.' : error.message);
    await sb.from('tt_lan_chay').update({ vong: lc.vong + 1, buoc: 'cho_ke_toan' }).eq('id', lanId);
    await xuLyLanChay(lanId);
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.sua_tay', entity: 'tt_lan_chay', entityId: lanId, after: { thayDoi, lyDo } });
    revalidatePath(`/tuan-thu/chay/${lanId}`); revalidatePath('/tuan-thu');
    return { ok: true, thongBao: `Đã sửa ${rows.length} ô và xử lý lại bảng kê (vòng ${lc.vong + 1}).` };
  });
}

// ---------------------------------------------------------------------
// Thêm hợp đồng / khách mới
// ---------------------------------------------------------------------
export async function taoHopDong(fd: FormData): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc();
    const sb = supabaseAdmin();
    const ma = String(fd.get('ma_khach') ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const ten = String(fd.get('ten_khach') ?? '').trim();
    const so = String(fd.get('so_hop_dong') ?? '').trim();
    const hieuLuc = String(fd.get('hieu_luc_tu') ?? '');
    if (!ma || !ten || !so) throw new Error('Nhập mã khách, tên khách và số hợp đồng.');
    if (!/^\d{4}-\d{2}$/.test(hieuLuc)) throw new Error('Chọn tháng bắt đầu áp dụng.');
    const daTai = tepDaTai(fd, 'tep_json');
    const files = (fd.getAll('tep') as File[]).filter((f) => f && f.size);
    if (!files.length && !daTai.length) throw new Error('Chọn file PDF hợp đồng (và phụ lục).');
    if (files.some((f) => !/\.pdf$/i.test(f.name))) throw new Error('Chỉ nhận file PDF.');
    const { data: hd, error } = await sb.from('tt_hop_dong').insert({
      ma_khach: ma, ten_khach: ten, so_hop_dong: so, ngay_ky: String(fd.get('ngay_ky') ?? '') || null,
      ten_cong_ty_raw: String(fd.get('ten_cong_ty_raw') ?? '').trim() || ten, group_id: String(fd.get('group_id') ?? '') || null,
      cc_them: String(fd.get('cc_them') ?? '').trim() || null, hieu_luc_tu: hieuLuc, trang_thai: 'dang_doc', tao_boi: n.id,
    }).select('id').single();
    if (error || !hd) throw new Error(/duplicate|unique/i.test(error?.message ?? '') ? 'Khách này đã có hợp đồng cùng số.' : /column/.test(error?.message ?? '') ? 'Cần chạy supabase/migrations/43_tuan_thu_them_hop_dong.sql.' : error?.message ?? 'Không tạo được hợp đồng.');
    const teps: { path: string; ten: string }[] = [...daTai];
    for (const f of files) {
      const p = `tuan-thu/${ma}/hop-dong/${hd.id}/${Date.now().toString(36)}_${f.name.normalize('NFC').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 120)}`;
      await luuTep(p, Buffer.from(await f.arrayBuffer()), 'application/pdf');
      teps.push({ path: p, ten: f.name });
    }
    await sb.from('tt_hop_dong').update({ tep_hop_dong: teps }).eq('id', hd.id);
    // Danh mục phòng ban (tùy chọn): mỗi dòng "Tên phòng ban;mã cost center"
    const pb = String(fd.get('phong_ban') ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
      .map((x, i) => { const [t, m] = x.split(/[;\t]/); return { hop_dong_id: hd.id, ten: t.trim(), ma_cost_center: m?.trim() || null, thu_tu: i + 1 }; });
    if (pb.length) await sb.from('tt_phong_ban_khach').upsert(pb);
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.tao_hop_dong', entity: 'tt_hop_dong', entityId: hd.id, after: { ma, so } });
    revalidatePath('/tuan-thu/quy-tac');
    return { ok: true, id: hd.id };
  });
}

export async function kichHoatHopDong(id: string): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc();
    if (!n.laAdmin && n.phong_ban !== 'ceo') throw new Error('Chỉ CEO hoặc admin kích hoạt hợp đồng.');
    const sb = supabaseAdmin();
    const { data: hd } = await sb.from('tt_hop_dong').select('trang_thai').eq('id', id).single();
    if (hd?.trang_thai !== 'cho_chot') throw new Error('Hợp đồng không ở trạng thái chờ chốt.');
    const { data: qt } = await sb.from('tt_quy_tac').select('phong_ban, chot').eq('hop_dong_id', id);
    const chua = (qt ?? []).filter((q: any) => q.chot !== 'dong_y');
    if (!(qt ?? []).length) throw new Error('Chưa có quy tắc nào.');
    if (chua.length) throw new Error(`Còn ${chua.length} quy tắc chưa được head đồng ý (${[...new Set(chua.map((q: any) => TEN_PHONG_BAN[q.phong_ban as PhongBan]))].join(', ')}).`);
    await sb.from('tt_hop_dong').update({ trang_thai: 'hieu_luc' }).eq('id', id);
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.kich_hoat_hop_dong', entity: 'tt_hop_dong', entityId: id });
    revalidatePath('/tuan-thu/quy-tac'); revalidatePath('/tuan-thu');
    return { ok: true, thongBao: 'Đã kích hoạt — chạy bảng kê được theo hợp đồng này.' };
  });
}

/** Sửa tham số máy khi hợp đồng còn là bản nháp (sau khi kích hoạt phải đi luồng sửa đổi 4/4). */
export async function suaThamSoNhap(id: string, json: string): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc();
    const sb = supabaseAdmin();
    const { data: hd } = await sb.from('tt_hop_dong').select('trang_thai').eq('id', id).single();
    if (hd?.trang_thai === 'hieu_luc') throw new Error('Hợp đồng đã kích hoạt — đổi tham số qua luồng sửa đổi.');
    let ts: any; try { ts = JSON.parse(json); } catch { throw new Error('JSON không hợp lệ.'); }
    const { error } = await sb.from('tt_bo_quy_tac').update({ tham_so: ts }).eq('hop_dong_id', id).eq('phien_ban', 1);
    if (error) throw new Error(error.message);
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.sua_tham_so_nhap', entity: 'tt_hop_dong', entityId: id });
    revalidatePath('/tuan-thu/quy-tac');
    return { ok: true, thongBao: 'Đã lưu tham số bản nháp.' };
  });
}

// ---------------------------------------------------------------------
// Tải file lớn thẳng từ trình duyệt lên Supabase Storage (qua link ký sẵn),
// tránh giới hạn 4,5MB mỗi request của Vercel (PDF hợp đồng scan thường 5–20MB).
// ---------------------------------------------------------------------
export async function xinLinkTaiLen(loai: 'hop_dong' | 'raw', maKhach: string, tenTep: string[]): Promise<{ ok: true; ds: { path: string; token: string; ten: string }[] } | { ok: false; loi: string }> {
  try {
    await batBuoc(loai === 'raw' ? 'ke_toan' : undefined);
    const ma = maKhach.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'KHAC';
    const lo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const ds = [];
    for (const ten of tenTep.slice(0, 10)) {
      if (loai === 'hop_dong' && !/\.pdf$/i.test(ten)) throw new Error('Hợp đồng chỉ nhận file PDF.');
      if (loai === 'raw' && !/\.xlsx$/i.test(ten)) throw new Error('Raw chỉ nhận file .xlsx.');
      const path = `tuan-thu/${ma}/${loai === 'hop_dong' ? 'hop-dong' : 'raw-tam'}/${lo}/${ten.normalize('NFC').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 120)}`;
      const { data, error } = await supabaseAdmin().storage.from(BUCKET_TT).createSignedUploadUrl(path);
      if (error || !data) throw new Error(`Không tạo được link tải lên: ${error?.message ?? ''}`);
      ds.push({ path: data.path, token: data.token, ten });
    }
    return { ok: true, ds };
  } catch (e) { return { ok: false, loi: e instanceof Error ? e.message : String(e) }; }
}

/** Đọc danh sách file đã tải thẳng lên (JSON [{path, ten}]) từ FormData, chỉ nhận đường dẫn trong tuan-thu/. */
function tepDaTai(fd: FormData, khoa: string): { path: string; ten: string }[] {
  try {
    const ds = JSON.parse(String(fd.get(khoa) ?? '[]')) as { path: string; ten: string }[];
    return ds.filter((t) => typeof t.path === 'string' && t.path.startsWith('tuan-thu/') && !t.path.includes('..'));
  } catch { return []; }
}
