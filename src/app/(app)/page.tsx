import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentPeriod } from '@/lib/period';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { SlaRail } from '@/components/SlaRail';
import { TrackingStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

function Metric({ label, value, sub, tone }: {
  label: string; value: string | number; sub?: string; tone?: 'teal' | 'amber' | 'red';
}) {
  const color = tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : 'var(--violet-deep)';
  return (
    <div className="card p-4">
      <p className="eyebrow m-0">{label}</p>
      <p className="text-[2rem] font-bold leading-none mt-2 mb-0 tnum" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-[var(--muted)] mt-1.5 mb-0">{sub}</p>}
    </div>
  );
}

export default async function Dashboard() {
  const sb = supabaseAdmin();
  const ky = currentPeriod();

  const [{ data: kyNay }, { data: chuaChot }, { data: nutThat }, { data: lichChay }] = await Promise.all([
    sb.from('tracking').select('status').eq('ky_doi_soat', ky),
    sb.from('v_khach_chua_chot').select('*').limit(12),
    sb.from('v_thoi_gian_trung_binh_trang_thai').select('*').limit(5),
    sb.from('workflow_schedules').select('key, ten, enabled, last_run_at, last_status, last_summary'),
  ]);

  const rows = kyNay ?? [];
  const dem = (s: TrackingStatus[]) => rows.filter((r) => s.includes(r.status as TrackingStatus)).length;

  const xong = dem(['da_chot', 'hoan_tat_cho_thanh_toan', 'mac_dinh_chap_thuan', 'da_gui_ho_so_thanh_toan']);
  const choDuyet = dem(['cho_duyet_phan_loai']);
  const kestNoiBo = dem(['cho_file_da_nhac_noi_bo', 'can_chinh_sua', 'cho_ho_so_thanh_toan']);
  const xuLyTay = dem(['can_xu_ly_tay']);
  const quaHan = (chuaChot ?? []).filter((r: any) => (r.so_ngay_tre ?? 0) > 0).length;

  const NHAN_TRANG_THAI: Record<string, string> = {
    success: 'Chạy tốt', partial: 'Có lỗi lẻ', error: 'Lỗi', running: 'Đang chạy',
  };

  return (
    <>
      <PageHeader
        eyebrow={`Kỳ đối soát ${ky}`}
        title="Tổng quan"
        description="Bức tranh kỳ hiện tại: đã chốt được bao nhiêu, đang tắc ở đâu, và ai đang phải chờ ai."
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-7">
        <Metric label="Đã chốt kỳ này" value={xong} sub={`trên tổng ${rows.length} nhóm`} />
        <Metric label="Chờ kế toán duyệt" value={choDuyet} sub="khách đã phản hồi" tone={choDuyet ? 'amber' : 'teal'} />
        <Metric label="Chờ nội bộ upload" value={kestNoiBo} sub="bảng kê hoặc hồ sơ" tone={kestNoiBo ? 'amber' : 'teal'} />
        <Metric label="Khách quá hạn" value={quaHan} sub="tính trên mọi kỳ" tone={quaHan ? 'red' : 'teal'} />
        <Metric label="Cần xử lý tay" value={xuLyTay} sub="hệ thống đã dừng" tone={xuLyTay ? 'red' : 'teal'} />
      </div>

      <div className="grid lg:grid-cols-[1.55fr_1fr] gap-5">
        {/* ---- Việc đang treo lâu nhất ---- */}
        <section className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
            <h2 className="text-sm font-bold m-0">Kỳ chưa chốt, trễ nhiều nhất trước</h2>
            <Link href="/tracking" className="text-xs font-semibold text-[var(--violet-deep)] no-underline">
              Xem tất cả
            </Link>
          </div>

          {chuaChot?.length ? (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nhóm</th><th>Kỳ</th><th>Trạng thái</th>
                    <th>Escalate</th><th className="text-right">Trễ</th>
                  </tr>
                </thead>
                <tbody>
                  {chuaChot.map((r: any) => (
                    <tr key={r.id}>
                      <td className="font-semibold">{r.ten_nhom}</td>
                      <td className="mono">{r.ky_doi_soat}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>
                        <SlaRail
                          level={r.escalate_level}
                          loops={r.so_vong_remind}
                          maxLevel={r.nhom_escalate === 1 ? 2 : 3}
                        />
                      </td>
                      <td className="text-right tnum font-semibold"
                          style={{ color: r.so_ngay_tre > 0 ? 'var(--red)' : 'var(--muted)' }}>
                        {r.so_ngay_tre == null ? '—' : r.so_ngay_tre > 0 ? `${r.so_ngay_tre} ngày` : 'trong hạn'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty"><strong>Không còn kỳ nào treo.</strong>Mọi nhóm đã chốt hoặc đang trong hạn.</p>
          )}
        </section>

        <div className="space-y-5">
          {/* ---- Tình trạng workflow ---- */}
          <section className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
              <h2 className="text-sm font-bold m-0">Workflow</h2>
              <Link href="/workflows" className="text-xs font-semibold text-[var(--violet-deep)] no-underline">
                Cấu hình
              </Link>
            </div>
            <ul className="list-none m-0 p-0">
              {(lichChay ?? []).map((w: any) => (
                <li key={w.key} className="px-4 py-3 border-b border-[var(--line-soft)] last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{w.ten}</span>
                    <span className={`badge ${
                      !w.enabled ? 'badge-slate'
                        : w.last_status === 'error' ? 'badge-red'
                        : w.last_status === 'partial' ? 'badge-amber' : 'badge-teal'}`}>
                      {w.enabled ? (NHAN_TRANG_THAI[w.last_status] ?? 'Chưa chạy') : 'Đang tắt'}
                    </span>
                  </div>
                  {w.last_summary && (
                    <p className="text-xs text-[var(--muted)] mt-1 mb-0 line-clamp-2">{w.last_summary}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* ---- Nút thắt cổ chai ---- */}
          <section className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--line)]">
              <h2 className="text-sm font-bold m-0">Trạng thái tốn thời gian nhất</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5 mb-0">
                Trung bình mỗi kỳ nằm lại bao lâu trước khi chuyển tiếp.
              </p>
            </div>
            {nutThat?.length ? (
              <ul className="list-none m-0 p-0">
                {nutThat.map((r: any) => (
                  <li key={r.trang_thai}
                      className="px-4 py-2.5 border-b border-[var(--line-soft)] last:border-0 flex items-center justify-between gap-3">
                    <StatusBadge status={r.trang_thai} />
                    <span className="text-sm font-semibold tnum whitespace-nowrap">
                      {r.gio_trung_binh} giờ
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Chưa đủ dữ liệu để tính.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
