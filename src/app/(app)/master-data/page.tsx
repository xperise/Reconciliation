import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { PageHeader } from '@/components/PageHeader';
import { MasterGrid } from './grid';

export const dynamic = 'force-dynamic';

export default async function MasterDataPage() {
  const [user, { data }] = await Promise.all([
    currentUser(),
    supabaseAdmin().from('billing_groups').select('*').order('ten_nhom'),
  ]);

  const laKeToan = user?.role === 'admin' || user?.role === 'ke_toan';

  return (
    <>
      <PageHeader
        eyebrow="Cấu hình khách hàng"
        title="Master Data"
        description="Nguồn thông tin cho toàn bộ hệ thống: gửi cho ai, ngày nào, SLA bao nhiêu, escalate tới cấp mấy."
      />
      <MasterGrid rows={data ?? []} laKeToan={laKeToan} />
    </>
  );
}
