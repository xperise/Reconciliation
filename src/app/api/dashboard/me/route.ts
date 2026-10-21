import { NextResponse } from "next/server";
import { EDIT_ROLES, guard } from "@/lib/dashboard/server";
import { currentUser } from "@/lib/supabase/server";
import { tabAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Phần Dashboard mà người đang đăng nhập được xem: { all, ts, m } + có được cập nhật dữ liệu không */
export async function GET() {
  const g = await guard();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const a = tabAccess(await currentUser());
  return NextResponse.json({ all: a.dbAll, ts: a.dbTs, m: a.dbM, canEdit: EDIT_ROLES.includes(g.user.role) }, { headers: { "Cache-Control": "no-store" } });
}
