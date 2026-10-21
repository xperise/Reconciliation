import { redirect } from 'next/navigation';
import GuideHome from '@/components/guide/GuideHome';
import { guideUser, listFiles, listGuides } from '@/lib/guide/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Guide } from '@/lib/guide/meta';

export const dynamic = 'force-dynamic';

export default async function HuongDanPage() {
  const g = await guideUser();
  if (!g) redirect('/login?loi=ho_so');
  const { rows, error } = await listGuides(g.edit);
  // kèm nội dung để tìm kiếm toàn văn ngay trên trang (số bài ít, nội dung là chữ)
  let full: Guide[] = rows.map((r) => ({ ...r, sections: [] }));
  if (rows.length) {
    const { data } = await supabaseAdmin().from('guides').select('id,sections').in('id', rows.map((r) => r.id));
    const by = new Map((data || []).map((d: { id: string; sections: Guide['sections'] }) => [d.id, d.sections]));
    const files = await listFiles(rows.map((r) => r.id));
    full = rows.map((r) => ({ ...r, sections: by.get(r.id) || [], files: files[r.id] || [] }));
  }
  return <GuideHome guides={full} canEdit={g.edit} error={error} />;
}
