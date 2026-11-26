import { supabaseAdmin } from '@/lib/supabase/admin';
import { BUCKET_TT, tenAnToan, thamSoHieuLuc } from './db';
import { COT_SO, docRaw, ngayISO } from './raw';
import { khoangKy, tongHop, tuSua } from './tinh';
import { docBangKeDaFormat, doiChieuRaw, kiemBangKeDaFormat, taoBanDaSua } from './bang-ke-doc';
import { kiemTra } from './kiem';
import { taoBangKe } from './bang-ke';
import { apDungMau, CauTrucMau } from './mau-bang-ke';
import { taoBaoCao } from './bao-cao';
import { DongRaw, LoaiDichVu, ThamSoHopDong } from './types';
import { TO_CHUC_MAC_DINH_ID } from './to-chuc';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function tai(path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET_TT).download(path);
  if (error || !data) throw new Error(`Không tải được ${path}: ${error?.message ?? ''}`);
  return Buffer.from(await data.arrayBuffer());
}
export async function luuTep(path: string, buf: Buffer, mime = XLSX) {
  const { error } = await supabaseAdmin().storage.from(BUCKET_TT).upload(path, buf, { contentType: mime, upsert: true });
  if (error) throw new Error(`Không lưu được ${path}: ${error.message}`);
}

/**
 * Chạy bước 1–2 cho một lần chạy: đọc raw → tự sửa theo quy tắc → kiểm tra → dựng bảng kê + báo cáo.
 * Xóa cảnh báo / thay đổi cũ của lần chạy rồi ghi lại từ đầu.
 */
