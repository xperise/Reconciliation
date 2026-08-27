import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { PageHeader } from '@/components/PageHeader';
import { WorkflowCard } from './workflow-card';
import { RunRow } from './run-row';

export const dynamic = 'force-dynamic';

export default async function WorkflowsPage() {
  const user = await currentUser();
  const laAdmin = user?.role === 'admin';

  const [{ data: schedules }, { data: runs }] = await Promise.all([
    supabaseAdmin().from('workflow_schedules').select('*').order('key'),
    supabaseAdmin().from('workflow_runs').select('*').order('started_at', { ascending: false }).limit(40),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Tự động hoá"
        title="Workflow"
        description="Bốn tiến trình chạy nền. Đổi giờ ở đây có hiệu lực ngay, không cần triển khai lại mã nguồn."
      />

      {!laAdmin && (
        <p className="callout callout-accent mb-4">
          Bạn xem được cấu hình nhưng không đổi được. Liên hệ quản trị viên nếu cần điều chỉnh lịch chạy.
        </p>
      )}

      <div className="flex flex-col gap-3 mb-5">
        {(schedules ?? []).map((wf) => (
          <WorkflowCard key={wf.key} wf={wf} laAdmin={laAdmin} />
        ))}
      </div>

      <section className="card overflow-hidden">
        <div className="card-hd">
          <p className="eyebrow">Truy vết</p>
          <h2 className="card-title mt-0.5">Lịch sử chạy gần đây</h2>
          <p className="card-note m-0 mt-1">
            Bấm vào một dòng để xem lượt đó đã gửi thư gì, cho khách nào, kỳ nào.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Bắt đầu</th><th>Workflow</th><th>Nguồn</th><th>Kết quả</th>
                <th className="text-right">Thành công</th>
                <th className="text-right">Lỗi</th>
                <th className="text-right">Thư</th>
                <th>Tóm tắt</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r) => <RunRow key={r.id} r={r} />)}
            </tbody>
          </table>
          {!runs?.length && (
            <p className="empty">
              <strong>Chưa có lượt chạy nào.</strong>
              Bấm "Chạy thử ngay" trên một workflow ở trên để tạo lượt đầu tiên.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
