import { NextResponse } from "next/server";
import { adminClient, guard, fetchAll } from "@/lib/dashboard/server";
import type { KhRow, NccRow, ArRow, DmRow } from "@/lib/dashboard/sources";
import { inferNcc } from "@/lib/dashboard/sources";
import { canonNcc, fixSwappedDates } from "@/lib/dashboard/alias";
import { kyEnd, addDays } from "@/lib/dashboard/util";
import { syncTravelToMaster, masterInfo } from "@/lib/dashboard/masterSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* Nạp file nguồn (bảng kê khách hàng, đối soát NCC, sổ công nợ phải thu) — xem supabase/migrations/30_dashboard_nguon.sql.
   Thứ tự client gửi: công nợ phải thu → bảng kê khách hàng → đối soát NCC → rebuild.
     kh      { loai, kys, rows, first }   thay bảng kê của loai + các kỳ trong file
     ncc     { fileKey, fileName, rows, first }  thay dữ liệu cũ của cùng file đối soát
     dm      { rows }                     danh mục khách: cập nhật tên, payment term; khách mới vào nhóm N1
     ar      { kys, rows, first }         thay công nợ phải thu Travel (giữ khách Mobility N2–N5)
     rebuild {}                           dựng lại GMV & giá vốn theo ngày vào fin_gmv (nguon 'bk') */
type Body =
  | { action: "kh"; loai: "hotel" | "flight" | "transport"; kys: string[]; rows: KhRow[]; first: boolean; fileName?: string; cty?: string }
  | { action: "ncc"; fileKey: string; fileName?: string; rows: NccRow[]; first: boolean }
  | { action: "dm"; rows: DmRow[] }
  | { action: "ar"; kys: string[]; rows: ArRow[]; first: boolean }
  | { action: "rebuild" }
  | { action: "guibk"; rows: { ma_kh: string; ky: string }[] };

const KY = /^T\d{2}\.\d{4}$/;
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const chk = (e: { message: string } | null, what: string) => { if (e) throw new Error(`${what}: ${e.message}`); };
const missing = (m: string) => /fin_src_|column .*(ngay|gmv_co_gv|nguon)|does not exist|schema cache/i.test(m);

