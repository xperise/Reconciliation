import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { PageHeader } from '@/components/PageHeader';
import { WorkflowCard } from './workflow-card';

export const dynamic = 'force-dynamic';

export default async function WorkflowsPage() {
  const user = await currentUser();
  const laAdmin = user?.role === 'admin';

  const [{ data: schedules }, { data: runs }] = await Promise.all([
    supabaseAdmin().from('workflow_schedules').select('*').order('key'),
    supabaseAdmin().from('workflow_runs').select('*').order('started_at', { ascending: false }).limit(25),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Tự động hóa"
        title="Workflow"
        description="Bốn tiến trình chạy nền. Đổi giờ chạy ở đây là có hiệu lực ngay, không cần triển khai lại mã nguồn."
      />

      {!laAdmin && (
        <p className="card px-4 py-3 text-sm text-[var(--muted)] mb-4">
          Bạn xem được cấu hình nhưng không đổi được. Liên hệ quản trị viên nếu cần điều chỉnh lịch chạy.
        </p>
      )}

      <div className="space-y-4 mb-7">
        {(schedules ?? []).map((wf) => (
          <WorkflowCard key={wf.key} wf={wf} laAdmin={laAdmin} />
        ))}
      </div>

      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)]">
          <h2 className="text-sm font-bold m-0">Lịch sử chạy gần đây</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Bắt đầu</th><th>Workflow</th><th>Nguồn</th><th>Kết quả</th>
                  <th className="text-right">Thành công</th><th className="text-right">Lỗi</th><th>Tóm tắt</th></tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="mono whitespace-nowrap">
                    {new Date(r.started_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                  </td>
                  <td className="mono uppercase">{r.workflow_key}</td>
                  <td className="text-xs">{r.trigger_by === 'manual' ? 'Chạy tay' : 'Theo lịch'}</td>
                  <td>
                    <span className={`badge ${
                      r.status === 'success' ? 'badge-teal'
                        : r.status === 'partial' ? 'badge-amber'
                        : r.status === 'running' ? 'badge-violet' : 'badge-red'}`}>
                      {({ success: 'Thành công', partial: 'Có lỗi lẻ', error: 'Lỗi', running: 'Đang chạy' } as any)[r.status]}
                    </span>
                  </td>
                  <td className="text-right tnum">{r.items_ok}</td>
                  <td className="text-right tnum">{r.items_failed}</td>
                  <td className="text-xs text-[var(--muted)] max-w-[300px] truncate" title={r.summary ?? ''}>
                    {r.summary ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!runs?.length && <p className="empty">Chưa có lượt chạy nào được ghi lại.</p>}
        </div>
      </section>
    </>
  );
}
