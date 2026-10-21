// Tab Hướng dẫn — đọc dữ liệu phía server (service role). Chỉ import trong server component / route / action.
import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { tabAccess } from '@/lib/access';
import type { Guide, GuideFile, GuideMeta } from './meta';

const META = 'id,slug,title,service,audience,summary,version,owner,status,sort,updated_at,updated_by';
export const missingTable = (m: string) => /guides|guide_versions|guide_images|guide_files|extras|src_key/.test(m) && /does not exist|schema cache|relation/i.test(m);
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
  let q = supabaseAdmin().from('guides').select(META + ',sections,extras').eq('slug', slug);
  if (!withDrafts) q = q.eq('status', 'phat-hanh');
  let { data, error } = await q.maybeSingle();
  // chưa chạy SQL 25 (chưa có cột extras)
  if (error && /extras/.test(error.message)) {
    let q2 = supabaseAdmin().from('guides').select(META + ',sections').eq('slug', slug);
    if (!withDrafts) q2 = q2.eq('status', 'phat-hanh');
    ({ data, error } = await q2.maybeSingle());
  }
  if (error) return { guide: null, error: missingTable(error.message) ? MIGRATE_MSG : error.message };
  const guide = (data as unknown as Guide) || null;
  if (guide) guide.files = await listFiles([guide.id]).then((r) => r[guide.id] || []);
  return { guide };
}

/** Tệp đính kèm theo từng hướng dẫn (chưa chạy SQL 25 thì trả rỗng) */
export async function listFiles(ids: string[]): Promise<Record<string, GuideFile[]>> {
  if (!ids.length) return {};
  const { data, error } = await supabaseAdmin().from('guide_files')
    .select('id,guide_id,label,note,file_name,mime_type,size_bytes,sort,uploaded_by,uploaded_at').in('guide_id', ids).order('sort').order('uploaded_at');
  if (error) return {};
  const out: Record<string, GuideFile[]> = {};
  (data as GuideFile[]).forEach((f) => (out[f.guide_id] = out[f.guide_id] || []).push(f));
  return out;
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
