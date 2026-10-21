'use server';
// Tab Hướng dẫn — lưu / xoá / khôi phục phiên bản. Chỉ Quản trị và người được cấp quyền sửa.
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { guideUser, missingTable, MIGRATE_MSG } from '@/lib/guide/server';
import { isAudience, isService, slugify, type GuideExtras, type GuideSection } from '@/lib/guide/meta';
import { cleanJourney } from '@/lib/guide/journey';

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
  version?: string; owner?: string; status: string; sort?: number; sections: GuideSection[]; note?: string; extras?: GuideExtras;
};

function cleanExtras(e?: GuideExtras): GuideExtras {
  if (!e || typeof e !== 'object') return {};
  return {
    who: t(e.who, 200) || undefined, portal: t(e.portal, 300) || undefined, internal: !!e.internal,
    tasks: (Array.isArray(e.tasks) ? e.tasks : []).slice(0, 24).map((x) => ({ t: t(x.t, 120), d: t(x.d, 200) || undefined, sec: t(x.sec, 60) })).filter((x) => x.t && x.sec),
    stats: (Array.isArray(e.stats) ? e.stats : []).slice(0, 6).map((x) => ({ k: t(x.k, 60), v: t(x.v, 30), d: t(x.d, 160) || undefined })).filter((x) => x.k),
    short: t(e.short, 40) || undefined,
    ...(e.kind === 'journey' ? { kind: 'journey' as const, journey: cleanJourney(e.journey) } : {}),
  };
}

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
    ...(t(s.group, 100) ? { group: t(s.group, 100) } : {}),
  }));
  const extras = cleanExtras(inp.extras);
  if (JSON.stringify(sections).length > 2_000_000) throw new Error('Nội dung quá dài (tối đa khoảng 2 MB chữ).');
  const row = {
    title, service: inp.service, audience: inp.audience, summary: t(inp.summary, 500) || null,
    version: t(inp.version, 20) || '1.0', owner: t(inp.owner, 100) || null, status,
    sort: Number.isFinite(Number(inp.sort)) ? Math.round(Number(inp.sort)) : 100, sections,
    updated_at: new Date().toISOString(), updated_by: user.email,
    ...(inp.extras !== undefined ? { extras } : {}),
  };
  let id = inp.id || null, slug = '';
  if (id) {
    let { data, error } = await sb.from('guides').update(row).eq('id', id).select('id,slug').maybeSingle();
    if (error && /extras/.test(error.message)) { const { extras: _x, ...r2 } = row as typeof row & { extras?: unknown }; void _x; ({ data, error } = await sb.from('guides').update(r2).eq('id', id).select('id,slug').maybeSingle()); }
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
    let { data, error } = await sb.from('guides').insert({ ...row, slug }).select('id').single();
    if (error && /extras/.test(error.message)) { const { extras: _x, ...r2 } = row as typeof row & { extras?: unknown }; void _x; ({ data, error } = await sb.from('guides').insert({ ...r2, slug }).select('id').single()); }
    if (error || !data) throw dbErr(error?.message || 'Không lưu được');
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

/** Nhập gói hướng dẫn (từ file .json do Claude chuyển đổi). Ảnh đã tải lên trước, md đã thay link ảnh.
 *  Trùng slug: ghi đè nội dung (bản cũ vẫn còn trong Phiên bản). replaces: XOÁ HẲN các bài cũ có nội dung trùng
 *  (kèm phiên bản và tệp đính kèm của chúng). Không bao giờ xoá bài vừa nhập trong cùng gói. */
export async function nhapGoiHuongDan(guides: GuideInput[], replaces: string[] = []): Promise<{ created: number; updated: number; deleted: number }> {
  const user = await editor();
  const sb = supabaseAdmin();
  let created = 0, updated = 0;
  for (const g of guides.slice(0, 50)) {
    const slug = slugify(g.slug || g.title);
    const { data: cur, error } = await sb.from('guides').select('id').eq('slug', slug).maybeSingle();
    if (error) throw dbErr(error.message);
    await luuHuongDan({ ...g, id: cur?.id || null, slug, note: `Nhập gói${g.note ? ' · ' + g.note : ''}` });
    if (cur) updated++; else created++;
  }
  let deleted = 0;
  const giu = new Set(guides.map((g) => slugify(g.slug || g.title)));
  const rep = replaces.map((x) => slugify(x)).filter((x) => x && !giu.has(x)).slice(0, 50);
  if (rep.length) {
    const { data: old, error } = await sb.from('guides').select('id,title').in('slug', rep);
    if (error) throw dbErr(error.message);
    const ids = (old || []).map((x) => x.id as string);
    if (ids.length) {
      // tệp đính kèm của bài cũ: xoá khỏi kho trước, dòng dữ liệu tự xoá theo bài
      const { data: fs } = await sb.from('guide_files').select('storage_path').in('guide_id', ids);
      const paths = (fs || []).map((f) => f.storage_path as string);
      if (paths.length) await sb.storage.from('guide-files').remove(paths);
      const { error: e2 } = await sb.from('guides').delete().in('id', ids);
      if (e2) throw dbErr(e2.message);
      deleted = ids.length;
      await writeAudit({ actorId: user.id, actorEmail: user.email, action: 'guide.delete', entity: 'guides', note: `Xoá khi nhập gói: ${(old || []).map((x) => x.title).join('; ')}` });
    }
  }
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: 'guide.import', entity: 'guides', note: `Nhập gói: ${created} bài mới, ${updated} bài cập nhật, ${deleted} bài cũ đã xoá` });
  revalidatePath('/huong-dan');
  return { created, updated, deleted };
}

