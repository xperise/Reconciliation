import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { ApprovalCard } from './approval-card';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const { data } = await supabaseAdmin()
    .from('tracking')
    .select('*')
    .eq('status', 'cho_duyet_phan_loai')
    .order('updated_at', { ascending: true });

  const rows = data ?? [];

  return (
    <>
      <PageHeader
        eyebrow={`${rows.length} việc đang chờ`}
        title="Chờ duyệt"
        description="Khách đã phản hồi và hệ thống đã phân loại sẵn. Đọc tóm tắt, đối chiếu nguyên văn nếu cần, rồi quyết định bước tiếp theo."
      />

      {rows.length === 0 ? (
        <div className="card">
          <p className="empty">
            <strong>Không còn việc nào chờ duyệt.</strong>
            Khi khách trả lời email bảng kê, việc sẽ tự xuất hiện ở đây trong vòng một phút.
          </p>
        </div>
      ) : (
        <div className="grid xl:grid-cols-2 gap-4 items-start">
          {rows.map((r) => <ApprovalCard key={r.id} row={r} />)}
        </div>
      )}
    </>
  );
}