export async function POST(req: Request) {
  try {
    const g = await guard(true, "fin");
    if ("error" in g) return fail(g.error, g.status);
    const b = (await req.json()) as Body;
    const sb = adminClient();
    const now = new Date().toISOString();

    if (b.action === "kh") {
      if (!["hotel", "flight", "transport"].includes(b.loai)) return fail("Loại bảng kê không hợp lệ");
      if (b.loai === "transport" && !b.cty) return fail("Bảng kê Be thiếu tên công ty (lấy từ tên file Be_statement_<tên công ty>_<ngày>)");
      const kys = (b.kys || []).filter((k) => KY.test(k));
      if (b.first && kys.length) {
        // Be: mỗi file là một công ty — chỉ thay số của công ty đó
        let q = sb.from("fin_src_kh").delete().eq("loai", b.loai).in("ky", kys);
        if (b.loai === "transport") q = q.eq("ten_cong_ty", b.cty as string);
        const { error } = await q; chk(error, "Xóa bảng kê cũ");
      }
      const rows = (b.rows || []).filter((r) => KY.test(r.ky) && r.ngay).map((r) => ({ ...r, loai: b.loai, file_name: b.fileName || null, uploaded_at: now }));
      if (rows.length) { const { error } = await sb.from("fin_src_kh").insert(rows); chk(error, "Ghi bảng kê"); }
      return NextResponse.json({ ok: true, written: rows.length });
    }

    if (b.action === "ncc") {
      if (!b.fileKey) return fail("Thiếu tên file đối soát");
      if (b.first) { const { error } = await sb.from("fin_src_ncc").delete().eq("file_key", b.fileKey); chk(error, "Xóa đối soát cũ"); }
      const rows = (b.rows || []).map((r) => ({ ...r, file_key: b.fileKey, file_name: b.fileName || null, uploaded_at: now }));
      if (rows.length) { const { error } = await sb.from("fin_src_ncc").insert(rows); chk(error, "Ghi đối soát NCC"); }
      return NextResponse.json({ ok: true, written: rows.length });
    }

    if (b.action === "dm") {
      // Gộp với danh mục hiện có: khách cũ giữ nhóm, PM, sales, mã nhóm đối soát, ghi chú; chỉ cập nhật tên và payment term
      const cur = new Map((await fetchAll<Record<string, unknown>>("fin_customers")).map((c) => [String(c.ma_kh), c]));
      let moi = 0;
      const rows = (b.rows || []).filter((r) => r.ma_kh && r.ten_kh).map((r) => {
        const o = cur.get(r.ma_kh);
        if (!o) moi++;
        return { ...(o || { nhom: "N1", pm: null, sales: null, ma_he_thong: null, ghi_chu: "Thêm từ sổ công nợ phải thu" }), ma_kh: r.ma_kh,
          ten_kh: r.ten_kh, ten_viet_tat: r.ten_viet_tat || (o?.ten_viet_tat as string) || null,
          credit_term: r.credit_term ?? (o?.credit_term as number | null) ?? null, updated_at: now };
      });
      for (let i = 0; i < rows.length; i += 500) { const { error } = await sb.from("fin_customers").upsert(rows.slice(i, i + 500), { onConflict: "ma_kh" }); chk(error, "Ghi danh mục khách hàng"); }
      // khách Travel chưa có ở Master Data (tab Xperise) thì thêm vào đó
      let master: unknown = null;
      try { master = await syncTravelToMaster(); } catch (e) { master = { loi: e instanceof Error ? e.message : String(e) }; }
      return NextResponse.json({ ok: true, written: rows.length, moi, master });
    }

    if (b.action === "ar") {
      const kys = (b.kys || []).filter((k) => KY.test(k));
      let suaTay = 0;
      if (b.first) {
        // Thay toàn bộ phải thu Travel; giữ phải thu khách Mobility (N2–N5) đang lấy từ nguồn khác
        const mob = (await fetchAll<{ ma_kh: string; nhom: string }>("fin_customers")).filter((c) => ["N2", "N3", "N4", "N5"].includes(c.nhom)).map((c) => c.ma_kh);
        let q = sb.from("fin_ar").delete();
        q = mob.length ? q.not("ma_kh", "in", `(${mob.map((m) => `"${m.replace(/"/g, '""')}"`).join(",")})`) : q.not("ma_kh", "is", null);
        const { error } = await q; chk(error, "Xóa công nợ phải thu cũ");
        if (kys.length) {
          // Số sửa tay của các kỳ có trong file: file là số chuẩn cho tiền & ngày thu; giữ ngày gửi bảng kê và ghi chú
          const r0 = await sb.from("fin_ar_edit").delete({ count: "exact" }).in("ky", kys).eq("tu_tao", true);
          chk(r0.error, "Bỏ dòng thêm tay"); suaTay += r0.count || 0;
          const r1 = await sb.from("fin_ar_edit").delete({ count: "exact" }).in("ky", kys).neq("so_ct", "");
          chk(r1.error, "Bỏ dòng sửa tay theo hóa đơn"); suaTay += r1.count || 0;
          const r2 = await sb.from("fin_ar_edit").update({ so_tien: null, da_thu: null, ngay_thu_du: null, ngay_thu_gan_nhat: null, ngay_den_han: null, ngay_hd: null, updated_at: now })
            .in("ky", kys).eq("so_ct", "").eq("tu_tao", false);
          chk(r2.error, "Bỏ số tiền sửa tay");
          // dòng rỗng (không còn ngày gửi, ghi chú, cờ đã gửi) thì xóa; chưa chạy migration 32 thì bỏ điều kiện cờ
          const del = (flag: boolean) => { let q = sb.from("fin_ar_edit").delete({ count: "exact" }).in("ky", kys).eq("so_ct", "").eq("tu_tao", false).eq("xoa", false).is("ngay_gui_bk", null).is("ghi_chu", null); if (flag) q = q.eq("da_gui_bk", false); return q; };
          let r3 = await del(true);
          if (r3.error && /da_gui_bk/.test(r3.error.message)) r3 = await del(false);
          chk(r3.error, "Dọn dòng sửa tay rỗng"); suaTay += r3.count || 0;
        }
      }
      const rows = (b.rows || []).filter((r) => r.ma_kh && KY.test(r.ky) && r.ngay_den_han);
      for (let i = 0; i < rows.length; i += 1000) { const { error } = await sb.from("fin_ar").insert(rows.slice(i, i + 1000).map((r) => ({ ...r, ngay_gui_bk: null }))); chk(error, "Ghi công nợ phải thu"); }
      return NextResponse.json({ ok: true, written: rows.length, suaTay });
    }

    if (b.action === "guibk") {
      // Đánh dấu đã gửi bảng kê ở mức kỳ — chỉ bật cờ, không ghi ngày gửi, không đụng các ô khác
      const rows = (b.rows || []).filter((r) => r.ma_kh && KY.test(r.ky))
        .map((r) => ({ ma_kh: r.ma_kh, ky: r.ky, so_ct: "", da_gui_bk: true, updated_by: g.user.email, updated_at: now }));
      for (let i = 0; i < rows.length; i += 500) { const { error } = await sb.from("fin_ar_edit").upsert(rows.slice(i, i + 500), { onConflict: "ma_kh,ky,so_ct" }); chk(error, "Ghi ngày gửi bảng kê"); }
      return NextResponse.json({ ok: true, written: rows.length });
    }
    if (b.action === "rebuild") return NextResponse.json(await rebuild(sb));
    return fail("Thao tác không hợp lệ");
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/da_gui_bk/.test(m)) return fail("Chưa có cột đánh dấu đã gửi bảng kê — chạy supabase/migrations/32_dashboard_da_gui_bk.sql trong Supabase SQL Editor rồi bấm lại.", 500);
    if (/loai_check/.test(m)) return fail("Chưa mở loại bảng kê Be — chạy supabase/migrations/31_dashboard_be.sql trong Supabase SQL Editor rồi nạp lại.", 500);
    if (missing(m)) return fail("Chưa tạo bảng nạp file nguồn — chạy supabase/migrations/30_dashboard_nguon.sql trong Supabase SQL Editor rồi nạp lại. (" + m + ")", 500);
    return fail(m, 500);
  }
}

