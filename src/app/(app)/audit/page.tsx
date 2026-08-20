import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

const NHAN: Record<string, string> = {
  'approval.decide': 'Duyệt phản hồi khách',
  'approval.auto_close': 'Chốt mặc định',
  'tracking.override': 'Can thiệp tracking',
  'billing_group.create': 'Thêm nhóm đối soát',
  'billing_group.update': 'Sửa nhóm đối soát',
  'workflow.schedule_update': 'Đổi lịch workflow',
  'workflow.run_manual': 'Chạy workflow thủ công',
  'file.upload': 'Tải tệp lên',
  'file.send': 'Gửi tệp cho khách',
  'file.delete': 'Xóa tệp',
  'google.connect': 'Kết nối Google',
  'user.create': 'Tạo người dùng',
  'user.activate': 'Mở khóa người dùng',
  'user.deactivate': 'Khóa người dùng',
};

export default async function AuditPage() {
  const [{ data: audit }, { data: statusLog }] = await Promise.all([
    supabaseAdmin().from('audit_log').select('*').order('created_at', { ascending: false }).limit(150),
    supabaseAdmin().from('status_log').select('*').order('created_at', { ascending: false }).limit(100),
  ]);

  const fmt = (s: string) => new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  return (
    <>
      <PageHeader
        eyebrow="Truy vết"
        title="Nhật ký"
        description="Ai làm gì, lúc nào. Dùng khi cần tra soát tranh chấp với khách hoặc đối chiếu nội bộ."
      />

      <div className="grid xl:grid-cols-2 gap-5 items-start">
        <section className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)]">
            <h2 className="text-sm font-bold m-0">Thao tác của người dùng</h2>
          </div>
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="tbl">
              <thead><tr><th>Thời điểm</th><th>Người</th><th>Hành động</th><th>Ghi chú</th></tr></thead>
              <tbody>
                {(audit ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="mono whitespace-nowrap">{fmt(r.created_at)}</td>
                    <td className="text-xs">{r.actor_email ?? '—'}</td>
                    <td className="font-semibold text-xs">{NHAN[r.action] ?? r.action}</td>
                    <td className="text-xs text-[var(--muted)] max-w-[220px] truncate" title={r.note ?? ''}>
                      {r.note ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!audit?.length && <p className="empty">Chưa có thao tác nào được ghi lại.</p>}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)]">
            <h2 className="text-sm font-bold m-0">Chuyển trạng thái của hệ thống</h2>
          </div>
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="tbl">
              <thead><tr><th>Thời điểm</th><th>Nhóm</th><th>Kỳ</th><th>Chuyển</th><th className="text-right">Giờ chờ</th></tr></thead>
              <tbody>
                {(statusLog ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="mono whitespace-nowrap">{fmt(r.created_at)}</td>
                    <td className="text-xs font-semibold">{r.ten_nhom}</td>
                    <td className="mono text-xs">{r.ky_doi_soat}</td>
                    <td className="text-xs">{r.status_cu ?? '(mới)'} → <strong>{r.status_moi}</strong></td>
                    <td className="text-right tnum text-xs">{r.gio_o_status_cu ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!statusLog?.length && <p className="empty">Chưa có chuyển trạng thái nào.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
