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
export async function tomTatKy(thang: string): Promise<TomTatKy> {
  const org = await toChucHienTai();
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
    if (r.buoc === 'da_gui') { soDaGui++; tongTienDaGui += Number(r.tong_hop ?? 0); continue; }
    if (KET_THUC.includes(r.buoc)) continue;
    soDangCho++;
    choTheoBuoc[r.buoc] = (choTheoBuoc[r.buoc] ?? 0) + 1;
    canQuyet.push({ id: r.id, ma_khach: r.tt_hop_dong?.ma_khach ?? '', dot: r.dot ?? null, buoc: r.buoc, tong_hop: r.tong_hop ?? null });
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
