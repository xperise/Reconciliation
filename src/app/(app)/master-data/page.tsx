import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { MasterTable } from './table';

export const dynamic = 'force-dynamic';

export default async function MasterDataPage() {
  const { data } = await supabaseAdmin()
    .from('billing_groups')
    .select('*, customers(count)')
    .order('ten_nhom');

  return (
    <>
      <PageHeader
        eyebrow="Cấu hình khách hàng"
        title="Master Data"
        description="Nguồn thông tin cho toàn bộ hệ thống: gửi cho ai, ngày nào, SLA bao nhiêu, escalate tới cấp mấy."
      />
      <MasterTable groups={data ?? []} />
    </>
  );
}
