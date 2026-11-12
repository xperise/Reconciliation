// Tab Workstream — /workstream (cạnh Xperise | MLX | Dashboard | Hướng dẫn)
// Quyền xem: profiles.xem_workstream (SQL 29); admin luôn xem được. Middleware chặn cả trang lẫn tệp tĩnh.
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { tabAccess, trangChu } from '@/lib/access';
import WorkstreamFrame from '@/components/WorkstreamFrame';

export const dynamic = 'force-dynamic';

export default async function WorkstreamPage() {
  const user = await currentUser();
  const access = tabAccess(user);
  if (!access.workstream) redirect(trangChu(access) ?? '/login?loi=khong_quyen');
  return <WorkstreamFrame />;
}
