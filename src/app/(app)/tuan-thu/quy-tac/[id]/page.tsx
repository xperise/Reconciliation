import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { duocLam, fmtVnd, nguoiTT, NguoiTT } from '@/lib/tuan-thu/db';
import { PhongBan, TEN_MUC_DO, TEN_PHONG_BAN } from '@/lib/tuan-thu/types';
import Link from 'next/link';
import { ChotQuyTac, ChotTatCa, DocLai, KichHoat, SuaHopDong, SuaThamSo } from '../client';
import { VanBan } from '../../agent-ui';
import { KhoiMau, KhoiSuaDoi } from './khoi-them';
import { TO_CHUC_MAC_DINH_ID } from '@/lib/tuan-thu/to-chuc';

export const dynamic = 'force-dynamic';
const CACH: Record<string, string> = { tu_dong: 'Tự động', head_xem: 'Head xem', gd2: 'Giai đoạn 2' };
const TT_HD: Record<string, [string, string]> = { dang_doc: ['Agent đang đọc', 'pill-watch'], cho_chot: ['Chờ chốt', 'pill-high'], hieu_luc: ['Đang hiệu lực', 'pill-stable'], het_hieu_luc: ['Hết hiệu lực', 'pill-neutral'], loi: ['Lỗi đọc', 'pill-critical'] };
const CHOT: Record<string, [string, string]> = { cho: ['Chờ chốt', 'pill-watch'], dong_y: ['Đã đồng ý', 'pill-stable'], can_sua: ['Cần sửa', 'pill-high'] };

function tomTatThamSo(t: any) {
  const pct = (x: number) => `${(x * 100).toLocaleString('vi-VN')}%`;
  return [
    ['Kỳ bảng kê', t.ky?.kieu === 'hai_dot' ? `2 đợt (1–${t.ky.ngay_cat}, ${t.ky.ngay_cat + 1}–cuối tháng)` : '1 kỳ/tháng'],
    ['Chiết khấu', `Khách sạn ${pct(t.ty_le_chiet_khau?.khach_san ?? 0)} · Vé ${pct(t.ty_le_chiet_khau?.ve_may_bay ?? 0)}`],
    ['Phí dịch vụ', `Khách sạn ${fmtVnd(t.phi_dich_vu?.khach_san)}đ · Vé ${fmtVnd(t.phi_dich_vu?.ve_may_bay)}đ`],
    ['Tài khoản nhận tiền', t.tai_khoan?.so ? `${t.tai_khoan.so} — ${t.tai_khoan.ngan_hang ?? ''}` : 'Hợp đồng không ghi'],
    ['Hạn mức tháng', t.han_muc_thang ? `${fmtVnd(t.han_muc_thang)}đ` : 'Không quy định'],
    ['Định mức tiền phòng', (t.dinh_muc_phong ?? []).length ? `${t.dinh_muc_phong.length} nhóm đối tượng` : 'Không có — không kiểm'],
  ];
}

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: { ma?: string } }) {
  const sb = supabaseAdmin();
  const n = (await nguoiTT())!;
  const [{ data: hds }, { data: nhom }] = await Promise.all([
    sb.from('tt_hop_dong').select('*, billing_groups(ten_nhom, email_l1)').eq('org_id', TO_CHUC_MAC_DINH_ID).eq('id', params.id),
    sb.from('billing_groups').select('id, ten_nhom, ma_he_thong').order('ten_nhom'),
  ]);
  const nhomDs = (nhom ?? []).map((g: any) => ({ id: g.id, ten: `${g.ten_nhom} (${g.ma_he_thong})` }));
  return (
    <>
      <p className="mb-3"><Link href="/tuan-thu/quy-tac" className="text-[12px] underline">← Danh sách khách hàng</Link></p>
      {(hds ?? []).length === 0 && <div className="callout callout-high">Không tìm thấy hợp đồng.</div>}
      {(hds ?? []).map((hd: any) => <div key={hd.id}>
        <nav className="flex gap-3 text-[12px] mb-3"><a href="#quy-tac" className="underline">Quy tắc</a><a href="#sua-doi" className="underline">Sửa đổi quy tắc</a><a href="#mau" className="underline">Mẫu bảng kê</a></nav>
        <div id="quy-tac"><KhoiHopDong hd={hd} n={n} nhomDs={nhomDs} /></div>
        <KhoiSuaDoi hd={hd} n={n} maChon={searchParams.ma} />
        <KhoiMau hd={hd} n={n} />
      </div>)}
    </>
  );
}

