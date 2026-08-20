import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { Nav } from './nav';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Hai lượt gọi này độc lập nhau nên chạy song song. Trước đây chúng nối
  // tiếp, cộng thêm lượt kiểm tra phiên trong middleware là ba vòng mạng
  // xếp hàng trước khi trang bắt đầu dựng.
  const [user, choDuyet] = await Promise.all([
    currentUser(),
    supabaseAdmin()
      .from('tracking')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'cho_duyet_phan_loai'),
  ]);

  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen">
      <Nav role={user.role} email={user.email} soChoDuyet={choDuyet.count ?? 0} />
      <main className="flex-1 min-w-0 p-7 max-w-[1500px]">{children}</main>
    </div>
  );
}
