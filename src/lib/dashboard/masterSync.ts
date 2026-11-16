// Nối danh mục khách của Dashboard (fin_customers) với Master Data của tab Xperise
// (billing_groups = nhóm đối soát, customers = pháp nhân):
//   · PM phụ trách: lấy ở Master Data — PM của pháp nhân, không có thì PM của nhóm.
//   · Đồng bộ: khách Travel có trong Dashboard mà Master Data chưa có thì thêm vào Master Data
//     (vào nhóm trùng mã / tên nếu có, không thì tạo nhóm mới chưa có lịch gửi — workflow gửi thư không chạy cho nhóm này).
import { adminClient, fetchAll } from "./server";

export const nk = (s: string | null | undefined) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toUpperCase().replace(/[^A-Z0-9]/g, "");
interface Grp { id: string; ma_he_thong: string; ten_nhom: string; pm?: string | null }
interface Pn { id: string; group_id: string; code: string | null; ten_khach_hang: string; ten_viet_tat: string | null; pm?: string | null; ten_khac?: string | null }
/** Tên gọi khác mặc định (khi Master Data chưa khai cột "Tên gọi khác"): mã KH trong Dashboard → các tên trên hệ thống khác */
const ALIAS_MAC_DINH: Record<string, string[]> = {
  "SAO THUY": ["MASTERISE", "CTCP TẬP ĐOÀN MASTERISE", "CÔNG TY CỔ PHẦN TẬP ĐOÀN MASTERISE", "TECHCOMBANK", "TCB"],
};
interface Kh { ma_kh: string; ten_kh: string; ten_viet_tat: string | null; nhom: string; pm: string | null; ma_he_thong?: string | null }

async function master(withPm: boolean, withAlias = withPm) {
  const sb = adminClient();
  const [g, p] = await Promise.all([
    sb.from("billing_groups").select(withPm ? "id,ma_he_thong,ten_nhom,pm" : "id,ma_he_thong,ten_nhom"),
    sb.from("customers").select("id,group_id,code,ten_khach_hang,ten_viet_tat" + (withPm ? ",pm" : "") + (withAlias ? ",ten_khac" : "")),
  ]);
  if (g.error || p.error) throw new Error((g.error || p.error)!.message);
  return { groups: (g.data || []) as unknown as Grp[], pns: (p.data || []) as unknown as Pn[] };
}
function index(groups: Grp[], pns: Pn[]) {
  const pnBy = new Map<string, Pn>(), grpBy = new Map<string, Grp>(), grpId = new Map(groups.map((x) => [x.id, x]));
  pns.forEach((p) => [p.code, p.ten_viet_tat, p.ten_khach_hang, ...String(p.ten_khac || "").split(/[,;\n]/)].forEach((k) => { const x = nk(k); if (x && !pnBy.has(x)) pnBy.set(x, p); }));
  groups.forEach((x) => [x.ma_he_thong, x.ten_nhom].forEach((k) => { const y = nk(k); if (y && !grpBy.has(y)) grpBy.set(y, x); }));
  const findPn = (c: Kh) => [c.ma_kh, c.ten_viet_tat, c.ten_kh].map(nk).map((k) => (k ? pnBy.get(k) : undefined)).find(Boolean);
  const findGrp = (c: Kh) => [c.ma_he_thong, c.ma_kh, c.ten_viet_tat].map(nk).map((k) => (k ? grpBy.get(k) : undefined)).find(Boolean);
  return { findPn, findGrp, grpId };
}
const isTravel = (c: Kh) => !["N2", "N3", "N4", "N5"].includes(c.nhom);

/** Theo Master Data, cho từng khách của Dashboard (mã KH = pháp nhân):
 *  pm: PM phụ trách (pháp nhân → nhóm); grp: nhóm đối soát để Tổng quan / Travel & SaaS hiển thị theo nhóm.
 *  Chưa chạy migration 33 thì vẫn có nhóm, không có PM. */
