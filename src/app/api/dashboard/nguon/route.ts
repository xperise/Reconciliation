import { NextResponse } from "next/server";
import { adminClient, guard, fetchAll } from "@/lib/dashboard/server";
import type { KhRow, NccRow, ArRow, DmRow } from "@/lib/dashboard/sources";

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
  | { action: "kh"; loai: "hotel" | "flight"; kys: string[]; rows: KhRow[]; first: boolean; fileName?: string }
  | { action: "ncc"; fileKey: string; fileName?: string; rows: NccRow[]; first: boolean }
  | { action: "dm"; rows: DmRow[] }
  | { action: "ar"; kys: string[]; rows: ArRow[]; first: boolean }
  | { action: "rebuild" };

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
      if (b.loai !== "hotel" && b.loai !== "flight") return fail("Loại bảng kê không hợp lệ");
      const kys = (b.kys || []).filter((k) => KY.test(k));
      if (b.first && kys.length) { const { error } = await sb.from("fin_src_kh").delete().eq("loai", b.loai).in("ky", kys); chk(error, "Xóa bảng kê cũ"); }
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
      return NextResponse.json({ ok: true, written: rows.length, moi });
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
          const r3 = await sb.from("fin_ar_edit").delete({ count: "exact" }).in("ky", kys).eq("so_ct", "").eq("tu_tao", false).eq("xoa", false).is("ngay_gui_bk", null).is("ghi_chu", null);
          chk(r3.error, "Dọn dòng sửa tay rỗng"); suaTay += r3.count || 0;
        }
      }
      const rows = (b.rows || []).filter((r) => r.ma_kh && KY.test(r.ky) && r.ngay_den_han);
      for (let i = 0; i < rows.length; i += 1000) { const { error } = await sb.from("fin_ar").insert(rows.slice(i, i + 1000).map((r) => ({ ...r, ngay_gui_bk: null }))); chk(error, "Ghi công nợ phải thu"); }
      return NextResponse.json({ ok: true, written: rows.length, suaTay });
    }

    if (b.action === "rebuild") return NextResponse.json(await rebuild(sb));
    return fail("Thao tác không hợp lệ");
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (missing(m)) return fail("Chưa tạo bảng nạp file nguồn — chạy supabase/migrations/30_dashboard_nguon.sql trong Supabase SQL Editor rồi nạp lại. (" + m + ")", 500);
    return fail(m, 500);
  }
}

/* --------------------------------------------------------------------------
   Dựng lại GMV & giá vốn theo ngày từ bảng kê khách hàng + đối soát NCC.
   · Khách hàng: theo số hóa đơn trong sổ phải thu → tên công ty (đa số các dòng cùng công ty đã nối được
     hóa đơn) → tên viết tắt / tên trong danh mục → giữ nguyên tên công ty (báo lại để bổ sung danh mục).
   · Giá vốn: dòng đối soát NCC (bỏ dòng "Trùng") nối với dòng bảng kê bằng mã booking (hotel: mã giao dịch;
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
/** GMV = Tổng thành tiền (sau chiết khấu, có phí dịch vụ); dòng không có thì lấy Thành tiền */
const gmvOf = (r: KhRow) => (r.tong_tt != null ? Number(r.tong_tt) : Number(r.gmv));

