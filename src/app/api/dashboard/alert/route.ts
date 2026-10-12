import { NextResponse } from "next/server";
import { adminClient, guard } from "@/lib/dashboard/server";

export const dynamic = "force-dynamic";

const TRANG_THAI = ["moi", "dang_xu_ly", "da_xong", "bo_qua"];

// Ghi nhận xử lý một cảnh báo: ai nhận việc, hạn xử lý, hành động, trạng thái.
export async function POST(req: Request) {
  try {
    const g = await guard();
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const b = (await req.json()) as { id: string; ky: string; pic?: string; han_xu_ly?: string; hanh_dong?: string; trang_thai?: string };
    if (!b.id || !/^T\d{2}\.\d{4}$/.test(b.ky || "")) return NextResponse.json({ error: "Thiếu mã cảnh báo hoặc kỳ" }, { status: 400 });
    const trang_thai = TRANG_THAI.includes(b.trang_thai || "") ? b.trang_thai : "moi";
    const { error } = await adminClient().from("fin_alert_actions").upsert({
      id: b.id, ky: b.ky,
      pic: b.pic?.trim() || null,
      han_xu_ly: b.han_xu_ly || null,
      hanh_dong: b.hanh_dong?.trim() || null,
      trang_thai, updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const g = await guard();
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const id = new URL(req.url).searchParams.get("id") || "";
    const { error } = await adminClient().from("fin_alert_actions").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