/* --------------------------------------------------------------------------
   Dựng lại GMV & giá vốn theo ngày từ bảng kê khách hàng + đối soát NCC.
   · Khách hàng: theo số hóa đơn trong sổ phải thu → tên công ty (đa số các dòng cùng công ty đã nối được
     hóa đơn) → tên viết tắt / tên trong danh mục → giữ nguyên tên công ty (báo lại để bổ sung danh mục).
   · Giá vốn: dòng đối soát NCC (bỏ dòng "Trùng") → file chi khách sạn trực tiếp B1 → giá NCC trên hệ thống, nối với dòng bảng kê bằng mã booking (hotel: mã giao dịch;
     flight: mã giao dịch chiều đi / về) hoặc số vé. Một booking NCC ứng nhiều dòng bảng kê thì chia giá vốn
     theo tỷ trọng GMV. Dòng bảng kê không nối được NCC thì chưa có giá vốn (gmv_co_gv không tính dòng đó).
   · GMV = Tổng thành tiền (sau chiết khấu, có phí dịch vụ); dòng không có thì lấy Thành tiền.
   · Ghi vào fin_gmv (nguon 'bk'), thay mọi dòng Hotel / Flight của các kỳ có bảng kê.
   -------------------------------------------------------------------------- */
type Sb = ReturnType<typeof adminClient>;
interface Kh extends KhRow { id: number }
interface Ncc extends NccRow { id: number }
const nk = (s: string | null | undefined) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toUpperCase().replace(/[^A-Z0-9]/g, "");
const hdKey = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");
/** Mã booking bỏ thứ tự các phần: "UTSNE261001 - 422785" ≡ "422785_UTSNE261001" */
const tokKey = (s: string | null | undefined) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).sort().join("|");
/** GMV = Tổng thành tiền (sau chiết khấu, có phí dịch vụ). Dòng không có — hoặc hệ thống xuất 0 trong khi Thành tiền
 *  khác 0 (vd. các booking của Masterise) — thì lấy Thành tiền + phí dịch vụ − chiết khấu */
const gmvOf = (r: KhRow) => (r.tong_tt != null && !(Number(r.tong_tt) === 0 && Number(r.gmv) !== 0) ? Number(r.tong_tt) : Number(r.gmv) + Number(r.phi_dv || 0) - Number(r.chiet_khau || 0));
/** Transportation (Be): margin 6% → giá vốn = GMV × 94%, NCC = Be */
const BE_MARGIN = 0.06;

