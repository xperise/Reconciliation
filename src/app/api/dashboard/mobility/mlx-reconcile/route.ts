import { NextResponse } from "next/server";
import { adminClient, guard } from "@/lib/dashboard/server";
import { errMsg, fail } from "@/lib/dashboard/mobility";
import { nameKey } from "@/lib/mlx/dupes";

export const dynamic = "force-dynamic";

/**
 * Đối chiếu một lần: đặt mã MLX (ma_hop_dong) theo mã khách của Mobility.
 * Khớp theo MST trước, rồi theo tên đã chuẩn hoá (chỉ khi tên duy nhất). Dry-run mặc định.
 */
export async function POST(req: Request) {
  try {
    const g = await guard(true, "m");
    if ("error" in g) return fail(g.error, g.status, "not_granted");
    const b = (await req.json().catch(() => ({}))) as { apply?: boolean };
    const apply = b.apply === true;
    const sb = adminClient();

    // 1) Danh sách khách Mobility: key → {name, mst}
    const mob = new Map<string, { name: string; mst: string }>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("mob_db").select("data").eq("col", "crm").range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) for (const [k, v] of Object.entries((r as any).data ?? {})) {
        const e = v as any;
        if (e && typeof e === "object") mob.set(k, { name: String(e.name ?? ""), mst: String(e.mst ?? "").replace(/\s/g, "") });
      }
      if (!data || data.length < 1000) break;
    }
    const byMst = new Map<string, string[]>(), byName = new Map<string, string[]>();
    for (const [k, e] of mob) {
      if (e.mst) byMst.set(e.mst, [...(byMst.get(e.mst) ?? []), k]);
      const nk = nameKey(e.name); if (nk) byName.set(nk, [...(byName.get(nk) ?? []), k]);
    }

    // 2) Khách MLX
    const mlx: { id: string; ma_hop_dong: string; ten_cong_ty: string; mst: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("mlx_customers").select("id, ma_hop_dong, ten_cong_ty, mst").order("id").range(from, from + 999);
      if (error) throw new Error(error.message);
      mlx.push(...((data ?? []) as any[]));
      if (!data || data.length < 1000) break;
    }

    const ketQua = { khop: 0, doi: 0, khongTim: [] as string[], xungDot: [] as string[] };
    const dung = new Set(mlx.map((m) => m.ma_hop_dong).filter(Boolean));
    const doi: { id: string; to: string }[] = [];
    for (const m of mlx) {
      const mst = String(m.mst ?? "").replace(/\s/g, "");
      let ung: string[] = mst && byMst.get(mst)?.length === 1 ? byMst.get(mst)! : [];
      if (!ung.length) { const nk = nameKey(m.ten_cong_ty); const c = nk ? byName.get(nk) ?? [] : []; if (c.length === 1) ung = c; }
      if (!ung.length) { ketQua.khongTim.push(m.ten_cong_ty); continue; }
      const key = ung[0];
      if (m.ma_hop_dong === key) { ketQua.khop++; continue; }
      if (dung.has(key)) { ketQua.xungDot.push(`${m.ten_cong_ty} → ${key} (đã dùng cho dòng khác)`); continue; }
      dung.add(key); doi.push({ id: m.id, to: key }); ketQua.doi++;
    }
    if (apply) for (const d of doi) {
      const { error } = await sb.from("mlx_customers").update({ ma_hop_dong: d.to, updated_at: new Date().toISOString() }).eq("id", d.id);
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, apply, ...ketQua, khongTim: ketQua.khongTim.slice(0, 50), xungDot: ketQua.xungDot.slice(0, 50), tongMobility: mob.size, tongMlx: mlx.length });
  } catch (e) { return fail(errMsg(e), 500); }
}
