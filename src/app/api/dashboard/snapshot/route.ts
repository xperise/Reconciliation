import { NextResponse } from "next/server";
import { adminClient, guard } from "@/lib/dashboard/server";

export const dynamic = "force-dynamic";

// Chốt hoa hồng một kỳ: lưu số đã tính để không bị thay đổi khi upload lại dữ liệu
export async function POST(req: Request) {
  try {
    const g = await guard(true);
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const { ky, data, note } = (await req.json()) as { ky: string; data: Record<string, unknown>; note?: string };
    if (!/^T\d{2}\.\d{4}$/.test(ky)) return NextResponse.json({ error: "Kỳ không hợp lệ" }, { status: 400 });
    const { error } = await adminClient().from("fin_snapshots").upsert({ ky, data, note: note ?? null, locked_at: new Date().toISOString() }, { onConflict: "ky" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const g = await guard(true);
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const ky = new URL(req.url).searchParams.get("ky") || "";
    const { error } = await adminClient().from("fin_snapshots").delete().eq("ky", ky);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
