// Tab Hướng dẫn — đọc dữ liệu phía server (service role). Chỉ import trong server component / route / action.
import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { tabAccess } from '@/lib/access';
import type { Guide, GuideMeta } from './meta';

const META = 'id,slug,title,service,audience,summary,version,owner,status,sort,updated_at,updated_by';
export const missingTable = (m: string) => /guides|guide_versions|guide_images/.test(m) && /does not exist|schema cache|relation/i.test(m);
export const MIGRATE_MSG = 'Chưa tạo bảng Hướng dẫn — chạy supabase/migrations/23_huong_dan.sql và 24_huong_dan_noi_dung.sql trong Supabase.';

/** Người đang đăng nhập + quyền tab Hướng dẫn */
export async function guideUser() {
  const user = await currentUser();
  if (!user) return null;
  const a = tabAccess(user);
  return { user, view: a.guide, edit: a.guideEdit };
}

/** Danh sách hướng dẫn (không kèm nội dung). Người không sửa được chỉ thấy bài đã phát hành. */
export async function listGuides(withDrafts: boolean): Promise<{ rows: GuideMeta[]; error?: string }> {
  let q = supabaseAdmin().from('guides').select(META).order('sort').order('title');
  if (!withDrafts) q = q.eq('status', 'phat-hanh');
  const { data, error } = await q;
  if (error) return { rows: [], error: missingTable(error.message) ? MIGRATE_MSG : error.message };
  return { rows: (data || []) as GuideMeta[] };
}

export async function getGuide(slug: string, withDrafts: boolean): Promise<{ guide: Guide | null; error?: string }> {
  let q = supabaseAdmin().from('guides').select(META + ',sections').eq('slug', slug);
  if (!withDrafts) q = q.eq('status', 'phat-hanh');
  const { data, error } = await q.maybeSingle();
  if (error) return { guide: null, error: missingTable(error.message) ? MIGRATE_MSG : error.message };
  return { guide: (data as unknown as Guide) || null };
}

export async function getGuides(slugs: string[], withDrafts: boolean): Promise<Guide[]> {
  if (!slugs.length) return [];
  let q = supabaseAdmin().from('guides').select(META + ',sections').in('slug', slugs.slice(0, 30));
  if (!withDrafts) q = q.eq('status', 'phat-hanh');
  const { data, error } = await q;
  if (error) throw new Error(missingTable(error.message) ? MIGRATE_MSG : error.message);
  const by = new Map(((data || []) as unknown as Guide[]).map((g) => [g.slug, g]));
  return slugs.map((s) => by.get(s)).filter(Boolean) as Guide[];
}
