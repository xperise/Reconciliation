import { redirect } from 'next/navigation';
import { guideUser } from '@/lib/guide/server';
import { renderGuides } from './view';

export const dynamic = 'force-dynamic';

/** Tab Hướng dẫn: mở thẳng Hành trình (nếu có), không thì Thư viện */
export default async function HuongDanPage() {
  const g = await guideUser();
  if (!g) redirect('/login?loi=ho_so');
  return renderGuides(g, 'journey');
}
