import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { TrackingStatus } from '@/lib/types';
import { ApprovalRow } from './approval-row';

export const dynamic = 'force-dynamic';

const NHAN_QD: Record<string, string> = {
  dong_y: 'Đồng ý', can_sua: 'Cần sửa', tu_choi: 'Từ chối', bo_qua: 'Bỏ qua',
};

export default async function ApprovalsPage() {
  const sb = supabaseAdmin();

  const [{ data: cho }, { data: daDuyet }] = await Promise.all([
    sb.from('tracking').select('*')
      .eq('status', 'cho_duyet_phan_loai')
      .order('updated_at', { ascending: true }),
    // Giữ lại lịch sử duyệt để tra cứu về sau, không xoá khỏi màn hình
    sb.from('tracking').select('*, profiles:nguoi_duyet(full_name, email)')
      .not('ket_qua_duyet', 'is', null)
      .not('ngay_duyet', 'is', null)
      .order('ngay_duyet', { ascending: false })
      .limit(40),
  ]);

  const rows = cho ?? [];

  return (
    <>
      <PageHeader
        eyebrow={rows.length ? `${rows.length} việc đang chờ` : 'Không còn việc chờ'}
        title="Chờ duyệt"
        description="Khách đã phản hồi và hệ thống đã phân loại sẵn. Bấm Xem chi tiết để đọc nguyên văn rồi quyết định."
      />

      <section className="card overflow-hidden mb-4">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Kỳ bảng kê</th>
                  <th>Nhận lúc</th>
                  <th>Phân loại</th>
                  <th>Tóm tắt</th>
                  <th className="text-right no-print"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <ApprovalRow key={r.id} row={r} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            <strong>Không còn việc nào chờ duyệt.</strong>
            Khi khách trả lời email bảng kê, việc sẽ tự xuất hiện ở đây trong vòng một phút.
          </p>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="card-hd">
          <p className="eyebrow">Lịch sử</p>
          <h2 className="card-title mt-0.5">Đã duyệt gần đây</h2>
          <p className="card-note m-0 mt-1">
            Bản ghi được giữ lại sau khi duyệt, để tra cứu ai quyết định gì và lúc nào.
          </p>
        </div>
        {daDuyet?.length ? (
          <div className="overflow-x-auto" style={{ maxHeight: '46vh' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Khách hàng</th><th>Kỳ</th><th>Quyết định</th>
                  <th>Người duyệt</th><th>Lúc</th><th>Trạng thái hiện tại</th>
                </tr>
              </thead>
              <tbody>
                {daDuyet.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <span className="font-semibold">{r.ten_nhom}</span>
                      <span className="sub mono">{r.ma_he_thong}</span>
                    </td>
                    <td className="mono text-[12px]">{r.ky_doi_soat}</td>
                    <td>
                      <span className={`pill ${
                        r.ket_qua_duyet === 'dong_y' ? 'pill-stable'
                          : r.ket_qua_duyet === 'tu_choi' ? 'pill-critical'
                          : r.ket_qua_duyet === 'bo_qua' ? 'pill-neutral' : 'pill-high'}`}>
                        {NHAN_QD[r.ket_qua_duyet] ?? r.ket_qua_duyet}
                      </span>
                    </td>
                    <td className="text-[12px]">
                      {r.profiles?.full_name || r.profiles?.email || '—'}
                    </td>
                    <td className="mono text-[11.5px] whitespace-nowrap text-[var(--ink-3)]">
                      {r.ngay_duyet
                        ? new Date(r.ngay_duyet).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
                        : '—'}
                    </td>
                    <td><StatusBadge status={r.status as TrackingStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            <strong>Chưa có quyết định nào được ghi lại.</strong>
            Mỗi lần bạn bấm Đồng ý, Cần sửa, Từ chối hay Bỏ qua đều lưu vào đây.
          </p>
        )}
      </section>
    </>
  );
}
