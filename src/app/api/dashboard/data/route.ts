import { NextResponse } from "next/server";
import { fetchAll, guard, EDIT_ROLES, adminClient } from "@/lib/dashboard/server";
import type { BangKe, Customer } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Tiến độ gửi bảng kê lấy từ app Reconciliation (bảng tracking).
 *  Nối khách hàng của dashboard với nhóm đối soát theo thứ tự ưu tiên:
 *    1. cột "Mã nhóm đối soát" khai trong danh mục khách hàng
 *    2. mã pháp nhân trong bảng customers của Reconciliation
 *    3. mã nhóm (ma_he_thong) trùng luôn với mã KH
 *  Trả về map "maKH|kỳ" → ngày gửi gần nhất, ngày chốt, trạng thái. */
async function bangKeMap(customers: Customer[]): Promise<Record<string, BangKe>> {
  const out: Record<string, BangKe> = {};
  try {
    const sb = adminClient();
    const [tr, bg, cus] = await Promise.all([
      sb.from("tracking").select("ma_he_thong,ten_nhom,ky_doi_soat,ngay_gui_gan_nhat,ngay_chot,status"),
      sb.from("billing_groups").select("ma_he_thong"),
      sb.from("customers").select("code,ten_viet_tat,group_id"),
    ]);
    if (tr.error || !tr.data?.length) return out;
    const groups = new Set((bg.data || []).map((g: { ma_he_thong: string }) => g.ma_he_thong));
    // mã pháp nhân → mã nhóm, qua group_id
    const byGroupId = new Map<string, string>();
    const bgFull = await sb.from("billing_groups").select("id,ma_he_thong");
    (bgFull.data || []).forEach((g: { id: string; ma_he_thong: string }) => byGroupId.set(g.id, g.ma_he_thong));
    const codeToGroup = new Map<string, string>();
    (cus.data || []).forEach((c: { code: string | null; group_id: string }) => {
      const g = byGroupId.get(c.group_id);
      if (c.code && g) codeToGroup.set(c.code.trim().toUpperCase(), g);
    });
    // mã KH của dashboard → mã nhóm đối soát
    const khToGroup = new Map<string, string>();
    customers.forEach((c) => {
      const k = c.ma_kh;
      const khai = (c.ma_he_thong || "").trim();
      if (khai && groups.has(khai)) { khToGroup.set(k, khai); return; }
      const viaCode = codeToGroup.get(k.trim().toUpperCase());
      if (viaCode) { khToGroup.set(k, viaCode); return; }
      if (groups.has(k)) khToGroup.set(k, k);
    });
    const byGroupKy = new Map<string, { gui: string | null; chot: string | null; status: string | null; nhom: string }>();
    (tr.data as { ma_he_thong: string; ten_nhom: string; ky_doi_soat: string; ngay_gui_gan_nhat: string | null; ngay_chot: string | null; status: string }[])
      .forEach((t) => byGroupKy.set(`${t.ma_he_thong}|${t.ky_doi_soat}`, { gui: t.ngay_gui_gan_nhat, chot: t.ngay_chot, status: t.status, nhom: t.ten_nhom }));
    khToGroup.forEach((g, kh) => {
      byGroupKy.forEach((v, key) => {
        const [grp, ky] = key.split("|");
        if (grp === g) out[`${kh}|${ky}`] = v;
      });
    });
  } catch {
    // App Reconciliation chưa có bảng tracking hoặc không đọc được → bỏ qua,
    // dashboard vẫn chạy với ngày gửi bảng kê nhập tay.
  }
  return out;
}

export async function GET() {
  try {
    const g = await guard();
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const [params, customers, suppliers, staff, alloc, targets, gmv, ar, ap, cash, opex, contracts, uploads, snapshots, alertActions, arEdits, apEdits, manual] = await Promise.all([
      fetchAll<{ key: string; value: string | null }>("fin_params"),
      fetchAll<Customer>("fin_customers"), fetchAll("fin_suppliers"), fetchAll("fin_staff"), fetchAll("fin_pm_alloc"), fetchAll("fin_targets"),
      fetchAll("fin_gmv", "id"), fetchAll("fin_ar", "id"), fetchAll("fin_ap", "id"), fetchAll("fin_cash"), fetchAll("fin_opex"), fetchAll("fin_contracts"),
      fetchAll("fin_uploads", "id"), fetchAll("fin_snapshots"), fetchAll("fin_alert_actions"),
      fetchAll("fin_ar_edit"), fetchAll("fin_ap_edit"), fetchAll("fin_manual").catch(() => []),
    ]);
    const bangKe = await bangKeMap(customers);
    return NextResponse.json({
      params: Object.fromEntries(params.map((p) => [p.key, p.value ?? ""])),
      customers, suppliers, staff, alloc, targets, gmv, ar, ap, cash, opex, contracts,
      uploads: (uploads as { id: number }[]).slice(-30).reverse(), snapshots, alertActions,
      arEdits, apEdits, manual, bangKe,
      me: { email: g.user.email, role: g.user.role, canEdit: EDIT_ROLES.includes(g.user.role) },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