async function rebuild(sb: Sb) {
  const supAll = await fetchAll<{ ma_ncc: string; ten_ncc: string }>("fin_suppliers");
  const [kh, ncc, ar, cust] = await Promise.all([
    fetchAll<Kh>("fin_src_kh", "id"), fetchAll<Ncc>("fin_src_ncc", "id"),
    fetchAll<{ ma_kh: string; so_ct: string | null }>("fin_ar", "id"), fetchAll<{ ma_kh: string; ten_kh: string; ten_viet_tat: string | null }>("fin_customers"),
  ]);
  // Ngày bị đảo ngày/tháng trong file đối soát đã nạp: sửa theo từng file, lưu lại
  const byFile = new Map<string, Ncc[]>();
  ncc.forEach((n) => { const k = (n as Ncc & { file_key?: string }).file_key || ""; if ((n.khop || "").startsWith("HT:") || (n.khop || "").startsWith("B1:")) return; const a = byFile.get(k) || []; a.push(n); byFile.set(k, a); });
  for (const rows of Array.from(byFile.values())) {
    const fx = fixSwappedDates(rows.map((n) => n.ngay_dv));
    for (let i = 0; i < rows.length; i++) {
      if (fx[i] === rows[i].ngay_dv || !fx[i]) continue;
      const d = fx[i] as string, ky = `T${d.slice(5, 7)}.${d.slice(0, 4)}`;
      const { error } = await sb.from("fin_src_ncc").update({ ngay_dv: d, ky }).eq("id", rows[i].id);
      chk(error, "Sửa ngày đảo trong file đối soát");
      rows[i].ngay_dv = d; rows[i].ky = ky;
    }
  }
  // Dòng đối soát chưa có NCC (thiếu trong hệ thống): suy NCC theo sheet bảng kê NCC trong cùng file, lưu lại vào bảng
  const inf = inferNcc(ncc.filter((n) => !(n.khop || "").startsWith("HT:") && !(n.khop || "").startsWith("B1:")), (n) => (n as Ncc & { file_key?: string }).file_key || "");
  const nccSuy = new Map<string, number[]>();
  inf.forEach((v, n) => { n.ncc = v; const a = nccSuy.get(v) || []; a.push(n.id); nccSuy.set(v, a); });
  for (const [v, ids] of Array.from(nccSuy.entries())) {
    for (let i = 0; i < ids.length; i += 500) {
      const { error } = await sb.from("fin_src_ncc").update({ ncc: v, nganh: v.startsWith("hotel:") ? "Hotel" : v.startsWith("flight:") ? "Flight" : null }).in("id", ids.slice(i, i + 500));
      chk(error, "Gán NCC cho dòng thiếu trong hệ thống");
    }
  }
  if (!kh.length) return { ok: true, kys: [], rows: 0, note: "Chưa có bảng kê khách hàng nào" };

  /* --- tên gọi khác (Master Data + mặc định): gộp về đúng mã KH, kể cả số phải thu đã nạp dưới mã khác --- */
  const { alias } = await masterInfo(cust.map((c) => ({ ma_kh: c.ma_kh, ten_kh: c.ten_kh, ten_viet_tat: c.ten_viet_tat, nhom: "N1", pm: null })));
  const gop: { tu: string; ve: string }[] = [];
  cust.forEach((c) => { const ve = [c.ma_kh, c.ten_viet_tat, c.ten_kh].map((x) => alias[nk(x)]).find(Boolean); if (ve && ve !== c.ma_kh) gop.push({ tu: c.ma_kh, ve }); });
  for (const g of gop) {
    const { error } = await sb.from("fin_ar").update({ ma_kh: g.ve }).eq("ma_kh", g.tu);
    chk(error, `Gộp phải thu ${g.tu} → ${g.ve}`);
    ar.forEach((r) => { if (r.ma_kh === g.tu) r.ma_kh = g.ve; });
  }

  /* --- khách hàng --- */
  const byHd = new Map<string, string>();
  ar.forEach((r) => { const k = hdKey(r.so_ct); if (k && !byHd.has(k)) byHd.set(k, r.ma_kh); });
  const byName = new Map<string, string>();
  cust.forEach((c) => { [c.ten_viet_tat, c.ten_kh, c.ma_kh].forEach((x) => { const k = nk(x); if (k && !byName.has(k)) byName.set(k, c.ma_kh); }); });
  const vote = new Map<string, Map<string, number>>();
  kh.forEach((r) => { const m = byHd.get(hdKey(r.so_hd)); if (!m) return; const k = nk(r.ten_cong_ty), v = vote.get(k) || new Map(); v.set(m, (v.get(m) || 0) + Math.abs(gmvOf(r))); vote.set(k, v); });
  const byCompany = new Map<string, string>();
  vote.forEach((v, k) => byCompany.set(k, Array.from(v.entries()).sort((a, b) => b[1] - a[1])[0][0]));
  const chuaMap = new Map<string, number>();
  const khOf = (r: Kh) => {
    const viaHd = byHd.get(hdKey(r.so_hd));
    if (viaHd) return viaHd;
    const k = nk(r.ten_cong_ty);
    if (alias[k]) return alias[k];
    const m = byCompany.get(k) || byName.get(k);
    if (m) return m;
    const ten = (r.ten_cong_ty || "CHƯA RÕ").trim().toUpperCase();
    chuaMap.set(ten, (chuaMap.get(ten) || 0) + gmvOf(r));
    return ten;
  };

  /* --- giá vốn --- */
  const idx = new Map<string, Kh[]>();
  const put = (k: string, r: Kh) => { if (!k) return; const a = idx.get(k) || []; if (!a.includes(r)) a.push(r); idx.set(k, a); };
  kh.forEach((r) => {
    if (r.loai === "hotel") { put("H|" + nk(r.ma_gd), r); put("T|" + tokKey(r.ma_gd), r); }
    else if (r.loai === "flight") { put("F|" + nk(r.ma_gd), r); put("F|" + nk(r.ma_gd2), r); if (r.so_ve && !/^temp_/i.test(r.so_ve)) put("V|" + nk(r.so_ve), r); }
  });
  const gv = new Map<number, number>(), nccOf = new Map<number, string>();
  let nccHit = 0, nccMiss = 0, nccMissAmt = 0;
  // Thứ tự nguồn giá vốn: 0 đối soát NCC → 1 chi khách sạn trực tiếp B1 → 2 giá NCC trên hệ thống.
  // Dòng bảng kê đã có giá vốn từ nguồn đứng trước thì nguồn sau không cộng thêm.
  const tier = (n: Ncc) => (n.khop?.startsWith("HT:") ? 2 : n.khop?.startsWith("B1:") ? 1 : 0);
  const TIER_L = ["Đối soát NCC", "Chi KS trực tiếp B1", "Giá NCC hệ thống", "Be (margin 6%)"];
  const coveredBy = new Map<number, number>();
  const srcOf = new Map<number, number>();
  let htHit = 0, htMiss = 0;
  ncc.slice().sort((a, b) => tier(a) - tier(b)).forEach((n) => {
    if (n.khop?.startsWith("Trùng") || n.bang_ke == null) return;
    const t = tier(n);
    const flight = n.nganh === "Flight" || n.ncc?.startsWith("flight:");
    const hits = new Set<Kh>();
    if (flight) {
      String(n.ma_booking || "").split(/\s*\/\s*/).forEach((code) => (idx.get("F|" + nk(code)) || []).forEach((r) => hits.add(r)));
      if (n.so_ve) (idx.get("V|" + nk(n.so_ve)) || []).forEach((r) => hits.add(r));
    }
    else {
      (idx.get("H|" + nk(n.ma_booking)) || []).forEach((r) => hits.add(r));
      if (!hits.size && tokKey(n.ma_booking).includes("|")) (idx.get("T|" + tokKey(n.ma_booking)) || []).forEach((r) => hits.add(r));
    }
    const rs = Array.from(hits).filter((r) => (coveredBy.get(r.id) ?? t) >= t);
    if (!rs.length) { if (t === 2) htMiss++; else if (!hits.size) { nccMiss++; nccMissAmt += n.bang_ke; } return; }
    rs.forEach((r) => { coveredBy.set(r.id, t); srcOf.set(r.id, t); });
    if (t === 2) htHit++; else nccHit++;
    // Booking đã hủy trên hệ thống: giá vốn theo phần khách vẫn bị thu trên bảng kê (hoàn hết thì 0)
    let bkAmt = n.bang_ke;
    if (t === 2 && /cancel/i.test(n.xu_ly || "")) {
      const net = rs.reduce((s, r) => s + gmvOf(r), 0), sold = Number(n.ledger || 0);
      bkAmt = sold > 0 ? n.bang_ke * Math.max(0, Math.min(1, net / sold)) : 0;
    }
    // chia giá vốn theo tỷ trọng GMV (có dấu: dòng hoàn vé / hủy phòng nhận phần âm)
    const tot = rs.reduce((s, r) => s + gmvOf(r), 0), totAbs = rs.reduce((s, r) => s + Math.abs(gmvOf(r)), 0);
    rs.forEach((r) => {
      const bk = bkAmt;
      const part = tot !== 0 ? bk * gmvOf(r) / tot : totAbs > 0 ? bk * Math.abs(gmvOf(r)) / totAbs : bk / rs.length;
      gv.set(r.id, (gv.get(r.id) || 0) + part);
      if (!nccOf.has(r.id) && n.ncc) nccOf.set(r.id, canonNcc(supAll, n.ncc.replace(/^(hotel|flight):/, "")));
    });
  });

  /* --- gộp theo ngày × khách × NCC × dịch vụ --- */
  const kys = Array.from(new Set(kh.map((r) => r.ky)));
  const agg = new Map<string, { ky: string; ngay: string; ma_kh: string; ma_ncc: string | null; dich_vu: string; gmv: number; gia_von: number; gmv_co_gv: number }>();
  let gmvAll = 0, gmvCov = 0;
  const theoNguon: Record<string, number> = {};
  // Be: giá vốn theo margin cố định
  kh.forEach((r) => { if (r.loai === "transport") { gv.set(r.id, gmvOf(r) * (1 - BE_MARGIN)); nccOf.set(r.id, "Be"); srcOf.set(r.id, 3); } });
  kh.forEach((r) => {
    const ma = khOf(r), n = nccOf.get(r.id) || null, dv = r.loai === "hotel" ? "Hotel" : r.loai === "flight" ? "Flight" : "Transportation";
    const key = `${r.ky}|${r.ngay}|${ma}|${n || ""}|${dv}`;
    const o = agg.get(key) || { ky: r.ky, ngay: r.ngay, ma_kh: ma, ma_ncc: n, dich_vu: dv, gmv: 0, gia_von: 0, gmv_co_gv: 0 };
    const G = gmvOf(r);
    o.gmv += G; gmvAll += G;
    if (gv.has(r.id)) { o.gia_von += gv.get(r.id) as number; o.gmv_co_gv += G; gmvCov += G; const l = TIER_L[srcOf.get(r.id) ?? 0]; theoNguon[l] = (theoNguon[l] || 0) + G; }
    agg.set(key, o);
  });
  const rows = Array.from(agg.values()).map((o) => ({ ...o, gmv: Math.round(o.gmv), gia_von: Math.round(o.gia_von), gmv_co_gv: Math.round(o.gmv_co_gv), chiet_khau: null, nguon: "bk" }));

  const { error: e1 } = await sb.from("fin_gmv").delete().in("ky", kys).in("dich_vu", ["Hotel", "Flight", "Transportation"]);
  chk(e1, "Xóa GMV Hotel/Flight/Transportation cũ");
  for (let i = 0; i < rows.length; i += 1000) { const { error } = await sb.from("fin_gmv").insert(rows.slice(i, i + 1000)); chk(error, "Ghi GMV theo ngày"); }

  const ap = await rebuildAP(sb, ncc);

  return {
    ok: true, kys: kys.sort(), rows: rows.length, ap,
    gmv: Math.round(gmvAll), gmvCoGv: Math.round(gmvCov),
    ncc: { noi: nccHit, khongNoi: nccMiss, khongNoiTien: Math.round(nccMissAmt) },
    gopKhach: gop.map((g) => `${g.tu} → ${g.ve}`),
    ht: { noi: htHit, khongNoi: htMiss },
    theoNguon: Object.fromEntries(Object.entries(theoNguon).map(([k, v]) => [k, Math.round(v)])),
    khachChuaMap: Array.from(chuaMap.entries()).sort((a, b) => b[1] - a[1]).map(([ten, v]) => ({ ten, gmv: Math.round(v) })),
  };
}

