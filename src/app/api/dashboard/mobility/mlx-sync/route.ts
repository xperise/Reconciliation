import { NextResponse } from "next/server";
import { adminClient, guard } from "@/lib/dashboard/server";
import { errMsg, fail } from "@/lib/dashboard/mobility";

export const dynamic = "force-dynamic";

/**
 * Đồng bộ thông tin khách từ dashboard Mobility sang master data MLX.
 * Khoá nối: mã khách của Mobility (lưu vào ma_hop_dong của MLX). Chỉ cập nhật trường có giá trị gửi lên.
 * Nếu chưa có dòng MLX cho mã này và có tên: tạo mới. Lỗi trùng tên (chỉ mục duy nhất) được trả về, không ghi đè.
 */
export async function POST(req: Request) {
  try {
    const g = await guard(true, "m");
    if ("error" in g) return fail(g.error, g.status, "not_granted");
    const b = (await req.json()) as { key?: string; name?: string; mst?: string; addr?: string };
    const key = String(b.key ?? "").trim();
    if (!key) return fail("Thiếu mã khách", 400);
    const sb = adminClient();
    const set: Record<string, string> = {};
    if (b.name && b.name.trim()) set.ten_cong_ty = b.name.trim();
    if (typeof b.mst === "string") set.mst = b.mst.replace(/\s/g, "");
    if (typeof b.addr === "string") set.dia_chi = b.addr.trim();
    if (!Object.keys(set).length) return NextResponse.json({ ok: true, bo_qua: true });

    const { data: found, error: eFind } = await sb.from("mlx_customers").select("id").eq("ma_hop_dong", key).limit(1).maybeSingle();
    if (eFind) throw new Error(eFind.message);
    if (found) {
      const { error } = await sb.from("mlx_customers").update({ ...set, updated_at: new Date().toISOString() }).eq("id", found.id);
      if (error) return fail(error.message, 409);
      return NextResponse.json({ ok: true, cap_nhat: 1 });
    }
    if (!set.ten_cong_ty) return NextResponse.json({ ok: true, bo_qua: true });
    const { error } = await sb.from("mlx_customers").insert({ ma_hop_dong: key, ma_khach_hang: key, ten_viet_tat: "", ...set });
    if (error) return fail(error.message, 409);
    return NextResponse.json({ ok: true, them_moi: 1 });
  } catch (e) { return fail(errMsg(e), 500); }
}
