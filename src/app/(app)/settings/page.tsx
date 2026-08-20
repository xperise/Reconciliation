import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { googleConnection } from '@/lib/google/auth';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

const LOI: Record<string, string> = {
  khong_co_quyen: 'Chỉ quản trị viên mới kết nối được tài khoản Google.',
  state_khong_khop: 'Phiên cấp quyền không khớp. Hãy bấm kết nối lại.',
  thieu_refresh_token: 'Google không trả về mã làm mới. Vào myaccount.google.com/permissions, gỡ quyền của ứng dụng rồi kết nối lại.',
  doi_token_that_bai: 'Không đổi được mã cấp quyền. Kiểm tra Client ID, Client Secret và Redirect URI.',
};

export default async function SettingsPage({
  searchParams,
}: { searchParams: { ok?: string; loi?: string } }) {
  const user = await currentUser();
  if (user?.role !== 'admin') redirect('/');

  const [conn, { count: soTep }] = await Promise.all([
    googleConnection(),
    supabaseAdmin().from('statement_files').select('id', { count: 'exact', head: true }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Quản trị"
        title="Cài đặt"
        description="Kết nối hộp thư mà hệ thống dùng để gửi và đọc email thay bạn."
      />

      {searchParams.ok === 'da_ket_noi' && (
        <p className="card px-4 py-3 text-sm text-[var(--teal-deep)] bg-[var(--teal-wash)] mb-4">
          Đã kết nối tài khoản Google.
        </p>
      )}
      {searchParams.loi && (
        <p role="alert" className="card px-4 py-3 text-sm text-[var(--red)] bg-[var(--red-wash)] mb-4">
          {LOI[searchParams.loi] ?? 'Kết nối thất bại.'}
        </p>
      )}

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <section className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)]">
            <h2 className="text-sm font-bold m-0">Tài khoản Google</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5 mb-0">
              Hệ thống gửi bảng kê và đọc phản hồi khách bằng tài khoản này.
            </p>
          </div>
          <div className="p-4">
            {conn ? (
              <>
                <p className="text-sm m-0">
                  Đang dùng hộp thư <strong className="mono">{conn.email}</strong>
                </p>
                <p className="text-xs text-[var(--muted)] mt-1 mb-3">
                  Kết nối từ {new Date(conn.connected_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                </p>
                <a href="/api/google/authorize" className="btn">Kết nối lại bằng tài khoản khác</a>
              </>
            ) : (
              <>
                <p className="text-sm m-0 mb-3">
                  Chưa kết nối. Workflow sẽ không chạy được cho tới khi bạn cấp quyền.
                </p>
                <a href="/api/google/authorize" className="btn btn-primary">Kết nối Google</a>
              </>
            )}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)]">
            <h2 className="text-sm font-bold m-0">Kho tệp</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5 mb-0">
              Bảng kê và hồ sơ thanh toán lưu trong Supabase Storage, không dùng Google Drive.
            </p>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <p className="m-0">
              Đang lưu <strong className="tnum">{soTep ?? 0}</strong> tệp trong kho{' '}
              <span className="mono">bang-ke</span>.
            </p>
            <div className="bg-[var(--paper)] rounded-md p-3 text-xs leading-relaxed">
              <p className="eyebrow m-0 mb-1.5">Cách kho tệp hoạt động</p>
              <p className="m-0 mb-1.5">
                Kế toán tải tệp ở trang <strong>Tệp bảng kê</strong>, chọn nhóm và kỳ từ danh
                sách. Hệ thống tự đánh số phiên bản nên tên tệp đặt thế nào cũng được.
              </p>
              <p className="m-0">
                Kho để chế độ riêng tư. Email gửi khách kèm liên kết có chữ ký sống 90 ngày,
                người ngoài không đoán được đường dẫn.
              </p>
            </div>
            <a href="/files" className="btn">Mở trang tệp bảng kê</a>
          </div>
        </section>

      </div>
    </>
  );
}
