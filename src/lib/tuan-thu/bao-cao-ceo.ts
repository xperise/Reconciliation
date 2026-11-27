import { supabaseAdmin } from '@/lib/supabase/admin';
import { toChucHienTai } from './to-chuc-server';

export type TomTatKy = {
  thang: string;
  soLanChay: number;
  soDaGui: number;
  tongTienDaGui: number;
  soDangCho: number;
  choTheoBuoc: Record<string, number>;
  soChanDangMo: number;
  soTraVe: number;
  canQuyet: { id: string; ma_khach: string; dot: string | null; buoc: string; tong_hop: number | null }[];
};

const KET_THUC = ['da_gui', 'huy'];

/**
 * Tổng quan một kỳ cho CEO: số bảng kê, đã gửi, đang chờ theo bước, chặn đang mở, trả về,
 * và danh sách lần chạy đang chờ quyết định. Chỉ đọc; không thay đổi dữ liệu.
 */
export async function tomTatKy(thang: string, orgTuyChon?: string): Promise<TomTatKy> {
  const org = orgTuyChon ?? await toChucHienTai();
  const sb = supabaseAdmin();
  const { data: runs } = await sb.from('tt_lan_chay')
    .select('id, thang, dot, buoc, vong, tong_hop, tt_hop_dong(ma_khach)')
    .eq('org_id', org).eq('thang', thang);
  const rows = (runs ?? []) as any[];
  const ids = rows.map((r) => r.id);
  const { data: chan } = ids.length
    ? await sb.from('tt_chan').select('lan_chay_id').eq('org_id', org).is('go_luc', null).in('lan_chay_id', ids)
    : { data: [] as any[] };
  const dangChan = new Set((chan ?? []).map((c: any) => c.lan_chay_id));

  const choTheoBuoc: Record<string, number> = {};
  let soDaGui = 0, tongTienDaGui = 0, soDangCho = 0, soTraVe = 0;
  const canQuyet: TomTatKy['canQuyet'] = [];
  for (const r of rows) {
    if (r.vong && r.vong > 1) soTraVe++;
    const tien = Number(r.tong_hop?.tong_cong ?? 0);
    if (r.buoc === 'da_gui') { soDaGui++; tongTienDaGui += tien; continue; }
    if (KET_THUC.includes(r.buoc)) continue;
    soDangCho++;
    choTheoBuoc[r.buoc] = (choTheoBuoc[r.buoc] ?? 0) + 1;
    canQuyet.push({ id: r.id, ma_khach: r.tt_hop_dong?.ma_khach ?? '', dot: r.dot ?? null, buoc: r.buoc, tong_hop: r.tong_hop?.tong_cong ?? null });
  }
  return {
    thang, soLanChay: rows.length, soDaGui, tongTienDaGui, soDangCho, choTheoBuoc,
    soChanDangMo: dangChan.size, soTraVe, canQuyet,
  };
}

/** Đoạn tóm tắt kỳ để đưa vào ngữ cảnh của agent CEO. */
export function moTaTomTat(t: TomTatKy): string {
  const cho = Object.entries(t.choTheoBuoc).map(([b, n]) => `${b}: ${n}`).join(', ') || 'không có';
  return [
    `Kỳ ${t.thang}: ${t.soLanChay} lần chạy, đã gửi ${t.soDaGui} (tổng ${t.tongTienDaGui.toLocaleString('vi-VN')}).`,
    `Đang chờ: ${t.soDangCho} (${cho}). Chặn đang mở: ${t.soChanDangMo}. Trả về trong kỳ: ${t.soTraVe}.`,
    t.canQuyet.length ? `Cần CEO quyết: ${t.canQuyet.map((c) => `${c.ma_khach} (${c.buoc})`).join(', ')}.` : 'Không có lần chạy nào cần CEO quyết.',
  ].join('\n');
}

/** Kỳ hiện tại dạng YYYY-MM (cùng định dạng ô chọn tháng khi tạo lần chạy). */
export function thangHienTai(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export type BaoCaoDinhKy = {
  loai: 'ngay' | 'tuan';
  tu: string; den: string;            // YYYY-MM-DD
  kyHienTai: TomTatKy;                // trạng thái kỳ đang mở (tháng hiện tại)
  guiTrongKy: number; tienGuiTrongKy: number;
  lanChayMoi: number; chanMoi: number;
};

const ngayYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Báo cáo định kỳ cho CEO: số liệu trong ngày hoặc tuần (7 ngày) kết thúc tại `moc`, kèm trạng thái kỳ hiện tại. */
export async function baoCaoDinhKy(org: string, loai: 'ngay' | 'tuan', moc: Date): Promise<BaoCaoDinhKy> {
  const soNgay = loai === 'ngay' ? 1 : 7;
  const tu = new Date(moc); tu.setDate(tu.getDate() - (soNgay - 1)); tu.setHours(0, 0, 0, 0);
  const den = new Date(moc); den.setHours(23, 59, 59, 999);
  const sb = supabaseAdmin();
  const [{ data: gui }, { data: lanMoi }, { data: chanM }] = await Promise.all([
    sb.from('tt_lan_chay').select('tong_hop').eq('org_id', org).eq('buoc', 'da_gui').gte('gui_luc', tu.toISOString()).lte('gui_luc', den.toISOString()),
    sb.from('tt_lan_chay').select('id').eq('org_id', org).gte('created_at', tu.toISOString()).lte('created_at', den.toISOString()),
    sb.from('tt_chan').select('id').eq('org_id', org).gte('luc', tu.toISOString()).lte('luc', den.toISOString()),
  ]);
  const kyHienTai = await tomTatKy(thangHienTai(), org);
  return {
    loai, tu: ngayYMD(tu), den: ngayYMD(moc), kyHienTai,
    guiTrongKy: (gui ?? []).length,
    tienGuiTrongKy: (gui ?? []).reduce((a: number, r: any) => a + Number(r.tong_hop?.tong_cong ?? 0), 0),
    lanChayMoi: (lanMoi ?? []).length, chanMoi: (chanM ?? []).length,
  };
}

export function moTaBaoCaoDinhKy(b: BaoCaoDinhKy): string {
  const nhan = b.loai === 'ngay' ? `Ngày ${b.den}` : `Tuần ${b.tu} – ${b.den}`;
  return [
    `${nhan}`,
    `Đã gửi khách: ${b.guiTrongKy} bảng kê, tổng ${b.tienGuiTrongKy.toLocaleString('vi-VN')}đ.`,
    `Lần chạy mới: ${b.lanChayMoi}. Chặn mới: ${b.chanMoi}.`,
    `Kỳ đang mở: ${b.kyHienTai.soDangCho} lần chạy đang chờ, ${b.kyHienTai.soChanDangMo} chặn đang mở, ${b.kyHienTai.canQuyet.length} việc cần CEO quyết.`,
  ].join('\n');
}