export async function xuLyLanChay(lanChayId: string) {
  const sb = supabaseAdmin();
  const { data: lc, error } = await sb.from('tt_lan_chay').select('*, tt_hop_dong(*)').eq('org_id', TO_CHUC_MAC_DINH_ID).eq('id', lanChayId).single();
  if (error || !lc) throw new Error(error?.message ?? 'Không tìm thấy lần chạy.');
  const hd = lc.tt_hop_dong as any;
  const { phien_ban, tham_so: ts } = await thamSoHieuLuc(hd.id, lc.thang);

  if (ts.ky?.kieu === 'hai_dot' && !lc.dot) throw new Error('Bộ quy tắc hiện hành chia 2 đợt: hãy chọn đợt 1 hoặc 2.');
  if (ts.ky?.kieu !== 'hai_dot' && lc.dot) throw new Error('Bộ quy tắc hiện hành gửi 1 kỳ/tháng: không chọn đợt.');

  if (lc.che_do === 'da_format') return xuLyDaFormat(lc, hd, ts, phien_ban);

  const dong: DongRaw[] = [];
  const thieu: Record<LoaiDichVu, string[]> = { khach_san: [], ve_may_bay: [] };
  const paths = (lc.raw_paths ?? {}) as Record<string, string>;
  if (!Object.keys(paths).length) throw new Error('Chưa có file raw.');
  for (const p of Object.values(paths)) {
    const kq = await docRaw(await tai(p));
    dong.push(...kq.dong); thieu[kq.loai] = kq.thieu_cot;
  }

  // Sửa tay qua agent (SQL 42): áp sau khi đọc raw, trước khi app tự sửa theo quy tắc
  const { data: suaTay } = await sb.from('tt_sua_tay').select('*').eq('org_id', TO_CHUC_MAC_DINH_ID).eq('lan_chay_id', lc.id).order('id');
  for (const st of (suaTay ?? []) as any[]) {
    const d = dong.find((x) => x.loai === st.loai && x.dong === st.dong);
    if (!d) continue;
    const so = COT_SO.includes(st.cot);
    d.v[st.cot] = st.gia_tri_moi === null || st.gia_tri_moi === '' ? null : so ? Number(String(st.gia_tri_moi).replace(/[^\d.-]/g, '')) : st.gia_tri_moi;
  }

  const thayDoi = tuSua(dong, ts);
  const { data: pb } = await sb.from('tt_phong_ban_khach').select('ten, ma_cost_center, thu_tu').eq('org_id', TO_CHUC_MAC_DINH_ID)
    .eq('hop_dong_id', hd.id).order('thu_tu');
  const danhMuc = (pb ?? []).map((x: any) => ({ ten: x.ten, ma_cost_center: x.ma_cost_center }));
  const canhBao = kiemTra({ dong, ts, thang: lc.thang, dot: lc.dot ?? undefined,
    danh_muc_phong_ban: danhMuc.map((x) => x.ten), thieu_cot: thieu, ten_cong_ty: hd.ten_cong_ty_raw || hd.ten_khach });

  const nhanKy = khoangKy(ts, lc.thang, lc.dot ?? undefined).nhan;
  const goc = `tuan-thu/${hd.ma_khach}/${lc.thang}${lc.dot ? `-dot${lc.dot}` : ''}/${lc.id}/v${lc.vong}`;
  const tenBk = `${hd.ma_khach}_bang_ke_${lc.thang}${lc.dot ? `_dot${lc.dot}` : ''}.xlsx`;
  // Mẫu riêng của khách (đã duyệt) → dựng đúng mẫu; chưa có → mẫu chuẩn
  const { data: mau } = await sb.from('tt_mau_bang_ke').select('id, path, cau_truc, phien_ban').eq('org_id', TO_CHUC_MAC_DINH_ID).eq('ma_khach', hd.ma_khach).eq('trang_thai', 'hieu_luc').order('phien_ban', { ascending: false }).limit(1);
  const m = (mau ?? [])[0] as any;
  const bkBuf = m ? await apDungMau(await tai(m.path), m.cau_truc as CauTrucMau, dong, ts, nhanKy)
    : await taoBangKe({ ts, nhanKy, dong, danhMucPhongBan: danhMuc, tenSheet: hd.ten_sheet });
  await luuTep(`${goc}/${tenBk}`, bkBuf);
  await sb.from('tt_tep_lan_chay').insert({ lan_chay_id: lc.id, vong: lc.vong, loai: 'bk_app', path: `${goc}/${tenBk}`, ten: m ? `${tenBk} (mẫu khách v${m.phien_ban})` : `${tenBk} (mẫu chuẩn)` });
  await luuTep(`${goc}/bao_cao_kiem_tra.xlsx`, await taoBaoCao({ nhanKy, dong, canhBao, thayDoi }));

  await sb.from('tt_canh_bao').delete().eq('org_id', TO_CHUC_MAC_DINH_ID).eq('lan_chay_id', lc.id);
  await sb.from('tt_thay_doi').delete().eq('org_id', TO_CHUC_MAC_DINH_ID).eq('lan_chay_id', lc.id);
  if (canhBao.length) {
    const r = await sb.from('tt_canh_bao').insert(canhBao.map((c) => ({
      lan_chay_id: lc.id, ma_quy_tac: c.ma_quy_tac, phong_ban: c.phong_ban, muc_do: c.muc_do, loai: c.loai ?? null,
      dong: c.dong, noi_dung: c.noi_dung, so_tien: c.so_tien ?? null })));
    if (r.error) throw new Error(r.error.message);
  }
  for (let i = 0; i < thayDoi.length; i += 500) {
    const r = await sb.from('tt_thay_doi').insert(thayDoi.slice(i, i + 500).map((t) => ({
      lan_chay_id: lc.id, ma_quy_tac: t.ma_quy_tac, loai: t.loai, dong: t.dong, ma_giao_dich: t.ma_giao_dich,
      cot: t.cot, truoc: t.truoc, sau: t.sau })));
    if (r.error) throw new Error(r.error.message);
  }
  const th = tongHop(dong);
  await sb.from('tt_lan_chay').update({
    phien_ban_quy_tac: phien_ban, bang_ke_path: `${goc}/${tenBk}`, bao_cao_path: `${goc}/bao_cao_kiem_tra.xlsx`,
    tong_hop: { ...th, nhan_ky: nhanKy }, loi: null, mau_id: m?.id ?? null,
  }).eq('org_id', TO_CHUC_MAC_DINH_ID).eq('id', lc.id);
}