async function KhoiHopDong({ hd, n, nhomDs }: { hd: any; n: NguoiTT; nhomDs: { id: string; ten: string }[] }) {
  const sb = supabaseAdmin();
        const [{ data: qt }, { data: bo }] = await Promise.all([
          sb.from('tt_quy_tac').select('*').eq('org_id', TO_CHUC_MAC_DINH_ID).eq('hop_dong_id', hd.id).order('ma'),
          sb.from('tt_bo_quy_tac').select('*').eq('org_id', TO_CHUC_MAC_DINH_ID).eq('hop_dong_id', hd.id).order('phien_ban', { ascending: false }),
        ]);
        const hienHanh = (bo ?? [])[0];
        const theoPb = (['ke_toan', 'demand', 'supply', 'ceo'] as PhongBan[]).map((pb) => ({ pb, ds: (qt ?? []).filter((q: any) => q.phong_ban === pb) }));
        return (
          <section key={hd.id} id={`hd-${hd.id}`} className="mb-8">
            <div className="card card-pad mb-4">
              <h2 className="card-title mb-1">{hd.ten_khach} — HĐ {hd.so_hop_dong}{hd.ngay_ky ? ` ký ${new Date(hd.ngay_ky).toLocaleDateString('vi-VN')}` : ''}{' '}
                <span className={`pill ${TT_HD[hd.trang_thai ?? 'hieu_luc']?.[1]}`}>{TT_HD[hd.trang_thai ?? 'hieu_luc']?.[0]}</span></h2>
              {hd.trang_thai === 'loi' && <div className="callout callout-critical text-[12px] mb-2">Agent đọc hợp đồng lỗi: {hd.loi_doc}</div>}
              {hd.trang_thai === 'dang_doc' && <div className="callout callout-high text-[12px] mb-2">Agent đang đọc hợp đồng… tải lại trang sau 1–3 phút.</div>}
              {(hd.tep_hop_dong ?? []).length > 0 && <p className="text-[12px] mb-2">File: {(hd.tep_hop_dong as any[]).map((t, i) => <a key={i} className="underline mr-3" href={`/api/tuan-thu/tep?path=${encodeURIComponent(t.path)}`}>{t.ten}</a>)}</p>}
              {hd.trang_thai !== 'hieu_luc' && hd.trang_thai !== 'het_hieu_luc' && (
                <div className="callout callout-accent text-[12.5px] mb-3">
                  {hd.trang_thai === 'loi' ? <b>Agent chưa đọc được hợp đồng — bấm đọc lại.</b> : hd.trang_thai === 'dang_doc' ? <b>Agent đang đọc. Quá 5 phút vẫn ở trạng thái này thì bấm đọc lại.</b> : <b>Bản nháp chờ chốt.</b>} 4 head chốt hết quy tắc của phòng mình (có thể nhờ agent: "chốt các quy tắc {hd.ma_khach} của tôi"), rồi CEO kích hoạt. Chưa kích hoạt thì chưa chạy bảng kê được.
                  <div className="flex gap-2 mt-2 flex-wrap items-start"><DocLai id={hd.id} />{hd.trang_thai === 'cho_chot' && <KichHoat id={hd.id} />}</div>
                </div>
              )}
              {(hd.cau_hoi_mo ?? []).length > 0 && hd.trang_thai !== 'hieu_luc' && (
                <div className="callout callout-high text-[12.5px] mb-3"><b>Điểm hợp đồng còn mở (agent nêu khi đọc):</b><ul className="m-0 pl-4">{(hd.cau_hoi_mo as string[]).map((c, i) => <li key={i}>{c}</li>)}</ul></div>
              )}
              {hd.tom_tat_dieu_khoan && <details className="mb-3"><summary className="text-[12px] cursor-pointer">Tóm tắt điều khoản hợp đồng (agent dùng để trả lời)</summary><div className="text-[12.5px] mt-2"><VanBan text={hd.tom_tat_dieu_khoan} /></div></details>}
              <p className="text-[12px] mb-3">Nhóm Master Data: <b>{hd.billing_groups?.ten_nhom ?? 'chưa gắn'}</b> · Email đầu mối: {hd.billing_groups?.email_l1 ?? '—'}</p>
              {n.laAdmin && <SuaHopDong id={hd.id} groupId={hd.group_id} ccThem={hd.cc_them ?? ''} nhom={nhomDs} />}
              <div className="grid gap-4 md:grid-cols-2 mt-4">
                <div>
                  <p className="label mb-1">Tham số máy đang áp dụng — v{hienHanh?.phien_ban} (từ {hienHanh?.hieu_luc_tu})</p>
                  <table className="tbl"><tbody>{hienHanh && tomTatThamSo(hienHanh.tham_so).map(([k, v]) => <tr key={k}><td className="w-[40%]">{k}</td><td>{v}</td></tr>)}</tbody></table>
                  {hienHanh && hd.trang_thai !== 'hieu_luc' && <SuaThamSo id={hd.id} dau={JSON.stringify(hienHanh.tham_so, null, 2)} />}
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
                <div className="card-hd px-4 py-2 font-semibold flex items-center gap-3 flex-wrap">{TEN_PHONG_BAN[pb]} · {ds.filter((q: any) => q.chot === 'dong_y').length}/{ds.length} đã chốt
                  {duocLam(n, pb) && ds.some((q: any) => q.chot !== 'dong_y') && <span className="ml-auto font-normal"><ChotTatCa hopDongId={hd.id} pb={pb} con={ds.filter((q: any) => q.chot !== 'dong_y').length} /></span>}</div>
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
