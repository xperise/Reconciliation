import { NextResponse } from "next/server";
import { adminClient, guard, ensureCustomer, ensureSupplier } from "@/lib/dashboard/server";

export const dynamic = "force-dynamic";

/* Sửa / thêm công nợ trực tiếp trên web.
   Ghi vào fin_ar_edit / fin_ap_edit, tách khỏi fin_ar / fin_ap (hai bảng này bị thay
   toàn bộ mỗi lần upload file). Khi upload file sổ công nợ, các dòng sửa tay của
   những kỳ có trong file bị xóa — số trong file ghi đè (xem api/dashboard/upload).
   Dòng thêm mới có thể kèm khách / NCC mới: chỉ thêm vào danh mục khi mã chưa có. */

type Body = {
  loai: "ar" | "ap";
  ma: string;                 // mã KH hoặc mã NCC
  ky: string;
  so_ct?: string;
  tu_tao?: boolean;
  xoa?: boolean;
  reset?: boolean;            // bỏ phần sửa tay, quay về số trong file
  fields?: Record<string, string | number | null>;
  khach?: Record<string, unknown>;   // khách mới (chỉ dùng khi mã chưa có trong danh mục)
  ncc?: Record<string, unknown>;     // nhà cung cấp mới
};

const AR_FIELDS = ["ngay_gui_bk", "ngay_hd", "ngay_den_han", "so_tien", "da_thu", "ngay_thu_du", "ngay_thu_gan_nhat", "ghi_chu"];
const AP_FIELDS = ["ngay_hd", "ngay_den_han", "so_tien", "da_tra", "ngay_tra", "ghi_chu"];
const MONEY = new Set(["so_tien", "da_thu", "da_tra"]);
const DATE = new Set(["ngay_gui_bk", "ngay_hd", "ngay_den_han", "ngay_thu_du", "ngay_thu_gan_nhat", "ngay_tra"]);

function clean(fields: Record<string, string | number | null>, allowed: string[]) {
  const out: Record<string, string | number | null> = {};
  for (const f of allowed) {
    if (!(f in fields)) continue;
    const raw = fields[f];
    if (raw === "" || raw === null || raw === undefined) { out[f] = null; continue; }
    if (MONEY.has(f)) {
      const n = Math.round(Number(String(raw).replace(/[.,\s]/g, (m) => (m === "," ? "." : ""))));
      out[f] = isFinite(n) ? n : null;
    } else if (DATE.has(f)) {
      const s = String(raw);
      out[f] = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    } else {
      out[f] = String(raw).trim().slice(0, 500) || null;
    }
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const g = await guard(true);
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const b = (await req.json()) as Body;
    if (b.loai !== "ar" && b.loai !== "ap") return NextResponse.json({ error: "Loại không hợp lệ" }, { status: 400 });
    if (!b.ma?.trim()) return NextResponse.json({ error: "Thiếu mã khách hàng / nhà cung cấp" }, { status: 400 });
    const isAr = b.loai === "ar";
    if (isAr && !/^T\d{2}\.\d{4}$/.test(b.ky || "")) return NextResponse.json({ error: "Kỳ phải có dạng T09.2026" }, { status: 400 });

    const table = isAr ? "fin_ar_edit" : "fin_ap_edit";
    const idCol = isAr ? "ma_kh" : "ma_ncc";
    const ma = b.ma.trim();
    const ky = (b.ky || "").trim();
    const so_ct = (b.so_ct || "").trim();
    const sb = adminClient();

    if (b.reset) {
      const { error } = await sb.from(table).delete().eq(idCol, ma).eq("ky", ky).eq("so_ct", so_ct);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, reset: true });
    }

    const fields = clean(b.fields || {}, isAr ? AR_FIELDS : AP_FIELDS);
    let taoMoi = 0;
    if (b.tu_tao) {
      if (fields.so_tien == null) return NextResponse.json({ error: "Dòng mới phải có số tiền" }, { status: 400 });
      if (fields.ngay_den_han == null) return NextResponse.json({ error: "Dòng mới phải có ngày đến hạn" }, { status: 400 });
      if (!isAr && fields.ngay_hd == null) return NextResponse.json({ error: "Dòng phải trả mới phải có ngày hóa đơn" }, { status: 400 });
      // khách / NCC chưa có trong danh mục → thêm vào, nếu không đủ thông tin thì báo lỗi trước khi ghi công nợ
      try { taoMoi = isAr ? await ensureCustomer(ma, b.khach) : await ensureSupplier(ma, b.ncc); }
      catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }); }
    }

    const row = { [idCol]: ma, ky, so_ct, ...fields, tu_tao: !!b.tu_tao, xoa: !!b.xoa, updated_by: g.user.email, updated_at: new Date().toISOString() };
    const { error } = await sb.from(table).upsert(row, { onConflict: `${idCol},ky,so_ct` });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, taoMoi: taoMoi ? (isAr ? "khách " + ma : "NCC " + ma) : null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
