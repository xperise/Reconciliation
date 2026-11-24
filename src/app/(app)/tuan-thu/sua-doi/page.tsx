import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { duocLam, nguoiTT } from '@/lib/tuan-thu/db';
import { PhongBan, TEN_PHONG_BAN } from '@/lib/tuan-thu/types';
import { DuyetSuaDoi, FormDeXuat } from './client';
import { PhanTichSuaDoi, VanBan } from '../agent-ui';

export const dynamic = 'force-dynamic';
const PB: PhongBan[] = ['ke_toan', 'supply', 'demand', 'ceo'];
const TT: Record<string, [string, string]> = { cho_duyet: ['Chờ duyệt', 'pill-watch'], hieu_luc: ['Có hiệu lực', 'pill-stable'], tu_choi: ['Từ chối', 'pill-critical'] };

export default async function Page({ searchParams }: { searchParams: { hd?: string; ma?: string } }) {
  const sb = supabaseAdmin();
  const n = (await nguoiTT())!;
  const [{ data: hds }, { data: qts }, { data: sds }, { data: aiKq }] = await Promise.all([
    sb.from('tt_hop_dong').select('id, ma_khach, so_hop_dong').order('ma_khach'),
    sb.from('tt_quy_tac').select('hop_dong_id, ma, noi_dung, gia_tri, phong_ban').order('ma'),
    sb.from('tt_sua_doi').select('*, tt_hop_dong(ma_khach), tt_sua_doi_duyet(*)').order('created_at', { ascending: false }),
    sb.from('tt_ai_ket_qua').select('sua_doi_id, phong_ban, noi_dung, luc').eq('loai', 'tac_dong').order('luc', { ascending: false }),
  ]);
  const tacDong = (id: string, pb: string) => ((aiKq ?? []) as any[]).find((k) => k.sua_doi_id === id && k.phong_ban === pb)?.noi_dung ?? null;
  const quyTac: Record<string, any[]> = {};
  for (const q of qts ?? []) (quyTac[(q as any).hop_dong_id] ??= []).push(q);
  return (
    <>
      <PageHeader eyebrow="Tuân thủ bảng kê" title="Sửa đổi quy tắc so với hợp đồng"
        description="Một phòng ban đề xuất → agent của từng phòng xem tác động trong scope → đủ 4/4 head đồng ý thì tạo phiên bản quy tắc mới, áp dụng từ kỳ đã chọn. Một head không đồng ý là đề xuất bị từ chối." />
      <section className="card card-pad mb-5">
        <h2 className="card-title mb-3">Đề xuất sửa đổi</h2>
        <FormDeXuat hopDong={(hds ?? []).map((h: any) => ({ id: h.id, ten: `${h.ma_khach} — ${h.so_hop_dong}` }))}
          quyTac={quyTac} maChon={searchParams.ma} hdChon={searchParams.hd} canChonPb={n.laAdmin && !n.phong_ban} />
      </section>
      {(sds ?? []).map((s: any) => {
        const dsDuyet = s.tt_sua_doi_duyet as any[];
        return (
          <section key={s.id} className="card card-pad mb-4">
            <div className="flex items-center gap-2 mb-2">
              <b>SĐ-{String(s.so).padStart(2, '0')} · {s.tt_hop_dong?.ma_khach} · {s.ma_quy_tac}</b>
              <span className={`pill ${TT[s.trang_thai][1]}`}>{TT[s.trang_thai][0]}</span>
              <span className="text-[11.5px] text-[var(--ink-3)]">Đề xuất bởi {TEN_PHONG_BAN[s.phong_ban as PhongBan]} · hiệu lực từ {s.hieu_luc_tu}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 text-[12.5px] mb-3">
              <div><p className="label">Hợp đồng gốc / đang áp dụng</p>{s.noi_dung_goc}</div>
              <div><p className="label">Đề xuất</p>{s.noi_dung_moi}{s.gia_tri_moi ? ` — ${s.gia_tri_moi}` : ''}
                {s.thay_doi_tham_so && <div className="mono text-[11px] mt-1">Tham số: {JSON.stringify(s.thay_doi_tham_so)}</div>}</div>
              <div><p className="label">Lý do</p>{s.ly_do}</div>
              <div><p className="label">Căn cứ</p>{s.can_cu ?? <i className="text-[var(--ink-3)]">Chưa có — Điều 12 HĐ yêu cầu văn bản ký dưới dạng phụ lục</i>}</div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {PB.map((pb) => {
                const d = dsDuyet.find((x) => x.phong_ban === pb);
                return (
                  <div key={pb} className="card card-pad">
                    <div className="text-[12px] font-semibold mb-1">{TEN_PHONG_BAN[pb]}</div>
                    {d ? <><span className={`pill ${d.quyet_dinh === 'dong_y' ? 'pill-stable' : 'pill-critical'}`}>{d.quyet_dinh === 'dong_y' ? 'Đồng ý' : 'Không đồng ý'}</span>
                      {d.y_kien && <div className="text-[11px] mt-1">{d.y_kien}</div>}</>
                      : s.trang_thai === 'cho_duyet' && duocLam(n, pb) ? <DuyetSuaDoi id={s.id} pb={pb} /> : <span className="pill pill-watch">Chờ</span>}
                    {s.trang_thai === 'cho_duyet' && duocLam(n, pb) ? <PhanTichSuaDoi suaDoiId={s.id} pb={pb} ketQua={tacDong(s.id, pb)} />
                      : tacDong(s.id, pb) ? <details className="mt-1"><summary className="text-[12px] cursor-pointer">Agent {TEN_PHONG_BAN[pb]} phân tích</summary><div className="text-[12px]"><VanBan text={tacDong(s.id, pb)} /></div></details> : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
