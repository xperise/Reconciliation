import { notFound, redirect } from 'next/navigation';
import GuideView from '@/components/guide/GuideView';
import { getGuide, guideUser } from '@/lib/guide/server';

export const dynamic = 'force-dynamic';

export default async function HuongDanChiTiet({ params, searchParams }: { params: { slug: string }; searchParams: { sua?: string } }) {
  const g = await guideUser();
  if (!g) redirect('/login?loi=ho_so');
  const { guide, error } = await getGuide(decodeURIComponent(params.slug), g.edit);
  if (error) return <div className="hd-wrap" style={{ padding: 24 }}><div className="card notice">{error}</div></div>;
  if (!guide) notFound();
  return <GuideView guide={guide} canEdit={g.edit} userId={g.user.id} startEdit={searchParams.sua === '1'} />;
}
