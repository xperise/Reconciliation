import { NextResponse } from "next/server";
import { adminClient, guard, ensureCustomer } from "@/lib/dashboard/server";

export const dynamic = "force-dynamic";

/* Nhập số thẳng trên dashboard (kế hoạch, GMV & giá vốn, GMV theo khách, chi phí, dòng tiền).
   Ghi vào fin_manual, tách khỏi các bảng dữ liệu file. Khi upload file của cùng kỳ,
   các ô nhập tay tương ứng bị xóa — số trong file ghi đè (xem api/dashboard/upload). */

type O = { nhom: string; ky: string; khoa: string; gia_tri?: string | number | null; ghi_chu?: string | null };
type Body = O | { rows: O[]; khach?: Record<string, unknown> };

const NHOM = new Set(["target", "gmv", "gmvkh", "opex", "cash"]);

function money(raw: unknown): number | null {
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = Number(String(raw).replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return isFinite(n) ? Math.round(n) : null;
}

export async function POST(req: Request) {
  try {
    const g = await guard(true);
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const b = (await req.json()) as Body;
    const list = "rows" in b ? b.rows : [b];
    if (!Array.isArray(list) || !list.length) return NextResponse.json({ error: "Không có dòng nào để lưu" }, { status: 400 });
    // GMV theo khách: khách chưa có trong danh mục thì thêm vào (cần tên + nhóm)
    let taoMoi = 0;
    const khach = "rows" in b ? b.khach : undefined;
    const maMoi = Array.from(new Set(list.filter((r) => r.nhom === "gmvkh" && r.gia_tri !== "" && r.gia_tri != null).map((r) => String(r.khoa || "").split("|")[0]).filter(Boolean)));
    for (const ma of maMoi) {
      try { taoMoi += await ensureCustomer(ma, khach && String(khach.ma_kh || "") === ma ? khach : undefined); }
      catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }); }
    }

    const sb = adminClient();
    const now = new Date().toISOString();
    const them: Record<string, unknown>[] = [];
    const xoa: O[] = [];

    for (const r of list) {
      const nhom = String(r.nhom || "").trim();
      const ky = String(r.ky || "").trim();
      const khoa = String(r.khoa || "").trim();
      if (!NHOM.has(nhom)) return NextResponse.json({ error: `Nhóm số liệu không hợp lệ: ${nhom}` }, { status: 400 });
      if (!ky || !khoa) return NextResponse.json({ error: "Thiếu kỳ hoặc khoản mục" }, { status: 400 });
      const re = nhom === "cash" ? /^T\d{2}\.\d{4}-H[12]$/ : /^T\d{2}\.\d{4}$/;
      if (!re.test(ky)) return NextResponse.json({ error: `Kỳ phải có dạng ${nhom === "cash" ? "T09.2026-H1" : "T09.2026"}` }, { status: 400 });
      const v = money(r.gia_tri);
      const note = r.ghi_chu == null ? null : String(r.ghi_chu).trim().slice(0, 300) || null;
      if (v == null && (!note || nhom === "gmvkh")) xoa.push({ nhom, ky, khoa });
      else them.push({ nhom, ky, khoa, gia_tri: v, ghi_chu: note, updated_by: g.user.email, updated_at: now });
    }

    for (const d of xoa) {
      const { error } = await sb.from("fin_manual").delete().eq("nhom", d.nhom).eq("ky", d.ky).eq("khoa", d.khoa);
      if (error) throw new Error(error.message);
    }
    if (them.length) {
      const { error } = await sb.from("fin_manual").upsert(them, { onConflict: "nhom,ky,khoa" });
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, luu: them.length, xoa: xoa.length, taoMoi });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
