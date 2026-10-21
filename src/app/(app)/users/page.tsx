import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { AccessToggle, CreateUser, DoiMatKhau, ToggleUser, XoaUser } from './user-form';

export const dynamic = 'force-dynamic';

const VAI_TRO: Record<string, string> = {
  admin: 'Quản trị', ke_toan: 'Kế toán', pm: 'PM', high_level: 'Cấp quản lý',
};

export default async function UsersPage() {
  const me = await currentUser();
  if (me?.role !== 'admin') redirect('/');

  const { data } = await supabaseAdmin().from('profiles').select('*').order('created_at');

  return (
    <>
      <PageHeader
        eyebrow="Quản trị"
        title="Người dùng"
        description="Tài khoản do bạn cấp. Không ai tự đăng ký được."
      />

      <section className="card overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-[var(--line)]">
          <h2 className="text-sm font-bold m-0">Cấp tài khoản mới</h2>
        </div>
        <CreateUser />
      </section>

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Được xem</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).map((u) => (
              <tr key={u.id}>
                <td className="font-semibold">{u.full_name || '—'}</td>
                <td className="text-xs">{u.email}</td>
                <td><span className="pill pill-neutral">{VAI_TRO[u.role] ?? u.role}</span></td>
                <td>
                  <AccessToggle
                    id={u.id}
                    q={{
                      xperise: u.xem_xperise ?? true,
                      mlx: u.xem_mlx ?? true,
                      // Chưa chạy SQL 22: quyền Dashboard cũ coi như cả 3 phần
                      all: !!(u.xem_dashboard && (u.xem_db_all ?? true)),
                      ts: !!(u.xem_dashboard && (u.xem_db_ts ?? true)),
                      m: !!(u.xem_dashboard && (u.xem_db_m ?? true)),
                    }}
                    isAdmin={u.role === 'admin'}
                  />
                </td>
                <td>
                  <span className={`badge ${u.is_active ? 'badge-teal' : 'badge-red'}`}>
                    {u.is_active ? 'Đang hoạt động' : 'Đã khóa'}
                  </span>
                </td>
                <td className="text-right">
                  {u.id !== me.id && (
                    <div className="flex items-start justify-end gap-2 flex-wrap">
                      <DoiMatKhau id={u.id} email={u.email} />
                      <ToggleUser id={u.id} active={u.is_active} />
                      <XoaUser id={u.id} email={u.email} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
