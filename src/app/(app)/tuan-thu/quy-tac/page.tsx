import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { duocLam, fmtVnd, nguoiTT, NguoiTT } from '@/lib/tuan-thu/db';
import { PhongBan, TEN_MUC_DO, TEN_PHONG_BAN } from '@/lib/tuan-thu/types';
import { ChotQuyTac, SuaHopDong } from './client';

export const dynamic = 'force-dynamic';
const CACH: Record<string, string> = { tu_dong: 'Tự động', head_xem: 'Head xem', gd2: 'Giai đoạn 2' };
const CHOT: Record<string, [string, string]> = { cho: ['Chờ chốt', 'pill-watch'], dong_y: ['Đã đồng ý', 'pill-stable'], can_sua: ['Cần sửa', 'pill-high'] };

function tomTatThamSo(t: any) {
  const pct = (x: number) => `${(x * 100).toLocaleString('vi-VN')}%`;
  return [
    ['Kỳ bảng kê', t.ky?.kieu === 'hai_dot' ? `2 đợt (1–${t.ky.ngay_cat}, ${t.ky.ngay_cat + 1}–cuối tháng)` : '1 kỳ/tháng'],
    ['Chiết khấu', `Khách sạn ${pct(t.ty_le_chiet_khau?.khach_san ?? 0)} · Vé ${pct(t.ty_le_chiet_khau?.ve_may_bay ?? 0)}`],
    ['Phí dịch vụ', `Khách sạn ${fmtVnd(t.phi_dich_vu?.khach_san)}đ · Vé ${fmtVnd(t.phi_dich_vu?.ve_may_bay)}đ`],
    ['Tài khoản nhận tiền', `${t.tai_khoan?.so} — ${t.tai_khoan?.ngan_hang}`],
    ['Hạn mức tháng', `${fmtVnd(t.han_muc_thang)}đ`],
  ];
}

export default async function Page() {
  const sb = supabaseAdmin();
  const n = (await nguoiTT())!;
  const [{ data: hds }, { data: nhom }] = await Promise.all([
    sb.from('tt_hop_dong').select('*, billing_groups(ten_nhom, email_l1)').order('ma_khach'),
    sb.from('billing_groups').select('id, ten_nhom, ma_he_thong').order('ten_nhom'),
  ]);
  const nhomDs = (nhom ?? []).map((g: any) => ({ id: g.id, ten: `${g.ten_nhom} (${g.ma_he_thong})` }));
  return (
    <>
      <PageHeader eyebrow="Tuân thủ bảng kê" title="Hợp đồng & bộ quy tắc"
        description="Mỗi head chốt quy tắc thuộc phòng mình. Muốn đổi một quy tắc so với hợp đồng: bấm Đề xuất sửa — cần đủ 4/4 head đồng ý, có hiệu lực từ kỳ được chọn và tạo phiên bản quy tắc mới." />
      {(hds ?? []).map((hd: any) => <KhoiHopDong key={hd.id} hd={hd} n={n} nhomDs={nhomDs} />)}
    </>
  );
}

async function KhoiHopDong({ hd, n, nhomDs }: { hd: any; n: NguoiTT; nhomDs: { id: string; ten: string }[] }) {
  const sb = supabaseAdmin();
        const [{ data: qt }, { data: bo }] = await Promise.all([
          sb.from('tt_quy_tac').select('*').eq('hop_dong_id', hd.id).order('ma'),
          sb.from('tt_bo_quy_tac').select('*').eq('hop_dong_id', hd.id).order('phien_ban', { ascending: false }),
        ]);
        const hienHanh = (bo ?? [])[0];
        const theoPb = (['ke_toan', 'demand', 'supply', 'ceo'] as PhongBan[]).map((pb) => ({ pb, ds: (qt ?? []).filter((q: any) => q.phong_ban === pb) }));
        return (
          <section key={hd.id} className="mb-8">
            <div className="card card-pad mb-4">
              <h2 className="card-title mb-1">{hd.ten_khach} — HĐ {hd.so_hop_dong}{hd.ngay_ky ? ` ký ${new Date(hd.ngay_ky).toLocaleDateString('vi-VN')}` : ''}</h2>
              <p className="text-[12px] mb-3">Nhóm Master Data: <b>{hd.billing_groups?.ten_nhom ?? 'chưa gắn'}</b> · Email đầu mối: {hd.billing_groups?.email_l1 ?? '—'}</p>
              {n.laAdmin && <SuaHopDong id={hd.id} groupId={hd.group_id} ccThem={hd.cc_them ?? ''} nhom={nhomDs} />}
              <div className="grid gap-4 md:grid-cols-2 mt-4">
                <div>
                  <p className="label mb-1">Tham số máy đang áp dụng — v{hienHanh?.phien_ban} (từ {hienHanh?.hieu_luc_tu})</p>
                  <table className="tbl"><tbody>{hienHanh && tomTatThamSo(hienHanh.tham_so).map(([k, v]) => <tr key={k}><td className="w-[40%]">{k}</td><td>{v}</td></tr>)}</tbody></table>
                </div>
                <div>
                  <p className="label mb-1">Các phiên bản</p>
                  <table className="tbl"><tbody>{(bo ?? []).map((b: any) => (
                    <tr key={b.id}><td>v{b.phien_ban}</td><td>từ {b.hieu_luc_tu}</td><td className="text-[12px]">{b.ghi_chu}</td></tr>))}</tbody></table>
                </div>
              </div>
            </div>
            {theoPb.map(({ pb, ds }) => (
              <div key={pb} className="card overflow-hidden mb-4">
                <div className="card-hd px-4 py-2 font-semibold">{TEN_PHONG_BAN[pb]} · {ds.filter((q: any) => q.chot === 'dong_y').length}/{ds.length} đã chốt</div>
                <table className="tbl"><thead><tr><th>Mã</th><th>Quy tắc</th><th>Giá trị</th><th>Căn cứ</th><th>Cách kiểm</th><th>Mức độ</th><th>Head chốt</th><th style={{ minWidth: 240 }}></th></tr></thead>
                  <tbody>{ds.map((q: any) => (
                    <tr key={q.id}>
                      <td className="mono">{q.ma}</td><td className="text-[12px]">{q.noi_dung}</td><td className="text-[12px]">{q.gia_tri}</td>
                      <td className="text-[11.5px]">{q.can_cu}</td><td className="text-[12px]">{CACH[q.cach_kiem] ?? q.cach_kiem}</td>
                      <td className="text-[12px]">{TEN_MUC_DO[q.muc_do as keyof typeof TEN_MUC_DO]}</td>
                      <td><span className={`pill ${CHOT[q.chot][1]}`}>{CHOT[q.chot][0]}</span>{q.chot_y_kien && <div className="text-[11px]">{q.chot_y_kien}</div>}</td>
                      <td>{duocLam(n, pb) ? <ChotQuyTac id={q.id} chot={q.chot} yKien={q.chot_y_kien ?? ''} hopDongId={hd.id} ma={q.ma} /> : null}</td>
                    </tr>))}</tbody></table>
              </div>
            ))}
          </section>
        );
}
