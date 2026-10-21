import { redirect } from 'next/navigation';
import GuideEditor from '@/components/guide/GuideEditor';
import { guideUser } from '@/lib/guide/server';

export const dynamic = 'force-dynamic';

export default async function HuongDanMoi() {
  const g = await guideUser();
  if (!g) redirect('/login?loi=ho_so');
  if (!g.edit) redirect('/huong-dan');
  return <GuideEditor />;
}
