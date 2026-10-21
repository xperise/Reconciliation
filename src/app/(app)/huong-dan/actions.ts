'use server';
// Tab Hướng dẫn — lưu / xoá / khôi phục phiên bản. Chỉ Quản trị và người được cấp quyền sửa.
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { guideUser, missingTable, MIGRATE_MSG } from '@/lib/guide/server';
import { isAudience, isService, slugify, type GuideSection } from '@/lib/guide/meta';

async function editor() {
  const g = await guideUser();
  if (!g) throw new Error('Chưa đăng nhập.');
  if (!g.edit) throw new Error('Bạn chưa được cấp quyền sửa hướng dẫn.');
  return g.user;
}
const t = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);
const dbErr = (m: string) => new Error(missingTable(m) ? MIGRATE_MSG : m);

export type GuideInput = {
  id?: string | null; slug?: string; title: string; service: string; audience: string; summary?: string;
  version?: string; owner?: string; status: string; sort?: number; sections: GuideSection[]; note?: string;
};

/** Tạo mới hoặc lưu hướng dẫn. Mỗi lần lưu giữ lại 1 phiên bản. Trả về slug. */
export async function luuHuongDan(inp: GuideInput): Promise<{ slug: string; id: string }> {
  const user = await editor();
  const sb = supabaseAdmin();
  const title = t(inp.title, 200);
  if (!title) throw new Error('Cần có tiêu đề.');
  if (!isService(inp.service)) throw new Error('Mảng dịch vụ không hợp lệ.');
  if (!isAudience(inp.audience)) throw new Error('Đối tượng không hợp lệ.');
  const status = inp.status === 'phat-hanh' ? 'phat-hanh' : 'nhap';
  const sections = (Array.isArray(inp.sections) ? inp.sections : []).slice(0, 200).map((s, i) => ({
    id: t(s.id, 40) || `m${i + 1}`, title: t(s.title, 200) || `Mục ${i + 1}`, md: String(s.md ?? '').slice(0, 200000),
  }));
  if (JSON.stringify(sections).length > 2_000_000) throw new Error('Nội dung quá dài (tối đa khoảng 2 MB chữ).');
  const row = {
    title, service: inp.service, audience: inp.audience, summary: t(inp.summary, 500) || null,
    version: t(inp.version, 20) || '1.0', owner: t(inp.owner, 100) || null, status,
    sort: Number.isFinite(Number(inp.sort)) ? Math.round(Number(inp.sort)) : 100, sections,
    updated_at: new Date().toISOString(), updated_by: user.email,
  };
  let id = inp.id || null, slug = '';
  if (id) {
    const { data, error } = await sb.from('guides').update(row).eq('id', id).select('id,slug').maybeSingle();
    if (error) throw dbErr(error.message);
    if (!data) throw new Error('Không tìm thấy hướng dẫn (có thể đã bị xoá).');
    slug = data.slug;
  } else {
    const base = slugify(inp.slug || title);
    slug = base;
    for (let k = 2; k < 50; k++) {
      const { data, error } = await sb.from('guides').select('id').eq('slug', slug).maybeSingle();
      if (error) throw dbErr(error.message);
      if (!data) break;
      slug = `${base}-${k}`;
    }
    const { data, error } = await sb.from('guides').insert({ ...row, slug }).select('id').single();
    if (error) throw dbErr(error.message);
    id = data.id as string;
  }
  await sb.from('guide_versions').insert({
    guide_id: id, version: row.version, title, sections, saved_by: user.email, note: t(inp.note, 300) || null,
    meta: { service: row.service, audience: row.audience, summary: row.summary, owner: row.owner, status, sort: row.sort },
  });
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: inp.id ? 'guide.update' : 'guide.create', entity: 'guides', entityId: id!, note: `${title} · ${status === 'phat-hanh' ? 'đã phát hành' : 'nháp'} · v${row.version}` });
  revalidatePath('/huong-dan');
  revalidatePath(`/huong-dan/${slug}`);
  return { slug, id: id! };
}

export async function xoaHuongDan(id: string) {
  const user = await editor();
  const { data, error } = await supabaseAdmin().from('guides').delete().eq('id', id).select('title').maybeSingle();
  if (error) throw dbErr(error.message);
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: 'guide.delete', entity: 'guides', entityId: id, note: data?.title || '' });
  revalidatePath('/huong-dan');
}

export type VersionRow = { id: number; version: string | null; title: string | null; saved_at: string; saved_by: string | null; note: string | null };
export async function dsPhienBan(guideId: string): Promise<VersionRow[]> {
  await editor();
  const { data, error } = await supabaseAdmin().from('guide_versions').select('id,version,title,saved_at,saved_by,note')
    .eq('guide_id', guideId).order('saved_at', { ascending: false }).limit(50);
  if (error) throw dbErr(error.message);
  return (data || []) as VersionRow[];
}
/** Nội dung 1 phiên bản cũ để nạp vào trình sửa (chưa ghi; bấm Lưu mới ghi thành phiên bản mới) */
export async function layPhienBan(versionId: number): Promise<{ title: string; sections: GuideSection[]; version: string | null; meta: Record<string, unknown> | null }> {
  await editor();
  const { data, error } = await supabaseAdmin().from('guide_versions').select('title,sections,version,meta').eq('id', versionId).maybeSingle();
  if (error) throw dbErr(error.message);
  if (!data) throw new Error('Không tìm thấy phiên bản.');
  return data as { title: string; sections: GuideSection[]; version: string | null; meta: Record<string, unknown> | null };
}