/** Đọc lại raw của một lần chạy (đã áp sửa tay) — dùng cho công cụ xem dòng của agent. */
export async function docDongLanChay(lanChayId: string): Promise<DongRaw[]> {
  const sb = supabaseAdmin();
  const { data: lc } = await sb.from('tt_lan_chay').select('raw_paths').eq('org_id', TO_CHUC_MAC_DINH_ID).eq('id', lanChayId).single();
  const dong: DongRaw[] = [];
  for (const p of Object.values((lc?.raw_paths ?? {}) as Record<string, string>)) dong.push(...(await docRaw(await tai(p))).dong);
  const { data: suaTay } = await sb.from('tt_sua_tay').select('*').eq('org_id', TO_CHUC_MAC_DINH_ID).eq('lan_chay_id', lanChayId).order('id');
  for (const st of (suaTay ?? []) as any[]) {
    const d = dong.find((x) => x.loai === st.loai && x.dong === st.dong);
    if (d) d.v[st.cot] = COT_SO.includes(st.cot) ? Number(st.gia_tri_moi) : st.gia_tri_moi;
  }
  return dong;
}

/**
 * Lần chạy từ bảng kê kế toán ĐÃ FORMAT: kiểm tra file theo bộ quy tắc (+ đối chiếu raw nếu có),
 * tạo "bản đã sửa theo quy tắc" bằng cách vá đúng ô trong chính file đó. Kế toán chọn bản gửi.
 */
