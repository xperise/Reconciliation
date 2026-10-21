import { redirect } from 'next/navigation';
import { guideUser } from '@/lib/guide/server';
import { renderGuides } from '../view';

export const dynamic = 'force-dynamic';

export default async function ThuVienPage() {
  const g = await guideUser();
  if (!g) redirect('/login?loi=ho_so');
  return renderGuides(g, 'library');
}
