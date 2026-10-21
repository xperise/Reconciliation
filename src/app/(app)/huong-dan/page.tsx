import { redirect } from 'next/navigation';
import { guideUser } from '@/lib/guide/server';
import { renderGuides } from './view';

export const dynamic = 'force-dynamic';

/** Tab Hướng dẫn: trang Tổng quan (nếu có hành trình), không thì danh sách theo vai trò */
export default async function HuongDanPage() {
  const g = await guideUser();
  if (!g) redirect('/login?loi=ho_so');
  return renderGuides(g, 'hub');
}
