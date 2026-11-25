import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { nguoiTT } from '@/lib/tuan-thu/db';
import { PhongBan, TEN_PHONG_BAN } from '@/lib/tuan-thu/types';

export const dynamic = 'force-dynamic';
const PB: PhongBan[] = ['ke_toan', 'demand', 'supply', 'ceo'];
const TT_HD: Record<string, [string, string]> = { dang_doc: ['Agent đang đọc', 'pill-watch'], cho_chot: ['Chờ chốt', 'pill-high'], hieu_luc: ['Đang hiệu lực', 'pill-stable'], het_hieu_luc: ['Hết hiệu lực', 'pill-neutral'], loi: ['Lỗi đọc', 'pill-critical'] };

/** Danh sách khách hàng / hợp đồng — bấm vào để xem chi tiết. */
export default async function Page() {
  const n = (await nguoiTT())!;
  const sb = supabaseAdmin();
  const [{ data: hds }, { data: qt }, { data: bo }, { data: sd }] = await Promise.all([
    sb.from('tt_hop_dong').select('id, ma_khach, ten_khach, so_hop_dong, ngay_ky, trang_thai, hieu_luc_tu, billing_groups(ten_nhom)').order('ma_khach').order('created_at', { ascending: false }),
    sb.from('tt_quy_tac').select('hop_dong_id, phong_ban, chot'),
    sb.from('tt_bo_quy_tac').select('hop_dong_id, phien_ban'),
    sb.from('tt_sua_doi').select('hop_dong_id, trang_thai').eq('trang_thai', 'cho_duyet'),
  ]);
  const ds = (hds ?? []) as any[];
  const dem = (id: string, pb: PhongBan) => { const x = ((qt ?? []) as any[]).filter((q) => q.hop_dong_id === id && q.phong_ban === pb); return { da: x.filter((q) => q.chot === 'dong_y').length, tong: x.length }; };
  const ver = (id: string) => Math.max(0, ...((bo ?? []) as any[]).filter((b) => b.hop_dong_id === id).map((b) => b.phien_ban));
  const cho = (id: string) => ((sd ?? []) as any[]).filter((x) => x.hop_dong_id === id).length;
  const khach = [...new Set(ds.map((h) => h.ma_khach))];
  return (
    <>
      <PageHeader eyebrow="Tuân thủ bảng kê" title="Hợp đồng & bộ quy tắc"
        description="Danh sách khách hàng và hợp đồng. Bấm vào một hợp đồng để xem tóm tắt điều khoản, tham số máy và quy tắc của 4 phòng."
        action={<Link href="/tuan-thu/hop-dong/moi" className="btn btn-primary btn-sm">+ Thêm hợp đồng / khách mới</Link>} />
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead><tr><th>Khách</th><th>Số hợp đồng</th><th>Trạng thái</th><th>Quy tắc</th>
            {PB.map((p) => <th key={p} className="text-right">{TEN_PHONG_BAN[p]} đã chốt</th>)}<th>Sửa đổi chờ</th><th></th></tr></thead>
          <tbody>
            {ds.length === 0 && <tr><td colSpan={9} className="empty">Chưa có hợp đồng nào.</td></tr>}
            {khach.map((ma) => ds.filter((h) => h.ma_khach === ma).map((h, i) => {
              const tt = TT_HD[h.trang_thai ?? 'hieu_luc'] ?? TT_HD.hieu_luc;
              const can = (pb: PhongBan) => (n.laAdmin || n.phong_ban === pb) && h.trang_thai === 'cho_chot' && dem(h.id, pb).da < dem(h.id, pb).tong;
              return (
                <tr key={h.id}>
                  <td>{i === 0 ? <><b className="mono">{h.ma_khach}</b> <span className="text-[12px]">{h.ten_khach}</span>{h.billing_groups?.ten_nhom ? <div className="text-[11px] text-[var(--ink-3)]">{h.billing_groups.ten_nhom}</div> : null}</> : null}</td>
                  <td className="text-[12px]"><Link href={`/tuan-thu/quy-tac/${h.id}`} className="underline">{h.so_hop_dong}</Link>{h.ngay_ky ? <div className="text-[11px] text-[var(--ink-3)]">ký {new Date(h.ngay_ky).toLocaleDateString('vi-VN')}</div> : null}</td>
                  <td><span className={`pill ${tt[1]}`}>{tt[0]}</span></td>
                  <td className="text-[12px]">v{ver(h.id) || '—'}{h.trang_thai === 'cho_chot' ? ' (nháp)' : ''}</td>
                  {PB.map((p) => { const d = dem(h.id, p); return <td key={p} className={`text-right text-[12px] ${can(p) ? 'font-semibold text-[var(--critical)]' : ''}`}>{d.tong ? `${d.da}/${d.tong}` : '—'}</td>; })}
                  <td>{cho(h.id) ? <Link href={`/tuan-thu/quy-tac/${h.id}#sua-doi`} className="pill pill-watch">{cho(h.id)}</Link> : '—'}</td>
                  <td className="text-right"><Link href={`/tuan-thu/quy-tac/${h.id}`} className="btn btn-sm">Xem chi tiết</Link></td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-[var(--ink-3)] mt-2">Số in đậm đỏ: phòng của bạn còn quy tắc chưa chốt ở hợp đồng chờ chốt.</p>
    </>
  );
}
