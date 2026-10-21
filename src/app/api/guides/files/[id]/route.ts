import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { guideUser } from "@/lib/guide/server";

export const dynamic = "force-dynamic";

/** Tải tệp đính kèm của hướng dẫn: kiểm tra quyền, cấp link có chữ ký 5 phút rồi chuyển hướng. ?xem=1 để mở xem thay vì tải. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const g = await guideUser();
  if (!g || !g.view) return new NextResponse("Không có quyền", { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new NextResponse("Không hợp lệ", { status: 400 });
  const sb = supabaseAdmin();
  const { data: f } = await sb.from("guide_files").select("id,guide_id,storage_path,file_name,label").eq("id", params.id).maybeSingle();
  if (!f) return new NextResponse("Không tìm thấy tệp", { status: 404 });
  // bài Nháp: chỉ người có quyền sửa tải được tệp
  if (!g.edit) {
    const { data: gd } = await sb.from("guides").select("status").eq("id", f.guide_id).maybeSingle();
    if (!gd || gd.status !== "phat-hanh") return new NextResponse("Không tìm thấy tệp", { status: 404 });
  }
  const xem = new URL(req.url).searchParams.get("xem") === "1";
  const { data, error } = await sb.storage.from("guide-files").createSignedUrl(f.storage_path, 300, xem ? undefined : { download: f.file_name });
  if (error || !data) return new NextResponse("Không tạo được link tải: " + (error?.message || ""), { status: 500 });
  await writeAudit({ actorId: g.user.id, actorEmail: g.user.email, action: xem ? "guide.file_view" : "guide.file_download", entity: "guide_files", entityId: f.id, note: f.label });
  return NextResponse.redirect(data.signedUrl);
}
