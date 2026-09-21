import { NextResponse } from "next/server";
import { adminClient, guard } from "@/lib/dashboard/server";
import { SHEET_BY_NAME } from "@/lib/dashboard/spec";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Val = string | number | null;
interface ChunkBody { action: "chunk"; sheet: string; rows: Record<string, Val>[]; first: boolean; kys?: string[] }
interface LogBody { action: "log"; fileName: string; summary: Record<string, unknown> }
const WITH_UPDATED_AT = new Set(["fin_params", "fin_customers", "fin_suppliers", "fin_staff", "fin_targets"]);

export async function POST(req: Request) {
  try {
    const g = await guard(true);
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const body = (await req.json()) as ChunkBody | LogBody;
    const sb = adminClient();
    if (body.action === "log") {
      const { error } = await sb.from("fin_uploads").insert({ file_name: body.fileName, summary: body.summary });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    const spec = SHEET_BY_NAME[body.sheet];
    if (!spec) return NextResponse.json({ error: `Sheet không hợp lệ: ${body.sheet}` }, { status: 400 });
    const fields = spec.cols.map((c) => c.f);
    const now = new Date().toISOString();
    const rows = (body.rows || []).map((r) => {
      const o: Record<string, Val> = {};
      fields.forEach((f) => { o[f] = r[f] ?? null; });
      if (WITH_UPDATED_AT.has(spec.table)) o.updated_at = now;
      return o;
    });
    if (body.first) {
      if (spec.mode === "replace_all") {
        const { error } = await sb.from(spec.table).delete().not(fields[0], "is", null);
        if (error) throw new Error(`Xóa dữ liệu cũ ${spec.table}: ${error.message}`);
      } else if (spec.mode === "replace_by_ky") {
        const kys = (body.kys || []).filter((k) => /^T\d{2}\.\d{4}$/.test(k));
        if (kys.length) {
          const { error } = await sb.from(spec.table).delete().in("ky", kys);
          if (error) throw new Error(`Xóa dữ liệu cũ ${spec.table}: ${error.message}`);
        }
      }
    }
    if (rows.length) {
      const q = spec.mode === "upsert" ? sb.from(spec.table).upsert(rows, { onConflict: spec.key.join(",") }) : sb.from(spec.table).insert(rows);
      const { error } = await q;
      if (error) throw new Error(`Ghi ${spec.sheet}: ${error.message}`);
    }
    return NextResponse.json({ ok: true, written: rows.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
