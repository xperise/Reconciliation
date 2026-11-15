import { NextResponse } from "next/server";
import { guard, fetchAll } from "@/lib/dashboard/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Dòng gốc của các file nguồn đã nạp — để tải master data Travel & SaaS (bảng kê khách hàng, giá vốn NCC) */
export async function GET() {
  const g = await guard(false, "fin");
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  try {
    const [kh, ncc] = await Promise.all([fetchAll<Record<string, unknown>>("fin_src_kh", "id"), fetchAll<Record<string, unknown>>("fin_src_ncc", "id")]);
    return NextResponse.json({ kh, ncc });
  } catch {
    return NextResponse.json({ kh: [], ncc: [], note: "Chưa có bảng file nguồn (chạy 30_dashboard_nguon.sql)" });
  }
}
