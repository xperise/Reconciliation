import { NextResponse } from "next/server";
import { adminClient, guard } from "@/lib/dashboard/server";
import { canEditRole, errMsg, fail } from "@/lib/dashboard/mobility";
import { mobAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Số liệu dashboard Mobility + quyền của người đang xem */
export async function GET() {
  try {
    const g = await guard();
    if ("error" in g) return fail(g.error, g.status);
    const { data, error } = await adminClient().from("mob_state").select("data,version,updated_at,updated_by").eq("id", "main").maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({
      data: data?.data ?? null, version: data?.version ?? 0, updated_at: data?.updated_at ?? null, updated_by: data?.updated_by ?? null,
      me: { email: g.user.email, canEdit: canEditRole(g.user.role), canWrite: true, mob: mobAccess(g.user) },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return fail(errMsg(e), 500); }
}

/** Lưu số liệu (nút "Lưu & cập nhật dashboard", sửa từ điển, CS xác nhận…).
 *  Gửi kèm version đang xem; ai đó đã lưu trước thì trả 409 để trang tải lại bản mới. */
export async function PUT(req: Request) {
  try {
    const g = await guard(true);
    if ("error" in g) return fail(g.error, g.status, "not_writer");
    const body = (await req.json()) as { version?: number; data?: unknown };
    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) return fail("Thiếu số liệu", 400);
    const sb = adminClient();
    const v = Number(body.version) || 0;
    const now = new Date().toISOString();
    if (v === 0) {
      const { error } = await sb.from("mob_state").insert({ id: "main", data: body.data, version: 1, updated_at: now, updated_by: g.user.email });
      if (error) return fail("Có người vừa cập nhật dashboard", 409, "conflict");
      return NextResponse.json({ ok: true, version: 1 });
    }
    const { data, error } = await sb.from("mob_state")
      .update({ data: body.data, version: v + 1, updated_at: now, updated_by: g.user.email })
      .eq("id", "main").eq("version", v).select("version");
    if (error) throw new Error(error.message);
    if (!data?.length) return fail("Có người vừa cập nhật dashboard", 409, "conflict");
    return NextResponse.json({ ok: true, version: v + 1 });
  } catch (e) { return fail(errMsg(e), 500); }
}
