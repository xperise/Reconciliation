import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { Shell } from './shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');

  const sb = supabaseAdmin();
  const [choDuyet, thongBao] = await Promise.all([
    sb.from('tracking').select('id', { count: 'exact', head: true })
      .eq('status', 'cho_duyet_phan_loai'),
    sb.from('notifications').select('*')
      .order('created_at', { ascending: false }).limit(30),
  ]);

  // Chỉ giữ thông báo dành cho vai trò của người đang đăng nhập
  const items = (thongBao.data ?? []).filter((n: any) =>
    (!n.user_id || n.user_id === user.id)
    && (!n.roles || n.roles.includes(user.role)));

  return (
    <Shell
      role={user.role}
      email={user.email}
      userId={user.id}
      soChoDuyet={choDuyet.count ?? 0}
      thongBao={items}
    >
      {children}
    </Shell>
  );
}
