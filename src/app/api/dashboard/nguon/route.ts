import { NextResponse } from "next/server";
import { adminClient, guard, fetchAll } from "@/lib/dashboard/server";
import type { KhRow, NccRow, ArRow, DmRow } from "@/lib/dashboard/sources";
import { inferNcc, isBeDs } from "@/lib/dashboard/sources";
import { nccOfSrc, nccTen } from "@/lib/dashboard/alias";
import { kyEnd, addDays } from "@/lib/dashboard/util";
import { syncTravelToMaster, masterInfo } from "@/lib/dashboard/masterSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* Nạp file nguồn (bảng kê khách hàng, đối soát NCC, sổ công nợ phải thu) — xem supabase/migrations/30_dashboard_nguon.sql.
   Thứ tự client gửi: công nợ phải thu → bảng kê khách hàng → đối soát NCC → rebuild.
     kh      { loai, rows }               thay các giao dịch (mã giao dịch / số vé) có trong file, giữ phần còn lại
     ncc     { fileKey, fileName, rows }  thay các booking (mã booking / số vé) có trong file, giữ phần còn lại
     dm      { rows }                     danh mục khách: cập nhật tên, payment term; khách mới vào nhóm N1
     ar      { rows }                     thay các hóa đơn (khách + số hóa đơn) có trong file, giữ phần còn lại
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
      // Nạp lại: chỉ thay các giao dịch có trong file mới (cùng mã giao dịch / số vé), dòng khác của kỳ giữ nguyên.
      // Client chia lô theo mã giao dịch nên các dòng của một giao dịch luôn nằm cùng một lô.
      const rows = (b.rows || []).filter((r) => KY.test(r.ky) && r.ngay).map((r) => ({ ...r, loai: b.loai, file_name: b.fileName || null, uploaded_at: now }));
      const codes = Array.from(new Set(rows.map((r) => r.ma_gd).filter(Boolean) as string[]));
      const ves = Array.from(new Set(rows.filter((r) => !r.ma_gd && r.so_ve).map((r) => r.so_ve as string)));
      let thay = 0;
      for (let i = 0; i < codes.length; i += 200) { const r = await sb.from("fin_src_kh").delete({ count: "exact" }).eq("loai", b.loai).in("ma_gd", codes.slice(i, i + 200)); chk(r.error, "Thay giao dịch cũ"); thay += r.count || 0; }
      for (let i = 0; i < ves.length; i += 200) { const r = await sb.from("fin_src_kh").delete({ count: "exact" }).eq("loai", b.loai).is("ma_gd", null).in("so_ve", ves.slice(i, i + 200)); chk(r.error, "Thay giao dịch cũ"); thay += r.count || 0; }
      for (const r0 of rows.filter((r) => !r.ma_gd && !r.so_ve)) {
        let q = sb.from("fin_src_kh").delete({ count: "exact" }).eq("loai", b.loai).eq("ngay", r0.ngay).eq("gmv", r0.gmv).is("ma_gd", null).is("so_ve", null);
        q = r0.ten_cong_ty ? q.eq("ten_cong_ty", r0.ten_cong_ty) : q.is("ten_cong_ty", null);
        const r = await q; chk(r.error, "Thay giao dịch cũ"); thay += r.count || 0;
      }
      if (rows.length) {
        let { error } = await sb.from("fin_src_kh").insert(rows);
        // chưa chạy migration 35 (cột email): ghi không có email
        if (error && /email/.test(error.message)) ({ error } = await sb.from("fin_src_kh").insert(rows.map(({ email: _e, ...r }) => { void _e; return r; })));
        chk(error, "Ghi bảng kê");
      }
      return NextResponse.json({ ok: true, written: rows.length, thay });
    }

    if (b.action === "ncc") {
      if (!b.fileKey) return fail("Thiếu tên file đối soát");
      // Nạp lại: chỉ thay các booking có trong file mới (cùng mã booking / số vé, cùng loại nguồn), từ bất kỳ file nào
      const rows = (b.rows || []).map((r) => ({ ...r, file_key: b.fileKey, file_name: b.fileName || null, uploaded_at: now }));
      const ht = rows.filter((r) => (r.khop || "").startsWith("HT:")), ds = rows.filter((r) => !(r.khop || "").startsWith("HT:"));
      let thay = 0;
      const del = async (list: typeof rows, laHt: boolean, col: "ma_booking" | "so_ve") => {
        const vals = Array.from(new Set(list.map((r) => (col === "ma_booking" ? r.ma_booking : r.ma_booking ? null : r.so_ve)).filter(Boolean) as string[]));
        for (let i = 0; i < vals.length; i += 200) {
          const part = vals.slice(i, i + 200);
          if (laHt) { const r = await sb.from("fin_src_ncc").delete({ count: "exact" }).like("khop", "HT:%").in(col, part); chk(r.error, "Thay booking cũ"); thay += r.count || 0; }
          else {
            const r1 = await sb.from("fin_src_ncc").delete({ count: "exact" }).not("khop", "like", "HT:%").in(col, part); chk(r1.error, "Thay booking cũ");
            const r2 = await sb.from("fin_src_ncc").delete({ count: "exact" }).is("khop", null).in(col, part); chk(r2.error, "Thay booking cũ");
            thay += (r1.count || 0) + (r2.count || 0);
          }
        }
      };
      await del(ht, true, "ma_booking"); await del(ds, false, "ma_booking"); await del(ds, false, "so_ve");
      if (rows.length) { const { error } = await sb.from("fin_src_ncc").insert(rows); chk(error, "Ghi đối soát NCC"); }
      return NextResponse.json({ ok: true, written: rows.length, thay });
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
      // Nạp lại: chỉ thay các hóa đơn có trong file mới (cùng khách + số hóa đơn; dòng không số hóa đơn: cùng khách + kỳ).
      // Hóa đơn / kỳ không có trong file giữ nguyên. Client chia lô theo khách nên một khách luôn nằm cùng một lô.
      const rows = (b.rows || []).filter((r) => r.ma_kh && KY.test(r.ky) && r.ngay_den_han);
      const byKh = new Map<string, typeof rows>();
      rows.forEach((r) => { const a = byKh.get(r.ma_kh) || []; a.push(r); byKh.set(r.ma_kh, a); });
      let thay = 0, suaTay = 0;
      for (const [ma, list] of Array.from(byKh.entries())) {
        const hd = Array.from(new Set(list.map((r) => r.so_ct).filter(Boolean) as string[]));
        const kyKhongHd = Array.from(new Set(list.filter((r) => !r.so_ct).map((r) => r.ky)));
        const kys = Array.from(new Set(list.map((r) => r.ky)));
        for (let i = 0; i < hd.length; i += 200) { const r = await sb.from("fin_ar").delete({ count: "exact" }).eq("ma_kh", ma).in("so_ct", hd.slice(i, i + 200)); chk(r.error, "Thay hóa đơn cũ"); thay += r.count || 0; }
        if (kyKhongHd.length) { const r = await sb.from("fin_ar").delete({ count: "exact" }).eq("ma_kh", ma).in("ky", kyKhongHd).is("so_ct", null); chk(r.error, "Thay dòng cũ"); thay += r.count || 0; }
        // Số sửa tay của các kỳ có trong file (của khách này): file là số chuẩn cho tiền & ngày thu; giữ ngày gửi bảng kê, cờ đã gửi, ghi chú
        if (hd.length) { const r1 = await sb.from("fin_ar_edit").delete({ count: "exact" }).eq("ma_kh", ma).in("so_ct", hd); chk(r1.error, "Bỏ sửa tay theo hóa đơn"); suaTay += r1.count || 0; }
        const r0 = await sb.from("fin_ar_edit").delete({ count: "exact" }).eq("ma_kh", ma).in("ky", kys).eq("tu_tao", true); chk(r0.error, "Bỏ dòng thêm tay"); suaTay += r0.count || 0;
        const r2 = await sb.from("fin_ar_edit").update({ so_tien: null, da_thu: null, ngay_thu_du: null, ngay_thu_gan_nhat: null, ngay_den_han: null, ngay_hd: null, updated_at: now })
          .eq("ma_kh", ma).in("ky", kys).eq("so_ct", "").eq("tu_tao", false);
        chk(r2.error, "Bỏ số tiền sửa tay");
      }
      for (let i = 0; i < rows.length; i += 1000) { const { error } = await sb.from("fin_ar").insert(rows.slice(i, i + 1000).map((r) => ({ ...r, ngay_gui_bk: null }))); chk(error, "Ghi công nợ phải thu"); }
      return NextResponse.json({ ok: true, written: rows.length, thay, suaTay });
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
  // Bảng kê Be và đối soát Be không đưa vào dashboard: xóa khỏi dữ liệu đã nạp
  {
    const { error } = await sb.from("fin_src_kh").delete().eq("loai", "transport"); chk(error, "Bỏ bảng kê Be");
    const byFile = new Map<string, Ncc[]>();
    ncc.forEach((n) => { const k = (n as Ncc & { file_key?: string }).file_key || ""; const a = byFile.get(k) || []; a.push(n); byFile.set(k, a); });
    const beKeys = Array.from(byFile.entries()).filter(([k, rows]) => k && !k.startsWith("ht_") && isBeDs(rows)).map(([k]) => k);
    if (beKeys.length) { const r = await sb.from("fin_src_ncc").delete().in("file_key", beKeys); chk(r.error, "Bỏ đối soát Be"); }
    const beSet = new Set(beKeys);
    for (let i = ncc.length - 1; i >= 0; i--) if (beSet.has((ncc[i] as Ncc & { file_key?: string }).file_key || "")) ncc.splice(i, 1);
    for (let i = kh.length - 1; i >= 0; i--) if (kh[i].loai === "transport") kh.splice(i, 1);
    // File B1 không dùng nữa (trùng với Performance Dashboard): xóa dòng B1 đã nạp
    if (ncc.some((n) => (n.khop || "").startsWith("B1:"))) {
      const r = await sb.from("fin_src_ncc").delete().like("khop", "B1:%"); chk(r.error, "Bỏ file B1");
      for (let i = ncc.length - 1; i >= 0; i--) if ((ncc[i].khop || "").startsWith("B1:")) ncc.splice(i, 1);
    }
  }
  // Cùng một booking có trong nhiều file đã nạp (vd. Performance Dashboard xuất hai lần với khoảng ngày chồng nhau,
  // hai file đối soát cùng NCC chồng kỳ): chỉ lấy dòng của file nạp sau cùng, tránh cộng giá vốn / phải trả hai lần
  let trungFile = 0;
  {
    type R = Ncc & { file_key?: string; uploaded_at?: string };
    const nhom = (n: R) => ((n.khop || "").startsWith("HT:") ? "HT|" + (n.nganh || "") : "DS|" + String(n.ncc || "").replace(/^(hotel|flight):/, ""));
    const khoa = (n: R) => nhom(n) + "|" + nk(n.ma_booking) + "|" + nk(n.so_ve);
    const latest = new Map<string, { file: string; at: string }>();
    (ncc as R[]).forEach((n) => {
      if (!n.ma_booking && !n.so_ve) return;
      const k = khoa(n), f = n.file_key || "", at = n.uploaded_at || "", o = latest.get(k);
      if (!o || at > o.at) latest.set(k, { file: f, at });
    });
    for (let i = ncc.length - 1; i >= 0; i--) {
      const n = ncc[i] as R;
      if (!n.ma_booking && !n.so_ve) continue;
      const o = latest.get(khoa(n));
      if (o && o.file !== (n.file_key || "")) { ncc.splice(i, 1); trungFile++; }
    }
  }
  // Dòng đối soát chưa có NCC, hoặc hệ thống ghi "XPERISE:<mã>" mà nằm trên bảng kê NCC khác: gán NCC của bảng kê đó, lưu lại vào bảng
  const inf = inferNcc(ncc.filter((n) => !(n.khop || "").startsWith("HT:") && !(n.khop || "").startsWith("B1:")), (n) => (n as Ncc & { file_key?: string }).file_key || "");
  const nccSuy = new Map<string, number[]>();
  inf.forEach((v, n) => { n.ncc = v; n.nganh = v.startsWith("hotel:") ? "Hotel" : v.startsWith("flight:") ? "Flight" : n.nganh; const a = nccSuy.get(v) || []; a.push(n.id); nccSuy.set(v, a); });
  for (const [v, ids] of Array.from(nccSuy.entries())) {
    for (let i = 0; i < ids.length; i += 500) {
      const { error } = await sb.from("fin_src_ncc").update({ ncc: v, nganh: v.startsWith("hotel:") ? "Hotel" : v.startsWith("flight:") ? "Flight" : null }).in("id", ids.slice(i, i + 500));
      chk(error, "Gán NCC cho dòng thiếu trong hệ thống");
    }
  }
  if (!kh.length) return { ok: true, kys: [], rows: 0, note: "Chưa có bảng kê khách hàng nào" };

  /* --- tên gọi khác (Master Data + mặc định): chỉ dùng cho tên công ty trên bảng kê; sổ phải thu nhận khách theo tên đầy đủ pháp nhân --- */
  const { alias } = await masterInfo(cust.map((c) => ({ ma_kh: c.ma_kh, ten_kh: c.ten_kh, ten_viet_tat: c.ten_viet_tat, nhom: "N1", pm: null })));
  {
    // nhiều mã cùng tên đầy đủ: đổi đích về mã đang có công nợ phải thu
    const coAr = new Set(ar.map((r) => r.ma_kh)), tenOf = new Map(cust.map((c) => [c.ma_kh, nk(c.ten_kh)]));
    Object.keys(alias).forEach((k) => {
      const t = alias[k]; if (coAr.has(t)) return;
      const alt = cust.find((c) => tenOf.get(c.ma_kh) === tenOf.get(t) && coAr.has(c.ma_kh));
      if (alt) alias[k] = alt.ma_kh;
    });
  }
  const gop: { tu: string; ve: string }[] = [];

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
  // Dòng không có tên công ty: nhận khách theo tên miền email người đặt (đa số các dòng cùng tên miền đã nhận được khách)
  const DOM_CHUNG = /^(gmail|yahoo|hotmail|outlook|icloud|live|msn|xperise|uts)\./i;
  const domOf = (r: Kh) => { const m = /@([^@\s>]+)$/.exec(String(r.email || "").trim()); return m && !DOM_CHUNG.test(m[1]) ? m[1].toLowerCase() : null; };
  const domVote = new Map<string, Map<string, number>>();
  const khBase = (r: Kh): string | null => {
    const viaHd = byHd.get(hdKey(r.so_hd));
    if (viaHd) return viaHd;
    const k = nk(r.ten_cong_ty);
    if (!k) return null;
    return alias[k] || byCompany.get(k) || byName.get(k) || null;
  };
  kh.forEach((r) => { const d = domOf(r), m = khBase(r); if (!d || !m) return; const v = domVote.get(d) || new Map<string, number>(); v.set(m, (v.get(m) || 0) + Math.abs(gmvOf(r))); domVote.set(d, v); });
  const byDomain = new Map<string, string>();
  domVote.forEach((v, d) => byDomain.set(d, Array.from(v.entries()).sort((a, b) => b[1] - a[1])[0][0]));
  const khOf = (r: Kh) => {
    if (!nk(r.ten_cong_ty)) { const d = domOf(r); if (d && byDomain.has(d)) return byDomain.get(d) as string; }
    const viaHd = byHd.get(hdKey(r.so_hd));
    if (viaHd) return viaHd;
    const k = nk(r.ten_cong_ty);
    if (alias[k]) return alias[k];
    const m = byCompany.get(k) || byName.get(k);
    if (m) return m;
    const ten = (r.ten_cong_ty || (domOf(r) ? `CHƯA RÕ (@${domOf(r)})` : "CHƯA RÕ")).trim().toUpperCase();
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
  const kyStmt = new Map<number, string>();
  const srcOf = new Map<number, number>();
  let htHit = 0, htMiss = 0;
  const htUsed = new Set<number>(), htAmt = new Map<number, number>();
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
    // kỳ của dòng NCC = kỳ ngày giao dịch trên bảng kê của booking đó (ngày dịch vụ trong đối soát là ngày check-in)
    const main = rs.slice().sort((x, y) => Math.abs(gmvOf(y)) - Math.abs(gmvOf(x)))[0];
    if (main && main.ky !== n.ky) kyStmt.set(n.id, main.ky);
    if (t === 2) htHit++; else nccHit++;
    if (t === 2) htUsed.add(n.id);
    // Booking đã hủy trên hệ thống: giá vốn theo phần khách vẫn bị thu trên bảng kê (hoàn hết thì 0)
    let bkAmt = n.bang_ke;
    if (t === 2 && /cancel/i.test(n.xu_ly || "")) {
      const net = rs.reduce((s, r) => s + gmvOf(r), 0), sold = Number(n.ledger || 0);
      bkAmt = sold > 0 ? n.bang_ke * Math.max(0, Math.min(1, net / sold)) : 0;
    }
    if (t === 2) htAmt.set(n.id, bkAmt);
    // chia giá vốn theo tỷ trọng GMV (có dấu: dòng hoàn vé / hủy phòng nhận phần âm)
    // Booking có dòng bán + dòng hủy/hoàn (tổng GMV ~ 0, có khi nằm ở hai kỳ): giá vốn NCC còn tính chỉ chia cho
    // các dòng bán (GMV dương), không chia cho dòng hoàn — tránh dòng hoàn âm GMV mà lại nhận giá vốn dương
    const tot = rs.reduce((s, r) => s + gmvOf(r), 0), totAbs = rs.reduce((s, r) => s + Math.abs(gmvOf(r)), 0);
    const pos = rs.filter((r) => gmvOf(r) > 0), totPos = pos.reduce((s, r) => s + gmvOf(r), 0);
    const nearZero = totAbs > 0 && Math.abs(tot) < 0.05 * totAbs;
    rs.forEach((r) => {
      const bk = bkAmt;
      const part = nearZero ? (totPos > 0 ? (gmvOf(r) > 0 ? bk * gmvOf(r) / totPos : 0) : bk * Math.abs(gmvOf(r)) / totAbs)
        : tot !== 0 ? bk * gmvOf(r) / tot : totAbs > 0 ? bk * Math.abs(gmvOf(r)) / totAbs : bk / rs.length;
      gv.set(r.id, (gv.get(r.id) || 0) + part);
      // NCC: B1 → Xperise_Manual; tên gọi khác / XPERISE:<mã> → NCC tổng hợp (HNH_Manual, Xperise_Manual)
      if (!nccOf.has(r.id) && (n.ncc || t === 1)) nccOf.set(r.id, nccOfSrc(supAll, n));
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

  // lưu kỳ theo bảng kê vào dòng đối soát (thẻ phải trả phát sinh, file master data dùng kỳ này)
  {
    const byKy = new Map<string, number[]>();
    ncc.forEach((n) => { const k = kyStmt.get(n.id); if (k) { n.ky = k; const a = byKy.get(k) || []; a.push(n.id); byKy.set(k, a); } });
    for (const [k, ids] of Array.from(byKy.entries())) for (let i = 0; i < ids.length; i += 500) { const { error } = await sb.from("fin_src_ncc").update({ ky: k }).in("id", ids.slice(i, i + 500)); chk(error, "Cập nhật kỳ theo bảng kê"); }
  }
  const ap = await rebuildAP(sb, ncc, htUsed, htAmt);

  return {
    ok: true, kys: kys.sort(), rows: rows.length, ap,
    gmv: Math.round(gmvAll), gmvCoGv: Math.round(gmvCov),
    ncc: { noi: nccHit, khongNoi: nccMiss, khongNoiTien: Math.round(nccMissAmt) },
    gopKhach: gop.map((g) => `${g.tu} → ${g.ve}`),
    ht: { noi: htHit, khongNoi: htMiss },
    trungFile,
    theoNguon: Object.fromEntries(Object.entries(theoNguon).map(([k, v]) => [k, Math.round(v)])),
    khachChuaMap: Array.from(chuaMap.entries()).sort((a, b) => b[1] - a[1]).map(([ten, v]) => ({ ten, gmv: Math.round(v) })),
  };
}

/* --------------------------------------------------------------------------
   Công nợ phải trả dựng từ file nguồn — mỗi NCC × kỳ dịch vụ một dòng trong fin_ap (so_ct "DS <kỳ>"):
   · Phải trả = tổng cột "Bảng kê" (số NCC tính) của các file đối soát NCC, bỏ dòng "Trùng".
   · Khách sạn lẻ (Xperise_Manual): giá NCC trên hệ thống (Performance Dashboard, NCC XPERISE) của các booking có trên
     bảng kê mà chưa có trong file đối soát nào. File B1 không dùng nữa (trùng booking với Performance Dashboard).
   · Giá NCC trên hệ thống của NCC khác không tính (đã có file đối soát của NCC đó).
   · Ngày ghi nhận = ngày cuối kỳ dịch vụ; đến hạn = ngày cuối kỳ + payment term trong danh mục NCC (chưa có = 0).
   · Đã trả của các NCC khác: kế toán nhập ở bảng "Phải trả & đã trả" (tab Công nợ) — lưu ở fin_ap_edit nên dựng lại không mất.
   -------------------------------------------------------------------------- */
const CHUA_RO = "CHUA_RO_NCC";
async function rebuildAP(sb: Sb, ncc: Ncc[], htUsed: Set<number>, htAmt: Map<number, number>) {
  const supList = await fetchAll<{ ma_ncc: string; ten_ncc: string; payment_term: number | null }>("fin_suppliers");
  const sup = new Map(supList.map((s) => [s.ma_ncc, s]));
  const agg = new Map<string, { ma: string; ky: string; nganh: string; tien: number; tra: number; ngayTra: string | null; b1: boolean }>();
  ncc.forEach((n) => {
    const k = n.khop || "";
    // Giá NCC trên hệ thống: chỉ tính phải trả cho khách sạn lẻ (NCC XPERISE → Xperise_Manual), và chỉ những booking
    // đã dùng làm giá vốn của dòng bảng kê (booking có trên bảng kê, chưa có trong file đối soát nào)
    const ht = k.startsWith("HT:");
    if (ht && !(htUsed.has(n.id) && nccOfSrc(supList, n) === "XPERISE_MANUAL")) return;
    if (k.startsWith("Trùng") || n.bang_ke == null || !n.ky || !KY.test(n.ky)) return;
    const b1 = k.startsWith("B1:");
    // tên gọi khác của NCC (vd. HNH = Hồng Ngọc Hà) gộp về mã NCC tổng hợp; B1 / XPERISE:<mã> → Xperise_Manual
    const ma = n.ncc || b1 ? nccOfSrc(supList, n) : CHUA_RO;
    const key = `${ma}|${n.ky}`;
    const o = agg.get(key) || { ma, ky: n.ky, nganh: n.nganh || "Khác", tien: 0, tra: 0, ngayTra: null, b1: false };
    if (b1) o.b1 = true;
    o.tien += ht ? htAmt.get(n.id) ?? n.bang_ke : n.bang_ke;
    if (b1 && k === "B1: Đã chi") {
      o.tra += n.bang_ke;
      const d = /chi (\d{4}-\d{2}-\d{2})/.exec(n.mo_ta || "")?.[1] || null;
      if (d && (!o.ngayTra || d > o.ngayTra)) o.ngayTra = d;
    }
    agg.set(key, o);
  });
  const rows = Array.from(agg.values()).map((o) => {
    const end = kyEnd(o.ky), term = Number(sup.get(o.ma)?.payment_term ?? 0) || 0;
    const b1 = o.b1;
    return { ma_ncc: o.ma, ky: o.ky, so_ct: `DS ${o.ky}`, ngay_hd: end, ngay_den_han: addDays(end, term), so_tien: Math.round(o.tien),
      da_tra: b1 ? Math.round(o.tra) : null, ngay_tra: b1 && o.tra > 0 ? o.ngayTra : null };
  });
  const { error: e1 } = await sb.from("fin_ap").delete().like("so_ct", "DS %");
  chk(e1, "Xóa phải trả dựng từ đối soát cũ");
  for (let i = 0; i < rows.length; i += 1000) { const { error } = await sb.from("fin_ap").insert(rows.slice(i, i + 1000)); chk(error, "Ghi công nợ phải trả"); }
  // NCC chưa có trong danh mục: thêm với payment term 0 (sửa ở danh mục NCC)
  const moi = Array.from(new Map(Array.from(agg.values()).filter((o) => !sup.has(o.ma)).map((o) => [o.ma, o])).values()).map((o) => ({
    ma_ncc: o.ma, ten_ncc: nccTen(o.ma) || (o.ma === CHUA_RO ? "Chưa rõ NCC (thiếu trong hệ thống)" : o.ma),
    nganh: o.nganh === "Flight" || o.nganh === "Hotel" ? o.nganh : "Khác", payment_term: 0, partnership: null,
  }));
  if (moi.length) { const { error } = await sb.from("fin_suppliers").upsert(moi, { onConflict: "ma_ncc", ignoreDuplicates: true }); chk(error, "Thêm NCC vào danh mục"); }
  return { dong: rows.length, nccMoi: moi.map((m) => m.ma_ncc), tong: Math.round(rows.reduce((s, r) => s + r.so_tien, 0)) };
}
