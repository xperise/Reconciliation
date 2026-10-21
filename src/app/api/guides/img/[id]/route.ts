import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { guideUser } from "@/lib/guide/server";

export const dynamic = "force-dynamic";

/** Ảnh trong hướng dẫn — chỉ người đăng nhập có quyền tab Hướng dẫn xem được */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await guideUser();
  if (!g || !g.view) return new NextResponse("Không có quyền", { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new NextResponse("Không hợp lệ", { status: 400 });
  const { data, error } = await supabaseAdmin().from("guide_images").select("mime,data").eq("id", params.id).maybeSingle();
  if (error || !data) return new NextResponse("Không tìm thấy ảnh", { status: 404 });
  return new NextResponse(Buffer.from(data.data, "base64"), {
    headers: { "Content-Type": data.mime, "Cache-Control": "private, max-age=86400, immutable" },
  });
}