async function rebuild(sb: Sb) {
  const [kh, ncc, ar, cust] = await Promise.all([
    fetchAll<Kh>("fin_src_kh", "id"), fetchAll<Ncc>("fin_src_ncc", "id"),
    fetchAll<{ ma_kh: string; so_ct: string | null }>("fin_ar", "id"), fetchAll<{ ma_kh: string; ten_kh: string; ten_viet_tat: string | null }>("fin_customers"),
  ]);
  if (!kh.length) return { ok: true, kys: [], rows: 0, note: "Chưa có bảng kê khách hàng nào" };

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
    else { put("F|" + nk(r.ma_gd), r); put("F|" + nk(r.ma_gd2), r); if (r.so_ve && !/^temp_/i.test(r.so_ve)) put("V|" + nk(r.so_ve), r); }
  });
  const gv = new Map<number, number>(), nccOf = new Map<number, string>();
  let nccHit = 0, nccMiss = 0, nccMissAmt = 0;
  ncc.forEach((n) => {
    if (n.khop?.startsWith("Trùng") || n.bang_ke == null) return;
    const flight = n.nganh === "Flight" || n.ncc?.startsWith("flight:");
    const hits = new Set<Kh>();
    if (flight) { (idx.get("F|" + nk(n.ma_booking)) || []).forEach((r) => hits.add(r)); if (n.so_ve) (idx.get("V|" + nk(n.so_ve)) || []).forEach((r) => hits.add(r)); }
    else {
      (idx.get("H|" + nk(n.ma_booking)) || []).forEach((r) => hits.add(r));
      if (!hits.size && tokKey(n.ma_booking).includes("|")) (idx.get("T|" + tokKey(n.ma_booking)) || []).forEach((r) => hits.add(r));
    }
    const rs = Array.from(hits);
    if (!rs.length) { nccMiss++; nccMissAmt += n.bang_ke; return; }
    nccHit++;
    // chia giá vốn theo tỷ trọng GMV (có dấu: dòng hoàn vé / hủy phòng nhận phần âm)
    const tot = rs.reduce((s, r) => s + gmvOf(r), 0), totAbs = rs.reduce((s, r) => s + Math.abs(gmvOf(r)), 0);
    rs.forEach((r) => {
      const bk = n.bang_ke as number;
      const part = tot !== 0 ? bk * gmvOf(r) / tot : totAbs > 0 ? bk * Math.abs(gmvOf(r)) / totAbs : bk / rs.length;
      gv.set(r.id, (gv.get(r.id) || 0) + part);
      if (!nccOf.has(r.id) && n.ncc) nccOf.set(r.id, n.ncc.replace(/^(hotel|flight):/, ""));
    });
  });

  /* --- gộp theo ngày × khách × NCC × dịch vụ --- */
  const kys = Array.from(new Set(kh.map((r) => r.ky)));
  const agg = new Map<string, { ky: string; ngay: string; ma_kh: string; ma_ncc: string | null; dich_vu: string; gmv: number; gia_von: number; gmv_co_gv: number }>();
  let gmvAll = 0, gmvCov = 0;
  kh.forEach((r) => {
    const ma = khOf(r), n = nccOf.get(r.id) || null, dv = r.loai === "hotel" ? "Hotel" : "Flight";
    const key = `${r.ky}|${r.ngay}|${ma}|${n || ""}|${dv}`;
    const o = agg.get(key) || { ky: r.ky, ngay: r.ngay, ma_kh: ma, ma_ncc: n, dich_vu: dv, gmv: 0, gia_von: 0, gmv_co_gv: 0 };
    const G = gmvOf(r);
    o.gmv += G; gmvAll += G;
    if (gv.has(r.id)) { o.gia_von += gv.get(r.id) as number; o.gmv_co_gv += G; gmvCov += G; }
    agg.set(key, o);
  });
  const rows = Array.from(agg.values()).map((o) => ({ ...o, gmv: Math.round(o.gmv), gia_von: Math.round(o.gia_von), gmv_co_gv: Math.round(o.gmv_co_gv), chiet_khau: null, nguon: "bk" }));

  const { error: e1 } = await sb.from("fin_gmv").delete().in("ky", kys).in("dich_vu", ["Hotel", "Flight"]);
  chk(e1, "Xóa GMV Hotel/Flight cũ");
  for (let i = 0; i < rows.length; i += 1000) { const { error } = await sb.from("fin_gmv").insert(rows.slice(i, i + 1000)); chk(error, "Ghi GMV theo ngày"); }

  return {
    ok: true, kys: kys.sort(), rows: rows.length,
    gmv: Math.round(gmvAll), gmvCoGv: Math.round(gmvCov),
    ncc: { noi: nccHit, khongNoi: nccMiss, khongNoiTien: Math.round(nccMissAmt) },
    khachChuaMap: Array.from(chuaMap.entries()).sort((a, b) => b[1] - a[1]).map(([ten, v]) => ({ ten, gmv: Math.round(v) })),
  };
}
