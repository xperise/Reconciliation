import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { TrackingStatus } from '@/lib/types';
import { AuditRow } from './audit-row';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const [{ data: audit }, { data: statusLog }] = await Promise.all([
    supabaseAdmin().from('audit_log').select('*').order('created_at', { ascending: false }).limit(200),
    supabaseAdmin().from('status_log').select('*').order('created_at', { ascending: false }).limit(150),
  ]);

  const gio = (s: string) =>
    new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  return (
    <>
      <PageHeader
        eyebrow="Truy vết"
        title="Nhật ký"
        description="Ai làm gì, lúc nào, đổi từ giá trị nào sang giá trị nào. Dùng khi tra soát tranh chấp với khách."
      />

      <section className="card overflow-hidden mb-4">
        <div className="card-hd">
          <p className="eyebrow">Con người</p>
          <h2 className="card-title mt-0.5">Thao tác của người dùng</h2>
          <p className="card-note m-0 mt-1">Bấm vào dòng để xem chi tiết từng trường đã đổi.</p>
        </div>
        <div className="overflow-x-auto" style={{ maxHeight: '60vh' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Thời điểm</th><th>Người thực hiện</th><th>Hành động</th>
                <th>Đối tượng</th><th>Ghi chú</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(audit ?? []).map((r) => <AuditRow key={r.id} r={r} />)}
            </tbody>
          </table>
          {!audit?.length && (
            <p className="empty">
              <strong>Chưa có thao tác nào được ghi lại.</strong>
              Mọi thay đổi do người thực hiện sẽ xuất hiện ở đây.
            </p>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="card-hd">
          <p className="eyebrow">Hệ thống</p>
          <h2 className="card-title mt-0.5">Chuyển trạng thái tự động</h2>
          <p className="card-note m-0 mt-1">
            Cột giờ chờ cho biết kỳ đó nằm lại trạng thái cũ bao lâu — đây là nguồn tính nút thắt cổ chai.
          </p>
        </div>
        <div className="overflow-x-auto" style={{ maxHeight: '60vh' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Thời điểm</th><th>Nhóm</th><th>Kỳ</th>
                <th>Từ trạng thái</th><th>Sang trạng thái</th>
                <th className="text-right">Giờ chờ</th><th>Nguyên nhân trễ</th>
              </tr>
            </thead>
            <tbody>
              {(statusLog ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[12px] whitespace-nowrap">{gio(r.created_at)}</td>
                  <td className="text-[12.5px] font-semibold">{r.ten_nhom}</td>
                  <td className="mono text-[12px]">{r.ky_doi_soat}</td>
                  <td>
                    {r.status_cu
                      ? <StatusBadge status={r.status_cu as TrackingStatus} />
                      : <span className="pill pill-neutral">khởi tạo</span>}
                  </td>
                  <td><StatusBadge status={r.status_moi as TrackingStatus} /></td>
                  <td className="text-right mono text-[12px]"
                      style={Number(r.gio_o_status_cu) > 48
                        ? { color: 'var(--critical)', fontWeight: 600 } : undefined}>
                    {r.gio_o_status_cu ?? '—'}
                  </td>
                  <td className="text-[12px] text-[var(--ink-3)]">
                    {r.nguyen_nhan_tre === 'internal' ? 'Nội bộ'
                      : r.nguyen_nhan_tre === 'customer' ? 'Khách hàng' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!statusLog?.length && (
            <p className="empty">
              <strong>Chưa có chuyển trạng thái nào.</strong>
              Nhật ký này ghi tự động mỗi khi một kỳ đổi trạng thái.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
