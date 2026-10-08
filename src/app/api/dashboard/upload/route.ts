import { NextResponse } from "next/server";
import { adminClient, guard } from "@/lib/dashboard/server";
import { SHEET_BY_NAME } from "@/lib/dashboard/spec";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Val = string | number | null;
interface ChunkBody { action: "chunk"; sheet: string; rows: Record<string, Val>[]; first: boolean; kys?: string[] }
interface LogBody { action: "log"; fileName: string; summary: Record<string, unknown> }
const WITH_UPDATED_AT = new Set(["fin_params", "fin_customers", "fin_suppliers", "fin_staff", "fin_targets"]);
const KY = /^T\d{2}\.\d{4}$/, KY_HALF = /^T\d{2}\.\d{4}-H[12]$/;

/** Upload file thì số trong file GHI ĐÈ số nhập tay trên web của cùng phạm vi:
 *    GMV             → GMV nhập tay (số tổng theo dòng dịch vụ và theo khách) của các kỳ trong file
 *    KE_HOACH        → kế hoạch nhập tay của các kỳ trong file
 *    CHI_PHI         → chi phí nhập tay của các kỳ trong file
 *    DONG_TIEN       → dòng tiền nhập tay của cùng nửa tháng + cùng khoản mục
 *    CONG_NO_PHAI_THU / CONG_NO_PHAI_TRA → dòng sửa / thêm tay của các kỳ có trong file
 *  Trả về số ô / dòng nhập tay đã bị thay. */
async function overwriteManual(sb: ReturnType<typeof adminClient>, sheet: string, rows: Record<string, Val>[]): Promise<number> {
  const kys = Array.from(new Set(rows.map((r) => String(r.ky ?? "")).filter((k) => KY.test(k))));
  const del = async (q: PromiseLike<{ error: { message: string } | null; count: number | null }>) => {
    const { error, count } = await q;
    if (error) throw new Error(`Ghi đè số nhập tay: ${error.message}`);
    return count || 0;
  };
  switch (sheet) {
    case "GMV":
      return kys.length ? del(sb.from("fin_manual").delete({ count: "exact" }).in("nhom", ["gmv", "gmvkh"]).in("ky", kys)) : 0;
    case "KE_HOACH":
      return kys.length ? del(sb.from("fin_manual").delete({ count: "exact" }).eq("nhom", "target").in("ky", kys)) : 0;
    case "CHI_PHI":
      return kys.length ? del(sb.from("fin_manual").delete({ count: "exact" }).eq("nhom", "opex").in("ky", kys)) : 0;
    case "DONG_TIEN": {
      const by = new Map<string, string[]>();
      rows.forEach((r) => {
        const h = String(r.ky_nua_thang ?? ""), m = String(r.khoan_muc ?? "");
        if (!KY_HALF.test(h) || !m) return;
        const a = by.get(h) || []; a.push(`${m}|ke_hoach`, `${m}|thuc_hien`); by.set(h, a);
      });
      let n = 0;
      for (const [h, khoa] of Array.from(by.entries())) n += await del(sb.from("fin_manual").delete({ count: "exact" }).eq("nhom", "cash").eq("ky", h).in("khoa", khoa));
      return n;
    }
    case "CONG_NO_PHAI_THU":
      return kys.length ? del(sb.from("fin_ar_edit").delete({ count: "exact" }).in("ky", kys)) : 0;
    case "CONG_NO_PHAI_TRA":
      return kys.length ? del(sb.from("fin_ap_edit").delete({ count: "exact" }).in("ky", kys)) : 0;
    default:
      return 0;
  }
}

export async function POST(req: Request) {
  try {
    const g = await guard(true);
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const body = (await req.json()) as ChunkBody | LogBody;
    const sb = adminClient();
    if (body.action === "log") {
      const { error } = await sb.from("fin_uploads").insert({ file_name: body.fileName, summary: body.summary });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    const spec = SHEET_BY_NAME[body.sheet];
    if (!spec) return NextResponse.json({ error: `Sheet không hợp lệ: ${body.sheet}` }, { status: 400 });
    const fields = spec.cols.map((c) => c.f);
    const now = new Date().toISOString();
    const rows = (body.rows || []).map((r) => {
      const o: Record<string, Val> = {};
      fields.forEach((f) => { o[f] = r[f] ?? null; });
      if (WITH_UPDATED_AT.has(spec.table)) o.updated_at = now;
      return o;
    });
    if (body.first) {
      if (spec.mode === "replace_all") {
        const { error } = await sb.from(spec.table).delete().not(fields[0], "is", null);
        if (error) throw new Error(`Xóa dữ liệu cũ ${spec.table}: ${error.message}`);
      } else if (spec.mode === "replace_by_ky") {
        const kys = (body.kys || []).filter((k) => /^T\d{2}\.\d{4}$/.test(k));
        if (kys.length) {
          const { error } = await sb.from(spec.table).delete().in("ky", kys);
          if (error) throw new Error(`Xóa dữ liệu cũ ${spec.table}: ${error.message}`);
        }
      }
    }
    if (rows.length) {
      const q = spec.mode === "upsert" ? sb.from(spec.table).upsert(rows, { onConflict: spec.key.join(",") }) : sb.from(spec.table).insert(rows);
      const { error } = await q;
      if (error) throw new Error(`Ghi ${spec.sheet}: ${error.message}`);
    }
    // số trong file ghi đè số nhập tay cùng phạm vi (chạy theo từng phần, chỉ đụng các kỳ có trong phần này)
    const boTay = rows.length ? await overwriteManual(sb, spec.sheet, rows) : 0;
    return NextResponse.json({ ok: true, written: rows.length, boTay });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
