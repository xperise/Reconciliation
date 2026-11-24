import { supabaseAdmin } from '@/lib/supabase/admin';
import { BUCKET_TT, thamSoHieuLuc } from './db';
import { docRaw } from './raw';
import { khoangKy, tongHop, tuSua } from './tinh';
import { kiemTra } from './kiem';
import { taoBangKe } from './bang-ke';
import { taoBaoCao } from './bao-cao';
import { DongRaw, LoaiDichVu } from './types';

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
  const { data: lc, error } = await sb.from('tt_lan_chay').select('*, tt_hop_dong(*)').eq('id', lanChayId).single();
  if (error || !lc) throw new Error(error?.message ?? 'Không tìm thấy lần chạy.');
  const hd = lc.tt_hop_dong as any;
  const { phien_ban, tham_so: ts } = await thamSoHieuLuc(hd.id, lc.thang);

  if (ts.ky.kieu === 'hai_dot' && !lc.dot) throw new Error('Bộ quy tắc hiện hành chia 2 đợt: hãy chọn đợt 1 hoặc 2.');
  if (ts.ky.kieu === 'thang' && lc.dot) throw new Error('Bộ quy tắc hiện hành gửi 1 kỳ/tháng: không chọn đợt.');

  const dong: DongRaw[] = [];
  const thieu: Record<LoaiDichVu, string[]> = { khach_san: [], ve_may_bay: [] };
  const paths = (lc.raw_paths ?? {}) as Record<string, string>;
  if (!Object.keys(paths).length) throw new Error('Chưa có file raw.');
  for (const p of Object.values(paths)) {
    const kq = await docRaw(await tai(p));
    dong.push(...kq.dong); thieu[kq.loai] = kq.thieu_cot;
  }

  const thayDoi = tuSua(dong, ts);
  const { data: pb } = await sb.from('tt_phong_ban_khach').select('ten, ma_cost_center, thu_tu')
    .eq('hop_dong_id', hd.id).order('thu_tu');
  const danhMuc = (pb ?? []).map((x: any) => ({ ten: x.ten, ma_cost_center: x.ma_cost_center }));
  const canhBao = kiemTra({ dong, ts, thang: lc.thang, dot: lc.dot ?? undefined,
    danh_muc_phong_ban: danhMuc.map((x) => x.ten), thieu_cot: thieu, ten_cong_ty: hd.ten_khach });

  const nhanKy = khoangKy(ts, lc.thang, lc.dot ?? undefined).nhan;
  const goc = `tuan-thu/${hd.ma_khach}/${lc.thang}${lc.dot ? `-dot${lc.dot}` : ''}/${lc.id}/v${lc.vong}`;
  const tenBk = `${hd.ma_khach}_bang_ke_${lc.thang}${lc.dot ? `_dot${lc.dot}` : ''}.xlsx`;
  await luuTep(`${goc}/${tenBk}`, await taoBangKe({ ts, nhanKy, dong, danhMucPhongBan: danhMuc, tenSheet: hd.ten_sheet }));
  await luuTep(`${goc}/bao_cao_kiem_tra.xlsx`, await taoBaoCao({ nhanKy, dong, canhBao, thayDoi }));

  await sb.from('tt_canh_bao').delete().eq('lan_chay_id', lc.id);
  await sb.from('tt_thay_doi').delete().eq('lan_chay_id', lc.id);
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
    tong_hop: { ...th, nhan_ky: nhanKy }, loi: null,
  }).eq('id', lc.id);
}
