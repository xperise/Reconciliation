import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { PageHeader } from '@/components/PageHeader';
import { MasterGrid } from './grid';
import { SchedulePicker } from './schedule-picker';

export const dynamic = 'force-dynamic';

export default async function MasterDataPage({ searchParams }: {
  searchParams: { lich?: string };
}) {
  const sb = supabaseAdmin();

  const [user, { data: groups }, { data: lichs }] = await Promise.all([
    currentUser(),
    sb.from('billing_groups').select('*').order('ten_nhom'),
    sb.from('billing_schedules').select('*').order('group_id').order('dot'),
  ]);

  const laKeToan = user?.role === 'admin' || user?.role === 'ke_toan';

  // Đếm số đợt của từng nhóm để lưới hiện được cột Lịch gửi
  const soDot = new Map<string, number>();
  for (const l of lichs ?? []) {
    soDot.set(l.group_id, (soDot.get(l.group_id) ?? 0) + 1);
  }
  const rows = (groups ?? []).map((g) => ({ ...g, so_dot: soDot.get(g.id) ?? 0 }));

  return (
    <>
      <PageHeader
        eyebrow="Cấu hình khách hàng"
        title="Master Data"
        description="Nguồn thông tin cho toàn bộ hệ thống: gửi cho ai, ngày nào, SLA bao nhiêu, escalate tới cấp mấy."
      />
      <MasterGrid rows={rows} laKeToan={laKeToan} />

      <div className="mt-4">
        <SchedulePicker
          groups={(groups ?? []).map((g) => ({
            id: g.id, ten_nhom: g.ten_nhom, ma_he_thong: g.ma_he_thong,
          }))}
          lichs={lichs ?? []}
          chon={searchParams.lich}
        />
      </div>
    </>
  );
}
