import { NextResponse } from "next/server";
import { adminClient, guard } from "@/lib/dashboard/server";
import { errMsg, fail } from "@/lib/dashboard/mobility";

export const dynamic = "force-dynamic";

/** Mobility đổi mã khách (oldKey → newKey): đổi mã tương ứng trong master data MLX. Không tự gộp dòng. */
export async function POST(req: Request) {
  try {
    const g = await guard(true, "m");
    if ("error" in g) return fail(g.error, g.status, "not_granted");
    const b = (await req.json()) as { oldKey?: string; newKey?: string };
    const oldK = String(b.oldKey ?? "").trim(), newK = String(b.newKey ?? "").trim();
    if (!oldK || !newK || oldK === newK) return NextResponse.json({ ok: true, bo_qua: true });
    const sb = adminClient();
    const { data: cu, error: e1 } = await sb.from("mlx_customers").select("id").eq("ma_hop_dong", oldK);
    if (e1) throw new Error(e1.message);
    if (!cu?.length) return NextResponse.json({ ok: true, khong_co: true });
    const { data: moi, error: e2 } = await sb.from("mlx_customers").select("id").eq("ma_hop_dong", newK).limit(1);
    if (e2) throw new Error(e2.message);
    if (moi?.length) return fail(`Mã ${newK} đã có trong master data MLX cho khách khác; cần gộp thủ công.`, 409);
    const { error } = await sb.from("mlx_customers").update({ ma_hop_dong: newK, updated_at: new Date().toISOString() }).in("id", cu.map((x: any) => x.id));
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, doi: cu.length });
  } catch (e) { return fail(errMsg(e), 500); }
}
