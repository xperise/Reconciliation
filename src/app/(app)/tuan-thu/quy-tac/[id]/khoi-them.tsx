import { supabaseAdmin } from '@/lib/supabase/admin';
import { duocLam, NguoiTT } from '@/lib/tuan-thu/db';
import { PhongBan, TEN_PHONG_BAN, TEN_DICH_VU, LoaiDichVu } from '@/lib/tuan-thu/types';
import { COT_RAW, CauTrucMau } from '@/lib/tuan-thu/mau-bang-ke';
import { DuyetSuaDoi, FormDeXuat } from '../../sua-doi/client';
import { PhanTichSuaDoi, VanBan } from '../../agent-ui';
import { DuyetMau, GhepCot, HocMau } from './mau-client';
import { toChucHienTai } from '@/lib/tuan-thu/to-chuc-server';

const PB: PhongBan[] = ['ke_toan', 'supply', 'demand', 'ceo'];
const TT: Record<string, [string, string]> = { cho_duyet: ['Chờ duyệt', 'pill-watch'], hieu_luc: ['Có hiệu lực', 'pill-stable'], tu_choi: ['Từ chối', 'pill-critical'] };
const TT_MAU: Record<string, [string, string]> = { cho_duyet: ['Chờ kế toán duyệt', 'pill-watch'], hieu_luc: ['Đang dùng', 'pill-stable'], thay_the: ['Đã thay', 'pill-neutral'] };
const tep = (p: string) => `/api/tuan-thu/tep?path=${encodeURIComponent(p)}`;

/** Mẫu bảng kê riêng của khách: học từ bảng kê mẫu → kế toán xem ghép cột → duyệt → lần chạy từ raw dựng đúng mẫu. */
export async function KhoiMau({ hd, n }: { hd: any; n: NguoiTT }) {
  const { data, error } = await supabaseAdmin().from('tt_mau_bang_ke').select('*').eq('org_id', await toChucHienTai()).eq('ma_khach', hd.ma_khach).order('phien_ban', { ascending: false });
  const ds = (data ?? []) as any[];
  const ke = duocLam(n, 'ke_toan');
  return (
    <section id="mau" className="card card-pad mb-6">
      <h2 className="card-title mb-1">Mẫu bảng kê của {hd.ma_khach}</h2>
      <p className="text-[12px] text-[var(--ink-3)] mb-3">Upload một bảng kê đã gửi khách — file có nhiều sheet (bản cũ, sheet ẩn, "Copy of…") cũng được: app tự chọn sheet đang dùng làm mẫu. App học cấu trúc: sheet, tiêu đề, cột, dòng tổng, chân trang, danh sách phòng ban; cột nào khớp raw thì tự ghép, cột lạ thì agent gợi ý. Kế toán xem lại ghép cột rồi duyệt — từ đó lần chạy từ raw của khách này ra đúng mẫu.</p>
      {error && <div className="callout callout-high text-[12px] mb-2">Cần chạy supabase/migrations/46_tuan_thu_mau_bang_ke.sql.</div>}
      {ke && <HocMau maKhach={hd.ma_khach} />}
      {ds.length === 0 ? <p className="empty">Chưa có mẫu riêng — đang dùng mẫu chuẩn.</p> : ds.map((m) => {
        const ct = m.cau_truc as CauTrucMau;
        return (
          <details key={m.id} className="mt-3" open={m.trang_thai === 'cho_duyet'}>
            <summary className="cursor-pointer text-[12.5px]"><b>v{m.phien_ban}</b> · <a className="underline" href={tep(m.path)}>{m.ten_tep}</a> · <span className={`pill ${TT_MAU[m.trang_thai][1]}`}>{TT_MAU[m.trang_thai][0]}</span> · {ct.sheets.map((s) => s.ten).join(', ')}</summary>
            {ct.ghiChu.length > 0 && <div className="callout callout-high text-[12px] mt-2">{ct.ghiChu.map((g, i) => <div key={i}>{g}</div>)}</div>}
            {ct.sheets.filter((s) => s.loai !== 'tong_hop').map((s) => (
              <div key={s.ten} className="mt-3">
                <p className="label mb-1">Sheet "{s.ten}" — {TEN_DICH_VU[s.loai as LoaiDichVu]} · tiêu đề dòng {s.hangTieuDe}, dữ liệu từ dòng {s.hangDuLieuDau}, dòng tổng {s.hangTong.join(', ') || '—'}</p>
                <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Cột mẫu</th><th>Lấy từ cột raw</th><th>Giá trị mẫu</th></tr></thead><tbody>
                  {s.cot.map((c) => (
                    <tr key={c.so}><td className="text-[12px]">{c.so}. {c.ten}</td>
                      <td>{m.trang_thai === 'cho_duyet' && ke ? <GhepCot id={m.id} sheet={s.ten} so={c.so} nguon={c.nguon} luaChon={COT_RAW[s.loai as LoaiDichVu]} congThuc={c.congThuc} />
                        : <span className={`text-[12px] ${c.nguon ? '' : 'text-[var(--ink-3)]'}`}>{c.nguon === '#' ? 'Số thứ tự' : c.nguon === '@trang_thai' ? 'Trạng thái (theo tên hiển thị của hợp đồng)' : c.nguon === '@cong_thuc' ? `Giữ công thức của mẫu (=${c.congThuc})` : c.nguon || 'Để trống'}</span>}</td>
                      <td className="text-[11.5px] text-[var(--ink-3)]">{(c.mau ?? []).join(' ; ')}</td></tr>))}
                </tbody></table></div>
              </div>
            ))}
            {ct.sheets.some((s) => s.loai === 'tong_hop') && <p className="text-[12px] mt-2">Sheet tổng hợp phòng ban: giữ danh sách {ct.sheets.find((s) => s.loai === 'tong_hop')?.thDong?.length ?? 0} dòng phòng ban của mẫu, tính lại số tiền từ dữ liệu; phòng ban mới phát sinh được thêm cuối danh sách.</p>}
            {m.trang_thai === 'cho_duyet' && ke && <div className="mt-3"><DuyetMau id={m.id} /></div>}
          </details>
        );
      })}
    </section>
  );
}