export async function masterInfo(customers: Kh[]): Promise<{ pm: Map<string, string>; grp: Record<string, { k: string; ten: string; pm: string | null }>; alias: Record<string, string> }> {
  const pm = new Map<string, string>(), grp: Record<string, { k: string; ten: string; pm: string | null }> = {};
  const alias = aliasMacDinh(customers);
  let M: Awaited<ReturnType<typeof master>>;
  try { M = await master(true, true); } catch { try { M = await master(true, false); } catch { try { M = await master(false, false); } catch { return { pm, grp, alias }; } } }
  // tên gọi khác khai ở Master Data → mã KH của Dashboard khớp với pháp nhân đó
  const pnToKh = new Map<string, string>();
  { const { findPn } = index(M.groups, M.pns); customers.filter(isTravel).forEach((c) => { const p = findPn(c); if (p && !pnToKh.has(p.id)) pnToKh.set(p.id, c.ma_kh); }); }
  // pháp nhân đã khai "Tên gọi khác" thì bỏ danh sách mặc định của khách đó, dùng đúng danh sách đã khai
  M.pns.forEach((p) => { const ma = pnToKh.get(p.id); if (ma && String(p.ten_khac || "").trim()) Object.keys(alias).forEach((k) => { if (alias[k] === ma) delete alias[k]; }); });
  M.pns.forEach((p) => { const ma = pnToKh.get(p.id); if (!ma) return; String(p.ten_khac || "").split(/[,;\n]/).forEach((n) => { const x = nk(n); if (x) alias[x] = ma; }); });
  const { findPn, findGrp, grpId } = index(M.groups, M.pns);
  customers.filter(isTravel).forEach((c) => {
    const p = findPn(c), g = p ? grpId.get(p.group_id) : findGrp(c);
    const x = (p?.pm || g?.pm || "").trim();
    if (x) pm.set(c.ma_kh, x);
    if (g) grp[c.ma_kh] = { k: `G:${g.ma_he_thong}`, ten: g.ten_nhom, pm: (g.pm || "").trim() || null };
  });
  return { pm, grp, alias };
}
/** Tên gọi khác mặc định, chỉ khi Dashboard có khách đó */
function aliasMacDinh(customers: Kh[]): Record<string, string> {
  const out: Record<string, string> = {}, co = new Set(customers.map((c) => c.ma_kh));
  Object.entries(ALIAS_MAC_DINH).forEach(([ma, ns]) => { if (co.has(ma)) ns.forEach((n) => { out[nk(n)] = ma; }); });
  return out;
}

/** Thêm vào Master Data các khách Travel của Dashboard chưa có ở đó. */
export async function syncTravelToMaster(): Promise<{ nhomMoi: string[]; phapNhanMoi: string[] }> {
  const sb = adminClient();
  const kh = (await fetchAll<Kh>("fin_customers")).filter(isTravel);
  let withPm = true, M: Awaited<ReturnType<typeof master>>;
  try { M = await master(true); } catch { withPm = false; M = await master(false); }
  const { groups, pns } = M;
  const { findPn, findGrp } = index(groups, pns);
  const usedMa = new Set(groups.map((g) => g.ma_he_thong));
  const nhomMoi: string[] = [], phapNhanMoi: string[] = [];
  for (const c of kh) {
    if (findPn(c)) continue;
    let g = findGrp(c);
    if (!g) {
      let ma = c.ma_kh, i = 2;
      while (usedMa.has(ma)) ma = `${c.ma_kh}-${i++}`;
      const vt = c.ten_viet_tat && !/^\d{8,14}(-\d{3})?$/.test(c.ten_viet_tat.trim()) ? c.ten_viet_tat : null; // tên viết tắt là MST thì dùng tên đầy đủ
      const row: Record<string, unknown> = { ma_he_thong: ma, ten_nhom: vt || c.ten_kh, ghi_chu: "Thêm từ Dashboard — chưa có lịch gửi bảng kê" };
      if (withPm && c.pm) row.pm = c.pm;
      const { data, error } = await sb.from("billing_groups").insert(row).select("id,ma_he_thong,ten_nhom").single();
      if (error) throw new Error(`Tạo nhóm ${ma}: ${error.message}`);
      g = data as Grp; usedMa.add(ma); groups.push(g); nhomMoi.push(ma);
    }
    const { data: pn, error: e2 } = await sb.from("customers").insert({ group_id: g.id, code: c.ma_kh, ten_khach_hang: c.ten_kh, ten_viet_tat: c.ten_viet_tat }).select("id,group_id,code,ten_khach_hang,ten_viet_tat").single();
    if (e2) throw new Error(`Thêm pháp nhân ${c.ma_kh}: ${e2.message}`);
    pns.push(pn as Pn); phapNhanMoi.push(c.ma_kh);
    if (!c.ma_he_thong) await sb.from("fin_customers").update({ ma_he_thong: g.ma_he_thong }).eq("ma_kh", c.ma_kh);
  }
  return { nhomMoi, phapNhanMoi };
}
