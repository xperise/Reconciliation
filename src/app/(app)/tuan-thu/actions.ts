'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { sendMail } from '@/lib/google/gmail';
import { batBuoc, BuocDuyet, duocLam, gopSau, nguoiTT, thamSoHieuLuc, BUCKET_TT, fmtVnd } from '@/lib/tuan-thu/db';
import { luuTep, xuLyLanChay } from '@/lib/tuan-thu/xu-ly';
import { deXuatBuoc, textDeXuat } from '@/lib/tuan-thu/de-xuat';
import { PhongBan, TEN_PHONG_BAN } from '@/lib/tuan-thu/types';

type KQ = { ok: true; id?: string; thongBao?: string } | { ok: false; loi: string };
const loi = (e: unknown): KQ => ({ ok: false, loi: e instanceof Error ? e.message : String(e) });
const lam = async (fn: () => Promise<KQ>): Promise<KQ> => { try { return await fn(); } catch (e) { return loi(e); } };

async function ghiRaw(lanId: string, maKhach: string, thang: string, files: File[]) {
  const paths: Record<string, string> = {}, ten: Record<string, string> = {};
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
    const { phien_ban } = await thamSoHieuLuc(hopDongId, thang);
    const { data: lc, error } = await sb.from('tt_lan_chay').insert({
      hop_dong_id: hopDongId, thang, dot: dotS ? Number(dotS) : null, phien_ban_quy_tac: phien_ban, created_by: n.id,
    }).select('id').single();
    if (error || !lc) throw new Error(error?.message ?? 'Không tạo được lần chạy.');
    try {
      const { paths, ten } = await ghiRaw(lc.id, hd.ma_khach, thang, fd.getAll('raw') as File[]);
      await sb.from('tt_lan_chay').update({ raw_paths: paths, raw_ten: ten }).eq('id', lc.id);
      await xuLyLanChay(lc.id);
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
    const { paths, ten } = await ghiRaw(id, (lc as any).tt_hop_dong.ma_khach, lc.thang, fd.getAll('raw') as File[]);
    const { phien_ban } = await thamSoHieuLuc(lc.hop_dong_id, lc.thang);
    await sb.from('tt_lan_chay').update({ raw_paths: paths, raw_ten: ten, vong: lc.vong + 1, buoc: 'cho_ke_toan', phien_ban_quy_tac: phien_ban }).eq('id', id);
    await xuLyLanChay(id);
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

const BUOC_TIEP: Record<string, string> = { ke_toan: 'cho_scope', ceo: 'da_gui' };
const BUOC_DANG: Record<BuocDuyet, string> = { ke_toan: 'cho_ke_toan', demand: 'cho_scope', supply: 'cho_scope', ceo: 'cho_ceo' };

export async function duyetBuoc(lanId: string, buoc: BuocDuyet, quyetDinh: 'duyet' | 'tra_ve', yKien: string): Promise<KQ> {
  return lam(async () => {
    const n = await batBuoc(buoc as PhongBan);
    const sb = supabaseAdmin();
    const { data: lc } = await sb.from('tt_lan_chay').select('*').eq('id', lanId).single();
    if (!lc) throw new Error('Không tìm thấy lần chạy.');
    if (lc.loi) throw new Error('Lần chạy đang lỗi xử lý raw, hãy tải lại raw.');
    if (lc.buoc !== BUOC_DANG[buoc]) throw new Error('Lần chạy không ở bước này.');
    if (quyetDinh === 'tra_ve' && !yKien.trim()) throw new Error('Trả về phải ghi lý do.');

    const [{ data: cb }, { data: td }, { data: dy }] = await Promise.all([
      sb.from('tt_canh_bao').select('*').eq('lan_chay_id', lanId),
      sb.from('tt_thay_doi').select('xac_nhan, ma_quy_tac, cot').eq('lan_chay_id', lanId),
      sb.from('tt_duyet').select('buoc, quyet_dinh').eq('lan_chay_id', lanId).eq('vong', lc.vong),
    ]);
    const dx = deXuatBuoc(buoc, (cb ?? []) as any, (td ?? []) as any, (dy ?? []) as any);
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
    let ins = await sb.from('tt_duyet').insert(dongDuyet);
    if (ins.error && /skill_phien_ban/.test(ins.error.message)) { delete dongDuyet.skill_phien_ban; ins = await sb.from('tt_duyet').insert(dongDuyet); }
    if (ins.error) throw new Error(ins.error.message);
    // Học từ quyết định: head duyệt khác đề xuất của agent → gợi ý bổ sung skill
    if (quyetDinh === 'duyet' && dx.ket_luan === 'tra_ve' && yKien.trim()) {
      await sb.from('tt_skill_goi_y').insert({ phong_ban: buoc, lan_chay_id: lanId, nguon: `Duyệt khác đề xuất · ${lc.thang}${lc.dot ? ` đợt ${lc.dot}` : ''}`,
        noi_dung: `Tình huống: ${dx.ly_do.join(' ')} — head đã duyệt với lý do: ${yKien.trim()}. Lần sau coi là ngoại lệ hợp lệ nếu cùng điều kiện.` });
    }

    if (quyetDinh === 'tra_ve') {
      await sb.from('tt_lan_chay').update({ buoc: 'cho_ke_toan', vong: lc.vong + 1 }).eq('id', lanId);
    } else if (buoc === 'demand' || buoc === 'supply') {
      const da = new Set([...(dy ?? []).filter((d: any) => d.quyet_dinh === 'duyet').map((d: any) => d.buoc), buoc]);
      if (da.has('demand') && da.has('supply')) await sb.from('tt_lan_chay').update({ buoc: 'cho_ceo' }).eq('id', lanId);
    } else if (buoc === 'ceo') {
      await guiBangKe(lanId);
    } else {
      await sb.from('tt_lan_chay').update({ buoc: BUOC_TIEP[buoc] }).eq('id', lanId);
    }
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: `tuan_thu.${quyetDinh}`, entity: 'tt_lan_chay', entityId: lanId, after: { buoc, yKien } });
    revalidatePath(`/tuan-thu/chay/${lanId}`); revalidatePath('/tuan-thu');
    return { ok: true, thongBao: buoc === 'ceo' && quyetDinh === 'duyet' ? 'Đã duyệt và gửi bảng kê cho khách.' : undefined };
  });
}

