import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { Shell } from './shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, choDuyet] = await Promise.all([
    currentUser(),
    supabaseAdmin()
      .from('tracking')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'cho_duyet_phan_loai'),
  ]);

  if (!user) redirect('/login');

  return (
    <Shell role={user.role} email={user.email} soChoDuyet={choDuyet.count ?? 0}>
      {children}
    </Shell>
  );
}
