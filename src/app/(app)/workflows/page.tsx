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

  // Chẩn đoán nhịp đồng hồ: nếu có workflow đang bật mà nhiều phút rồi không
  // lượt nào chạy, gần như chắc chắn không có cron nào gọi tới ứng dụng.
  const dangBat = (schedules ?? []).filter((w) => w.enabled);
  const chayGanNhat = (schedules ?? [])
    .map((w) => w.last_run_at).filter(Boolean)
    .sort().reverse()[0] as string | undefined;
  const phutTuLanCuoi = chayGanNhat
    ? Math.floor((Date.now() - new Date(chayGanNhat).getTime()) / 60000)
    : null;
  const cronImLang = dangBat.length > 0 && (phutTuLanCuoi === null || phutTuLanCuoi > 10);

  return (
    <>
      <PageHeader
        eyebrow="Tự động hoá"
        title="Workflow"
        description="Bốn tiến trình chạy nền. Đổi giờ ở đây có hiệu lực ngay, không cần triển khai lại mã nguồn."
      />

      {cronImLang && (
        <section className="card mb-4" data-status="critical">
          <div className="card-pad">
            <p className="eyebrow" style={{ color: 'var(--critical)' }}>Nhịp đồng hồ không hoạt động</p>
            <h2 className="card-title mt-0.5 mb-1.5">
              Có {dangBat.length} workflow đang bật nhưng không lượt nào chạy
              {phutTuLanCuoi === null ? ' bao giờ' : ` trong ${phutTuLanCuoi} phút qua`}
            </h2>
            <p className="text-[12.5px] text-[var(--ink-2)] m-0 mb-2.5 leading-relaxed">
              Cờ &quot;Đang bật&quot; chỉ là giá trị trong cơ sở dữ liệu. Phải có một
              dịch vụ bên ngoài gọi vào địa chỉ dưới đây mỗi phút thì hệ thống mới
              biết đã tới giờ chạy gì.
            </p>
            <div className="callout callout-critical">
              <p className="m-0 mb-1.5"><strong>Cách khắc phục</strong></p>
              <p className="m-0 mb-1">
                1. Vào <span className="mono">cron-job.org</span>, tạo một cronjob mới.
              </p>
              <p className="m-0 mb-1">
                2. URL:{' '}
                <span className="mono">
                  {(process.env.NEXT_PUBLIC_APP_URL ?? '') + '/api/cron/tick'}
                </span>
              </p>
              <p className="m-0">
                3. Lịch chọn Custom, điền <span className="mono">* * * * *</span> để gọi mỗi phút.
              </p>
            </div>
            <p className="text-[11.5px] text-[var(--ink-3)] mt-2.5 mb-0 leading-relaxed">
              Gói Vercel Hobby không cho khai cron mỗi phút trong tệp cấu hình, nên
              dùng dịch vụ ngoài là cách phù hợp. Nhịp một phút chỉ để hỏi xem có gì
              tới hạn không — WF1 và WF4 vẫn chỉ chạy đúng một lần mỗi ngày.
            </p>
          </div>
        </section>
      )}

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
