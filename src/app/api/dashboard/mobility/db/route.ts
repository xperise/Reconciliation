import { NextResponse } from "next/server";
import { adminClient, guard } from "@/lib/dashboard/server";
import { colPath, docPath, errMsg, fail, stripNulls } from "@/lib/dashboard/mobility";

export const dynamic = "force-dynamic";

/** Đọc dữ liệu tiến độ khách hàng: ?doc=crm/b07 (một tài liệu) hoặc ?col=crm (cả nhóm) */
export async function GET(req: Request) {
  try {
    const g = await guard(false, "m");
    if ("error" in g) return fail(g.error, g.status);
    const q = new URL(req.url).searchParams;
    const sb = adminClient();
    const h = { headers: { "Cache-Control": "no-store" } };
    if (q.has("doc")) {
      const p = docPath(q.get("doc"));
      if (!p) return fail("Đường dẫn không hợp lệ", 400);
      const { data, error } = await sb.from("mob_db").select("data,updated_at").eq("path", p).maybeSingle();
      if (error) throw new Error(error.message);
      return NextResponse.json({ exists: !!data, data: data?.data ?? null, ts: data?.updated_at ?? null }, h);
    }
    const c = colPath(q.get("col"));
    if (!c) return fail("Đường dẫn không hợp lệ", 400);
    const docs: { id: string; data: unknown; ts: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("mob_db").select("path,data,updated_at").eq("col", c).order("path").range(from, from + 999);
      if (error) throw new Error(error.message);
      (data || []).forEach((r: { path: string; data: unknown; updated_at: string }) => docs.push({ id: r.path.split("/").pop() as string, data: r.data, ts: r.updated_at }));
      if (!data || data.length < 1000) break;
    }
    const stamp = docs.length + "|" + docs.reduce((m, d) => (d.ts > m ? d.ts : m), "");
    return NextResponse.json({ docs, stamp }, h);
  } catch (e) { return fail(errMsg(e), 500); }
}

/** Ghi: { op: "set" | "update" | "delete", path, data } — mọi người xem được Dashboard đều ghi được */
export async function POST(req: Request) {
  try {
    const g = await guard(false, "m");
    if ("error" in g) return fail(g.error, g.status, "not_granted");
    const b = (await req.json()) as { op?: string; path?: string; data?: unknown };
    const p = docPath(b.path);
    if (!p) return fail("Đường dẫn không hợp lệ", 400);
    const sb = adminClient();
    if (b.op === "delete") {
      const { error } = await sb.from("mob_db").delete().eq("path", p);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) return fail("Thiếu dữ liệu", 400);
    if (JSON.stringify(b.data).length > 900_000) return fail("Dữ liệu quá lớn", 413);
    if (b.op === "set") {
      const { error } = await sb.from("mob_db").upsert({ path: p, data: stripNulls(b.data), updated_at: new Date().toISOString(), updated_by: g.user.email }, { onConflict: "path" });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (b.op === "update") {
      const { error } = await sb.rpc("mob_db_update", { p_path: p, p_patch: b.data, p_by: g.user.email });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    return fail("Thao tác không hợp lệ", 400);
  } catch (e) { return fail(errMsg(e), 500); }
}
