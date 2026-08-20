import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { Nav } from './nav';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');

  const { count } = await supabaseAdmin()
    .from('tracking').select('id', { count: 'exact', head: true })
    .eq('status', 'cho_duyet_phan_loai');

  return (
    <div className="flex min-h-screen">
      <Nav role={user.role} email={user.email} soChoDuyet={count ?? 0} />
      <main className="flex-1 min-w-0 p-7 max-w-[1500px]">{children}</main>
    </div>
  );
}