/** Sửa đổi quy tắc của hợp đồng này (gộp từ tab Sửa đổi quy tắc). */
export async function KhoiSuaDoi({ hd, n, maChon }: { hd: any; n: NguoiTT; maChon?: string }) {
  const sb = supabaseAdmin();
  const [{ data: qts }, { data: sds }, { data: aiKq }] = await Promise.all([
    sb.from('tt_quy_tac').select('hop_dong_id, ma, noi_dung, gia_tri, phong_ban').eq('org_id', await toChucHienTai()).eq('hop_dong_id', hd.id).order('ma'),
    sb.from('tt_sua_doi').select('*, tt_sua_doi_duyet(*)').eq('org_id', await toChucHienTai()).eq('hop_dong_id', hd.id).order('created_at', { ascending: false }),
    sb.from('tt_ai_ket_qua').select('sua_doi_id, phong_ban, noi_dung, luc').eq('org_id', await toChucHienTai()).eq('loai', 'tac_dong').order('luc', { ascending: false }),
  ]);
  const tacDong = (id: string, pb: string) => ((aiKq ?? []) as any[]).find((k) => k.sua_doi_id === id && k.phong_ban === pb)?.noi_dung ?? null;
  if (hd.trang_thai && hd.trang_thai !== 'hieu_luc') return null;
  return (
    <section id="sua-doi" className="card card-pad mb-6">
      <h2 className="card-title mb-1">Sửa đổi quy tắc so với hợp đồng</h2>
      <p className="text-[12px] text-[var(--ink-3)] mb-3">Một phòng đề xuất → agent từng phòng phân tích tác động → đủ 4/4 head đồng ý thì tạo phiên bản quy tắc mới, áp dụng từ kỳ đã chọn. Một head không đồng ý là bị từ chối.</p>
      <details open={!!maChon}><summary className="cursor-pointer text-[12.5px] font-semibold">+ Đề xuất sửa đổi</summary>
        <div className="mt-3"><FormDeXuat hopDong={[{ id: hd.id, ten: `${hd.ma_khach} — ${hd.so_hop_dong}` }]} quyTac={{ [hd.id]: (qts ?? []) as any[] }} maChon={maChon} hdChon={hd.id} canChonPb={n.laAdmin && !n.phong_ban} /></div>
      </details>
      {(sds ?? []).length === 0 ? <p className="empty">Chưa có đề xuất sửa đổi.</p> : (sds ?? []).map((s: any) => {
        const dsDuyet = s.tt_sua_doi_duyet as any[];
        return (
          <div key={s.id} className="border-t border-[var(--line)] pt-3 mt-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <b>SĐ-{String(s.so).padStart(2, '0')} · {s.ma_quy_tac}</b>
              <span className={`pill ${TT[s.trang_thai][1]}`}>{TT[s.trang_thai][0]}</span>
              <span className="text-[11.5px] text-[var(--ink-3)]">Đề xuất bởi {TEN_PHONG_BAN[s.phong_ban as PhongBan]} · hiệu lực từ {s.hieu_luc_tu}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 text-[12.5px] mb-3">
              <div><p className="label">Đang áp dụng</p>{s.noi_dung_goc}</div>
              <div><p className="label">Đề xuất</p>{s.noi_dung_moi}{s.gia_tri_moi ? ` — ${s.gia_tri_moi}` : ''}{s.thay_doi_tham_so && <div className="mono text-[11px] mt-1">Tham số: {JSON.stringify(s.thay_doi_tham_so)}</div>}</div>
              <div><p className="label">Lý do</p>{s.ly_do}</div>
              <div><p className="label">Căn cứ</p>{s.can_cu ?? <i className="text-[var(--ink-3)]">Chưa có — Điều 12 HĐ yêu cầu văn bản ký dưới dạng phụ lục</i>}</div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {PB.map((pb) => { const d = dsDuyet.find((x) => x.phong_ban === pb); const kq = tacDong(s.id, pb);
                return (
                  <div key={pb} className="card card-pad">
                    <div className="text-[12px] font-semibold mb-1">{TEN_PHONG_BAN[pb]}</div>
                    {d ? <><span className={`pill ${d.quyet_dinh === 'dong_y' ? 'pill-stable' : 'pill-critical'}`}>{d.quyet_dinh === 'dong_y' ? 'Đồng ý' : 'Không đồng ý'}</span>{d.y_kien && <div className="text-[11px] mt-1">{d.y_kien}</div>}</>
                      : s.trang_thai === 'cho_duyet' && duocLam(n, pb) ? <DuyetSuaDoi id={s.id} pb={pb} /> : <span className="pill pill-watch">Chờ</span>}
                    {s.trang_thai === 'cho_duyet' && duocLam(n, pb) ? <PhanTichSuaDoi suaDoiId={s.id} pb={pb} ketQua={kq} />
                      : kq ? <details className="mt-1"><summary className="text-[12px] cursor-pointer">Agent {TEN_PHONG_BAN[pb]} phân tích</summary><div className="text-[12px]"><VanBan text={kq} /></div></details> : null}
                  </div>
                ); })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
