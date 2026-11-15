import { NextResponse } from "next/server";
import { fetchAll, guard, EDIT_ROLES, adminClient } from "@/lib/dashboard/server";
import type { BangKe, Customer, MobAgg, MobDay, SrcSum } from "@/lib/dashboard/types";
import { mobEffectivePlan } from "@/lib/dashboard/mobPlan";
import { masterInfo } from "@/lib/dashboard/masterSync";

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

/* --------------------------------------------------------------------------
   GMV Mobility cho Tổng quan: gộp giao dịch của tab Mobility (mob_state.data.tx) theo
   ngày × doanh nghiệp × đơn vị cung cấp. Cùng quy tắc làm sạch với dashboard XPAY:
   bỏ merchant test CYGNUS, gộp các mã hợp đồng trùng của cùng một doanh nghiệp.
   Giao dịch: [0 ngày, 1 mã GD, 2 mã DN, 3 4 số cuối thẻ, 4 số tiền, 5 –, 6 đơn vị cung cấp, 7 tên DN, …]
   -------------------------------------------------------------------------- */
const MOB_MERGE: Record<string, string> = { "26000055": "20000020", "26000034": "24000290", "26000041": "20006788", "26000029": "20006419", "000000000ML": "109839192" };
const MOB_UNK = "(Chưa rõ đơn vị)";
async function mobAgg(): Promise<MobAgg | null> {
  try {
    const { data, error } = await adminClient().from("mob_state").select("tx:data->tx, merge:data->merge, plan:data->plan, updated_at").eq("id", "main").maybeSingle();
    if (error || !data) return null;
    const d = data as { tx: unknown; merge: unknown; plan: unknown; updated_at: string | null };
    const tx = Array.isArray(d.tx) ? (d.tx as unknown[][]) : [];
    const merge: Record<string, string> = { ...MOB_MERGE };
    if (d.merge && typeof d.merge === "object") for (const [a, b] of Object.entries(d.merge as Record<string, unknown>)) if (typeof b === "string" && a !== b) merge[a] = b;
    const by = new Map<string, MobDay>(), names: Record<string, string> = {}, units = new Set<string>();
    for (const t of tx) {
      const day = String(t[0] || ""), amt = Number(t[4]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isFinite(amt) || !amt) continue;
      if (/cygnus/i.test(String(t[6] || ""))) continue;
      let key = String(t[2] || "").trim();
      for (let i = 0; i < 3 && merge[key]; i++) key = merge[key];
      if (!key) continue;
      const u = String(t[6] || "").trim() || MOB_UNK;
      units.add(u);
      if (!names[key] && t[7]) names[key] = String(t[7]).replace(/^[A-Z0-9]{3,6}\s*-\s*/, "").trim();
      const k = `${day}|${key}|${u}`, r = by.get(k);
      if (r) { r[3] += amt; r[4]++; } else by.set(k, [day, key, u, amt, 1]);
    }
    return { rows: Array.from(by.values()), names, units: Array.from(units).sort(), updated_at: d.updated_at, plan: mobEffectivePlan(d.plan) };
  } catch {
    return null; // chưa có bảng mob_state → Tổng quan dùng số Mobility trong fin_gmv
  }
}

/** Tổng hợp file nguồn đã nạp — để xem độ phủ và phải trả NCC phát sinh theo đối soát */
async function srcSum(): Promise<SrcSum | null> {
  try {
    const [kh, ncc] = await Promise.all([
      fetchAll<{ loai: string; ky: string; ngay: string; gmv: number; tong_tt: number | null; uploaded_at: string }>("fin_src_kh", "id"),
      fetchAll<{ ncc: string | null; nganh: string | null; ky: string | null; khop: string | null; bang_ke: number | null; ledger: number | null; uploaded_at: string; file_name: string | null }>("fin_src_ncc", "id"),
    ]);
    const K = new Map<string, SrcSum["kh"][number]>();
    kh.forEach((r) => { const k = r.loai + "|" + r.ky, o = K.get(k) || { loai: r.loai, ky: r.ky, n: 0, gmv: 0, from: r.ngay, to: r.ngay, at: r.uploaded_at };
      o.n++; o.gmv += r.tong_tt ?? r.gmv; if (r.ngay < o.from) o.from = r.ngay; if (r.ngay > o.to) o.to = r.ngay; if (r.uploaded_at > o.at) o.at = r.uploaded_at; K.set(k, o); });
    const N = new Map<string, SrcSum["ncc"][number]>();
    ncc.forEach((r) => { const k = [r.ncc, r.ky, r.khop, r.file_name].join("|"), o = N.get(k) || { ncc: r.ncc, nganh: r.nganh, ky: r.ky, khop: r.khop, n: 0, bang_ke: 0, ledger: 0, at: r.uploaded_at, file: r.file_name || "" };
      o.n++; o.bang_ke += r.bang_ke || 0; o.ledger += r.ledger || 0; N.set(k, o); });
    return { kh: Array.from(K.values()), ncc: Array.from(N.values()) };
  } catch {
    return null; // chưa chạy migration 30
  }
}

export async function GET() {
  try {
    const g = await guard(false, "fin");
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const [params, customers, suppliers, staff, alloc, targets, gmv, ar, ap, cash, opex, contracts, uploads, snapshots, alertActions, arEdits, apEdits, manual] = await Promise.all([
      fetchAll<{ key: string; value: string | null }>("fin_params"),
      fetchAll<Customer>("fin_customers"), fetchAll("fin_suppliers"), fetchAll("fin_staff"), fetchAll("fin_pm_alloc"), fetchAll("fin_targets"),
      fetchAll("fin_gmv", "id"), fetchAll("fin_ar", "id"), fetchAll("fin_ap", "id"), fetchAll("fin_cash"), fetchAll("fin_opex"), fetchAll("fin_contracts"),
      fetchAll("fin_uploads", "id"), fetchAll("fin_snapshots"), fetchAll("fin_alert_actions"),
      fetchAll("fin_ar_edit"), fetchAll("fin_ap_edit"), fetchAll("fin_manual").catch(() => []),
    ]);
    const [bangKe, mob, src, md] = await Promise.all([bangKeMap(customers), mobAgg(), srcSum(), masterInfo(customers)]);
    // PM phụ trách lấy theo Master Data (tab Xperise): pháp nhân → nhóm
    customers.forEach((c) => { const p = md.pm.get(c.ma_kh); if (p) c.pm = p; });
    const grp = md.grp;
    return NextResponse.json({
      params: Object.fromEntries(params.map((p) => [p.key, p.value ?? ""])),
      customers, suppliers, staff, alloc, targets, gmv, ar, ap, cash, opex, contracts,
      uploads: (uploads as { id: number }[]).slice(-30).reverse(), snapshots, alertActions,
      arEdits, apEdits, manual, bangKe, mob, src, grp,
      me: { email: g.user.email, role: g.user.role, canEdit: EDIT_ROLES.includes(g.user.role) },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