export async function thongTinGui(lanId: string) {
  const sb = supabaseAdmin();
  const { data: lc } = await sb.from('tt_lan_chay').select('*, tt_hop_dong(*, billing_groups(*))').eq('id', lanId).single();
  const hd: any = (lc as any)?.tt_hop_dong; const g: any = hd?.billing_groups;
  const to = g?.email_l1 ?? '';
  const cc = [g?.email_ke_toan, g?.email_cc, g?.email_pm, hd?.cc_them].filter((x) => x && String(x).includes('@')).join(',');
  const th: any = lc?.tong_hop ?? {};
  const subject = `[${hd?.ten_khach ?? ''}] Bảng kê dịch vụ ${th.nhan_ky ?? ''}`.trim();
  const html = `<p>Kính gửi Quý khách hàng,</p>
<p>Xperise (Công ty Cổ phần Universal Travel Solutions Network) gửi bảng kê dịch vụ ${th.nhan_ky ?? ''} theo hợp đồng số ${hd?.so_hop_dong ?? ''}.</p>
<table cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd;font-family:Arial;font-size:13px">
<tr><td>Vé máy bay</td><td align="right">${fmtVnd(th.tong?.ve_may_bay)} đ</td></tr>
<tr><td>Khách sạn</td><td align="right">${fmtVnd(th.tong?.khach_san)} đ</td></tr>
<tr><td><b>Tổng cộng</b></td><td align="right"><b>${fmtVnd(th.tong_cong)} đ</b></td></tr></table>
<p>Quý khách vui lòng kiểm tra và phản hồi trong vòng 10 ngày làm việc theo Điều 3.2 hợp đồng.</p>
<p>Trân trọng,<br/>Xperise</p>`;
  return { lc, hd, g, to, cc, subject, html };
}

async function guiBangKe(lanId: string) {
  const sb = supabaseAdmin();
  const { lc, to, cc, subject, html } = await thongTinGui(lanId);
  if (!lc?.bang_ke_path) throw new Error('Chưa có file bảng kê.');
  if (!to.includes('@')) throw new Error('Hợp đồng chưa gắn nhóm Master Data có email đầu mối khách (email_l1). Gắn ở trang Hợp đồng & quy tắc.');
  const { data } = await sb.storage.from(BUCKET_TT).download(lc.bang_ke_path);
  if (!data) throw new Error('Không tải được file bảng kê.');
  const sent = await sendMail({ to, cc: cc || undefined, subject, html,
    attachments: [{ filename: lc.bang_ke_path.split('/').pop()!, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: Buffer.from(await data.arrayBuffer()) }] });
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