/* ---------------- Tệp đính kèm ---------------- */
const BUCKET = 'guide-files';
const safeName = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120) || 'tep';

/** Xin chỗ lưu tệp: trả về đường dẫn + token để trình duyệt tải thẳng lên kho (không đi qua máy chủ web) */
export async function xinChoTepHuongDan(guideId: string, fileName: string): Promise<{ path: string; token: string }> {
  await editor();
  const path = `${guideId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${safeName(fileName)}`;
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(/not found|bucket/i.test(error.message) ? 'Chưa tạo kho tệp guide-files — chạy supabase/migrations/25_huong_dan_tep_dinh_kem.sql. ' + error.message : error.message);
  return { path: data.path, token: data.token };
}
export async function ghiNhanTepHuongDan(inp: { guideId: string; path: string; label: string; note?: string; fileName: string; mime?: string; size?: number }): Promise<{ id: string }> {
  const user = await editor();
  if (!inp.path.startsWith(inp.guideId + '/')) throw new Error('Đường dẫn tệp không hợp lệ.');
  const sb = supabaseAdmin();
  const { data: mx } = await sb.from('guide_files').select('sort').eq('guide_id', inp.guideId).order('sort', { ascending: false }).limit(1);
  const { data: ins, error } = await sb.from('guide_files').insert({
    guide_id: inp.guideId, label: t(inp.label, 200) || inp.fileName, note: t(inp.note, 300) || null, file_name: t(inp.fileName, 200),
    storage_path: inp.path, mime_type: t(inp.mime, 100) || null, size_bytes: Number(inp.size) || null, sort: ((mx?.[0]?.sort as number) ?? 0) + 10, uploaded_by: user.email,
  }).select('id').single();
  if (error) { await sb.storage.from(BUCKET).remove([inp.path]); throw dbErr(error.message); }
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: 'guide.file_add', entity: 'guide_files', entityId: inp.guideId, note: `${inp.label || inp.fileName} (${inp.fileName})` });
  revalidatePath('/huong-dan', 'layout');
  return { id: ins!.id as string };
}

/** Gắn / gỡ 1 tệp (của bài hành trình) vào 1 chặng */
export async function ganTepVaoChang(journeyId: string, stageId: string, fileId: string, gan: boolean) {
  const user = await editor();
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('guides').select('extras').eq('id', journeyId).maybeSingle();
  if (error) throw dbErr(error.message);
  const ex = (data?.extras || {}) as GuideExtras;
  const st = ex.journey?.stages.find((s) => s.id === stageId);
  if (!ex.journey || !st) throw new Error('Không tìm thấy chặng.');
  const cur = new Set(st.files || []);
  if (gan) cur.add(fileId); else cur.delete(fileId);
  st.files = [...cur];
  const { error: e2 } = await sb.from('guides').update({ extras: ex, updated_at: new Date().toISOString(), updated_by: user.email }).eq('id', journeyId);
  if (e2) throw dbErr(e2.message);
  revalidatePath('/huong-dan', 'layout');
}
export async function suaTepHuongDan(id: string, p: { label?: string; note?: string; sort?: number }) {
  const user = await editor();
  const row: Record<string, unknown> = {};
  if (p.label !== undefined) row.label = t(p.label, 200);
  if (p.note !== undefined) row.note = t(p.note, 300) || null;
  if (p.sort !== undefined && Number.isFinite(p.sort)) row.sort = Math.round(p.sort);
  const { error } = await supabaseAdmin().from('guide_files').update(row).eq('id', id);
  if (error) throw dbErr(error.message);
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: 'guide.file_edit', entity: 'guide_files', entityId: id, note: JSON.stringify(row).slice(0, 300) });
  revalidatePath('/huong-dan', 'layout');
}
export async function xoaTepHuongDan(id: string) {
  const user = await editor();
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('guide_files').delete().eq('id', id).select('storage_path,label,file_name').maybeSingle();
  if (error) throw dbErr(error.message);
  if (data?.storage_path) await sb.storage.from(BUCKET).remove([data.storage_path]);
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: 'guide.file_delete', entity: 'guide_files', entityId: id, note: data ? `${data.label} (${data.file_name})` : '' });
  revalidatePath('/huong-dan', 'layout');
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
