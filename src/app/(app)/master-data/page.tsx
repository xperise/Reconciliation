import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { PageHeader } from '@/components/PageHeader';
import { MasterBoard } from './board';

export const dynamic = 'force-dynamic';

export default async function MasterDataPage({ searchParams }: {
  searchParams: { nhom?: string };
}) {
  const sb = supabaseAdmin();

  const [user, { data: groups }, { data: lichs }, { data: phapNhan }] = await Promise.all([
    currentUser(),
    sb.from('billing_groups').select('*').order('ten_nhom'),
    sb.from('billing_schedules').select('*').order('group_id').order('dot'),
    sb.from('customers').select('*').order('ten_khach_hang'),
  ]);

  const laKeToan = user?.role === 'admin' || user?.role === 'ke_toan';

  const soDot = new Map<string, number>();
  for (const l of lichs ?? []) soDot.set(l.group_id, (soDot.get(l.group_id) ?? 0) + 1);

  const soPhapNhan = new Map<string, number>();
  for (const c of phapNhan ?? []) soPhapNhan.set(c.group_id, (soPhapNhan.get(c.group_id) ?? 0) + 1);

  const rows = (groups ?? []).map((g) => ({
    ...g,
    so_dot: soDot.get(g.id) ?? 0,
    so_phap_nhan: soPhapNhan.get(g.id) ?? 0,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Cấu hình khách hàng"
        title="Master Data"
        description="Nguồn thông tin cho toàn bộ hệ thống: gửi cho ai, ngày nào, SLA bao nhiêu, escalate tới cấp mấy."
      />
      <MasterBoard
        rows={rows}
        lichs={lichs ?? []}
        phapNhan={phapNhan ?? []}
        laKeToan={laKeToan}
        chonBanDau={searchParams.nhom}
      />
    </>
  );
}
