import { NextResponse } from "next/server";
import { adminClient, guard } from "@/lib/dashboard/server";
import { docPath, errMsg, fail, stripNulls } from "@/lib/dashboard/mobility";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Nhập dữ liệu chép từ bản dashboard trên claude.ai (chỉ Quản trị / Kế toán).
 *  Nhận { state: {...}, docs: { "crm/b07": {...}, ... } } hoặc chỉ object state.
 *  Ghi đè số liệu hiện tại; tài liệu tiến độ khách hàng chỉ ghi đè đúng các tài liệu có trong file. */
export async function POST(req: Request) {
  try {
    const g = await guard(true);
    if ("error" in g) return fail(g.error, g.status);
    const body = (await req.json()) as Record<string, unknown>;
    const state = (body.state ?? (body.params && body.plan ? body : null)) as Record<string, unknown> | null;
    const docs = (body.docs ?? {}) as Record<string, unknown>;
    if (!state && !Object.keys(docs).length) return fail("File không đúng định dạng dữ liệu dashboard Mobility", 400);
    if (state && (typeof state !== "object" || !state.params || !state.plan)) return fail("Phần state thiếu params/plan", 400);
    const sb = adminClient();
    const now = new Date().toISOString();
    let version = 0;
    if (state) {
      const cur = await sb.from("mob_state").select("version").eq("id", "main").maybeSingle();
      if (cur.error) throw new Error(cur.error.message);
      version = (cur.data?.version ?? 0) + 1;
      const { error } = await sb.from("mob_state").upsert({ id: "main", data: state, version, updated_at: now, updated_by: g.user.email }, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    const rows = Object.entries(docs).map(([path, data]) => {
      if (!docPath(path) || !data || typeof data !== "object") throw new Error("Tài liệu không hợp lệ: " + path);
      return { path, data: stripNulls(data), updated_at: now, updated_by: g.user.email };
    });
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from("mob_db").upsert(rows.slice(i, i + 200), { onConflict: "path" });
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, version, docs: rows.length });
  } catch (e) { return fail(errMsg(e), 500); }
}

/** Tải toàn bộ dữ liệu ra file (sao lưu) */
export async function GET() {
  try {
    const g = await guard(true);
    if ("error" in g) return fail(g.error, g.status);
    const sb = adminClient();
    const st = await sb.from("mob_state").select("data").eq("id", "main").maybeSingle();
    if (st.error) throw new Error(st.error.message);
    const docs: Record<string, unknown> = {};
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("mob_db").select("path,data").order("path").range(from, from + 999);
      if (error) throw new Error(error.message);
      (data || []).forEach((r: { path: string; data: unknown }) => { docs[r.path] = r.data; });
      if (!data || data.length < 1000) break;
    }
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return new NextResponse(JSON.stringify({ state: st.data?.data ?? null, docs }), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="mobility_${d}.json"`, "Cache-Control": "no-store" },
    });
  } catch (e) { return fail(errMsg(e), 500); }
}