async function xuLyDaFormat(lc: any, hd: any, ts: ThamSoHopDong, phien_ban: number) {
  const sb = supabaseAdmin();
  if (!lc.bk_goc_path) throw new Error('Chưa có file bảng kê đã format.');
  const goc = await tai(lc.bk_goc_path);
  // Mẫu đã duyệt của khách giúp đọc đúng các cột khác tên (VD "Tên dịch vụ", "Tiền thuế GTGT")
  const { data: mauDs } = await sb.from('tt_mau_bang_ke').select('cau_truc').eq('org_id', TO_CHUC_MAC_DINH_ID).eq('ma_khach', hd.ma_khach).eq('trang_thai', 'hieu_luc').order('phien_ban', { ascending: false }).limit(1);
  const kq = await docBangKeDaFormat(goc, ((mauDs ?? [])[0] as any)?.cau_truc ?? null);
  if (!kq.dong.length) throw new Error(`Không nhận ra giao dịch nào trong file (sheet không nhận ra: ${kq.khongNhanRa.join(', ') || 'không'}). Cần sheet chi tiết có dòng tiêu đề bắt đầu bằng "STT" và cột "Tên khách sạn" hoặc "Tên dịch vụ (Hành trình)".`);
  const tongGoc = tongHop(kq.dong);
  const canhBaoFile = kiemBangKeDaFormat(kq, ts);
  const thayDoi = tuSua(kq.dong, ts);
  const { data: pb } = await sb.from('tt_phong_ban_khach').select('ten').eq('org_id', TO_CHUC_MAC_DINH_ID).eq('hop_dong_id', hd.id);
  const canhBao = [...canhBaoFile, ...kiemTra({ dong: kq.dong, ts, thang: lc.thang, dot: lc.dot ?? undefined,
    danh_muc_phong_ban: (pb ?? []).map((x: any) => x.ten), thieu_cot: { khach_san: [], ve_may_bay: [] }, ten_cong_ty: hd.ten_cong_ty_raw || hd.ten_khach })];
  // Đối chiếu raw (không bắt buộc): chỉ lấy giao dịch trong kỳ của lần chạy
  const rawPaths = Object.values((lc.raw_paths ?? {}) as Record<string, string>);
  if (rawPaths.length) {
    const ky = khoangKy(ts, lc.thang, lc.dot ?? undefined);
    const raw: DongRaw[] = [];
    for (const p of rawPaths) raw.push(...(await docRaw(await tai(p))).dong);
    const trongKy = raw.filter((d) => { const i = ngayISO(d.v['Ngày giao dịch']); return i >= ky.tu && i <= ky.den; });
    canhBao.push(...doiChieuRaw(kq.dong, trongKy));
  } else canhBao.push({ ma_quy_tac: 'KT-05', phong_ban: 'ke_toan', muc_do: 'theo_doi', dong: [], noi_dung: 'Không upload raw kèm — chưa đối chiếu được giao dịch thiếu / thừa / lệch so với raw.' });

  const coSua = thayDoi.length > 0 || canhBaoFile.some((c) => c.ma_quy_tac === 'KT-06' || (c.ma_quy_tac === 'KT-10' && c.loai));
  const nhanKy = khoangKy(ts, lc.thang, lc.dot ?? undefined).nhan;
  const thuMuc = `tuan-thu/${hd.ma_khach}/${lc.thang}${lc.dot ? `-dot${lc.dot}` : ''}/${lc.id}/v${lc.vong}`;
  const tenGoc = lc.bk_goc_ten || lc.bk_goc_path.split('/').pop();
  let bkSua: string | null = null;
  if (coSua) { bkSua = `${thuMuc}/da-sua/${tenAnToan(tenGoc)}`; await luuTep(bkSua, await taoBanDaSua(goc, kq, thayDoi, ts));
    await sb.from('tt_tep_lan_chay').insert({ lan_chay_id: lc.id, vong: lc.vong, loai: 'bk_sua', path: bkSua, ten: `${tenGoc} (bản đã sửa theo quy tắc)` }); }
  await luuTep(`${thuMuc}/bao_cao_kiem_tra.xlsx`, await taoBaoCao({ nhanKy, dong: kq.dong, canhBao, thayDoi }));

  await sb.from('tt_canh_bao').delete().eq('org_id', TO_CHUC_MAC_DINH_ID).eq('lan_chay_id', lc.id);
  await sb.from('tt_thay_doi').delete().eq('org_id', TO_CHUC_MAC_DINH_ID).eq('lan_chay_id', lc.id);
  if (canhBao.length) {
    const r = await sb.from('tt_canh_bao').insert(canhBao.map((c) => ({ lan_chay_id: lc.id, ma_quy_tac: c.ma_quy_tac, phong_ban: c.phong_ban, muc_do: c.muc_do,
      loai: c.loai ?? null, dong: c.dong, noi_dung: c.noi_dung, so_tien: c.so_tien ?? null })));
    if (r.error) throw new Error(r.error.message);
  }
  for (let i = 0; i < thayDoi.length; i += 500) {
    const r = await sb.from('tt_thay_doi').insert(thayDoi.slice(i, i + 500).map((t) => ({ lan_chay_id: lc.id, ma_quy_tac: t.ma_quy_tac, loai: t.loai, dong: t.dong,
      ma_giao_dich: t.ma_giao_dich, cot: t.cot, truoc: t.truoc, sau: t.sau })));
    if (r.error) throw new Error(r.error.message);
  }
  const th = tongHop(kq.dong);
  // Không có bản sửa → chỉ có một bản để gửi
  const banGui = coSua ? null : 'goc';
  await sb.from('tt_lan_chay').update({
    phien_ban_quy_tac: phien_ban, bk_sua_path: bkSua, ban_gui: banGui,
    bang_ke_path: banGui === 'goc' ? lc.bk_goc_path : null, bao_cao_path: `${thuMuc}/bao_cao_kiem_tra.xlsx`,
    tong_hop: { ...th, nhan_ky: nhanKy, goc: { tong_cong: tongGoc.tong_cong, chiet_khau: tongGoc.chiet_khau.khach_san + tongGoc.chiet_khau.ve_may_bay } }, loi: null,
  }).eq('org_id', TO_CHUC_MAC_DINH_ID).eq('id', lc.id);
}
