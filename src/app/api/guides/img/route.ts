import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { guideUser, missingTable, MIGRATE_MSG } from "@/lib/guide/server";

export const dynamic = "force-dynamic";
const MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** POST { data: base64, mime, guideId?, key? } — người có quyền sửa hướng dẫn. Trả về { url }.
 *  key = mã ảnh gốc khi nhập gói: đã có ảnh cùng key thì dùng lại, không tạo ảnh trùng. */
export async function POST(req: Request) {
  const g = await guideUser();
  if (!g) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!g.edit) return NextResponse.json({ error: "Bạn chưa được cấp quyền sửa hướng dẫn" }, { status: 403 });
  const b = (await req.json()) as { data?: string; mime?: string; guideId?: string | null; key?: string };
  const key = String(b.key || "").trim().slice(0, 120) || null;
  if (key) {
    const { data: ex } = await supabaseAdmin().from("guide_images").select("id").eq("src_key", key).maybeSingle();
    if (ex) return NextResponse.json({ url: `/api/guides/img/${ex.id}`, reused: true });
  }
  const data = String(b.data || "").replace(/^data:[^,]+,/, ""), mime = String(b.mime || "");
  if (!MIME.includes(mime)) return NextResponse.json({ error: "Chỉ nhận ảnh PNG, JPG, WEBP, GIF" }, { status: 400 });
  const bytes = Math.floor((data.length * 3) / 4);
  if (!data || bytes > 3_000_000) return NextResponse.json({ error: "Ảnh tối đa 3 MB" }, { status: 413 });
  const { data: row, error } = await supabaseAdmin().from("guide_images")
    .insert({ guide_id: b.guideId || null, mime, data, bytes, created_by: g.user.email, ...(key ? { src_key: key } : {}) }).select("id").single();
  if (error) return NextResponse.json({ error: missingTable(error.message) ? MIGRATE_MSG : error.message }, { status: 500 });
  await writeAudit({ actorId: g.user.id, actorEmail: g.user.email, action: "guide.image", entity: "guide_images", entityId: row.id, note: `${mime} · ${Math.round(bytes / 1024)} KB` });
  return NextResponse.json({ url: `/api/guides/img/${row.id}` });
}
