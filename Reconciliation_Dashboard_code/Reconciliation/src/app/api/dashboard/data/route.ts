import { NextResponse } from "next/server";
import { fetchAll, guard, EDIT_ROLES } from "@/lib/dashboard/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const g = await guard();
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const [params, customers, suppliers, staff, alloc, targets, gmv, ar, ap, cash, opex, contracts, uploads, snapshots] = await Promise.all([
      fetchAll<{ key: string; value: string | null }>("fin_params"),
      fetchAll("fin_customers"), fetchAll("fin_suppliers"), fetchAll("fin_staff"), fetchAll("fin_pm_alloc"), fetchAll("fin_targets"),
      fetchAll("fin_gmv", "id"), fetchAll("fin_ar", "id"), fetchAll("fin_ap", "id"), fetchAll("fin_cash"), fetchAll("fin_opex"), fetchAll("fin_contracts"),
      fetchAll("fin_uploads", "id"), fetchAll("fin_snapshots"),
    ]);
    return NextResponse.json({
      params: Object.fromEntries(params.map((p) => [p.key, p.value ?? ""])),
      customers, suppliers, staff, alloc, targets, gmv, ar, ap, cash, opex, contracts,
      uploads: (uploads as { id: number }[]).slice(-30).reverse(), snapshots,
      me: { email: g.user.email, role: g.user.role, canEdit: EDIT_ROLES.includes(g.user.role) },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