/* --------------------------------------------------------------------------
   Công nợ phải trả dựng từ file nguồn — mỗi NCC × kỳ dịch vụ một dòng trong fin_ap (so_ct "DS <kỳ>"):
   · Phải trả = tổng cột "Bảng kê" (số NCC tính) của các file đối soát NCC, bỏ dòng "Trùng".
   · Khách sạn trực tiếp (file B1) gộp thành một NCC; đã trả = các booking "Đã chi", ngày trả = ngày chi muộn nhất.
   · Giá NCC trên hệ thống không tính (không phải số NCC đòi).
   · Ngày ghi nhận = ngày cuối kỳ dịch vụ; đến hạn = ngày cuối kỳ + payment term trong danh mục NCC (chưa có = 0).
   · Đã trả của các NCC khác: kế toán nhập ở bảng "Phải trả & đã trả" (tab Công nợ) — lưu ở fin_ap_edit nên dựng lại không mất.
   -------------------------------------------------------------------------- */
const KS_B1 = "KS_TRUC_TIEP", CHUA_RO = "CHUA_RO_NCC";
async function rebuildAP(sb: Sb, ncc: Ncc[]) {
  const supList = await fetchAll<{ ma_ncc: string; ten_ncc: string; payment_term: number | null }>("fin_suppliers");
  const sup = new Map(supList.map((s) => [s.ma_ncc, s]));
  const agg = new Map<string, { ma: string; ky: string; nganh: string; tien: number; tra: number; ngayTra: string | null }>();
  ncc.forEach((n) => {
    const k = n.khop || "";
    if (k.startsWith("Trùng") || k.startsWith("HT:") || n.bang_ke == null || !n.ky || !KY.test(n.ky)) return;
    const b1 = k.startsWith("B1:");
    // tên gọi khác của NCC (vd. HNH = Hồng Ngọc Hà) gộp về mã NCC đang có trong danh mục
    const ma = b1 ? KS_B1 : canonNcc(supList, String(n.ncc || "").replace(/^(hotel|flight):/, "") || CHUA_RO);
    const key = `${ma}|${n.ky}`;
    const o = agg.get(key) || { ma, ky: n.ky, nganh: n.nganh || "Khác", tien: 0, tra: 0, ngayTra: null };
    o.tien += n.bang_ke;
    if (b1 && k === "B1: Đã chi") {
      o.tra += n.bang_ke;
      const d = /chi (\d{4}-\d{2}-\d{2})/.exec(n.mo_ta || "")?.[1] || null;
      if (d && (!o.ngayTra || d > o.ngayTra)) o.ngayTra = d;
    }
    agg.set(key, o);
  });
  const rows = Array.from(agg.values()).map((o) => {
    const end = kyEnd(o.ky), term = Number(sup.get(o.ma)?.payment_term ?? 0) || 0;
    const b1 = o.ma === KS_B1;
    return { ma_ncc: o.ma, ky: o.ky, so_ct: `DS ${o.ky}`, ngay_hd: end, ngay_den_han: addDays(end, term), so_tien: Math.round(o.tien),
      da_tra: b1 ? Math.round(o.tra) : null, ngay_tra: b1 && o.tra > 0 ? o.ngayTra : null };
  });
  const { error: e1 } = await sb.from("fin_ap").delete().like("so_ct", "DS %");
  chk(e1, "Xóa phải trả dựng từ đối soát cũ");
  for (let i = 0; i < rows.length; i += 1000) { const { error } = await sb.from("fin_ap").insert(rows.slice(i, i + 1000)); chk(error, "Ghi công nợ phải trả"); }
  // NCC chưa có trong danh mục: thêm với payment term 0 (sửa ở danh mục NCC)
  const moi = Array.from(new Map(Array.from(agg.values()).filter((o) => !sup.has(o.ma)).map((o) => [o.ma, o])).values()).map((o) => ({
    ma_ncc: o.ma, ten_ncc: o.ma === KS_B1 ? "Khách sạn trực tiếp (B1)" : o.ma === CHUA_RO ? "Chưa rõ NCC (thiếu trong hệ thống)" : o.ma === "HNH" ? "Hồng Ngọc Hà (HNH)" : o.ma,
    nganh: o.nganh === "Flight" || o.nganh === "Hotel" ? o.nganh : "Khác", payment_term: 0, partnership: null,
  }));
  if (moi.length) { const { error } = await sb.from("fin_suppliers").upsert(moi, { onConflict: "ma_ncc", ignoreDuplicates: true }); chk(error, "Thêm NCC vào danh mục"); }
  return { dong: rows.length, nccMoi: moi.map((m) => m.ma_ncc), tong: Math.round(rows.reduce((s, r) => s + r.so_tien, 0)) };
}
