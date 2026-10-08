// Chỉ dùng phía server (API route).
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { tabAccess } from "@/lib/access";

export const adminClient = supabaseAdmin;

/** Vai trò được upload dữ liệu và chốt hoa hồng */
export const EDIT_ROLES = ["admin", "ke_toan"];

/** Kiểm tra đăng nhập + quyền xem tab Dashboard. Trả về người dùng hoặc thông báo lỗi. */
export async function guard(needEdit = false): Promise<{ user: { id: string; email: string; role: string } } | { error: string; status: number }> {
  const user = await currentUser();
  if (!user) return { error: "Chưa đăng nhập", status: 401 };
  if (!tabAccess(user).dashboard) return { error: "Tài khoản không có quyền xem Dashboard", status: 403 };
  if (needEdit && !EDIT_ROLES.includes(user.role)) return { error: "Chỉ Quản trị và Kế toán được cập nhật dữ liệu dashboard", status: 403 };
  return { user };
}

/** Đọc toàn bộ bảng (PostgREST giới hạn 1000 dòng/lần → đọc theo trang) */
export async function fetchAll<T>(table: string, order?: string): Promise<T[]> {
  const sb = supabaseAdmin();
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = sb.from(table).select("*").range(from, from + page - 1);
    if (order) q = q.order(order, { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data || []) as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}

/* --------------------------------------------------------------------------
   Thêm khách hàng / nhà cung cấp mới vào danh mục khi người dùng thêm dòng trên web.
   Chỉ THÊM khi mã chưa có — không bao giờ sửa khách đã có (danh mục chuẩn vẫn đến từ
   file template; upload sheet DM_KHACH_HANG / DM_NCC sẽ ghi đè theo mã như thường lệ).
   Trả về số bản ghi vừa thêm (0 hoặc 1).
   -------------------------------------------------------------------------- */
const NHOM_KH = ["N1", "N2", "N3", "N4", "N5"];
const NGANH_NCC = ["Hotel", "Flight", "Mobility", "SaaS", "F&B", "Khác"];
const intOrNull = (v: unknown) => { const n = Math.round(Number(String(v ?? "").replace(",", "."))); return v === "" || v == null || !isFinite(n) ? null : n; };
const txt = (v: unknown) => String(v ?? "").trim().slice(0, 200) || null;

export async function ensureCustomer(ma: string, k?: Record<string, unknown>): Promise<number> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("fin_customers").select("ma_kh").eq("ma_kh", ma).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return 0;
  if (!k || !txt(k.ten_kh)) throw new Error(`Mã khách ${ma} chưa có trong danh mục — điền thêm tên khách và nhóm để thêm khách mới`);
  const nhom = String(k.nhom || "").trim().toUpperCase();
  if (!NHOM_KH.includes(nhom)) throw new Error(`Khách mới ${ma} cần chọn nhóm N1–N5`);
  const { error: e2 } = await sb.from("fin_customers").insert({
    ma_kh: ma, ten_kh: txt(k.ten_kh), ten_viet_tat: txt(k.ten_viet_tat) || txt(k.ten_kh), nhom,
    pm: txt(k.pm), sales: txt(k.sales), credit_term: intOrNull(k.credit_term), ghi_chu: "Thêm trên web",
    updated_at: new Date().toISOString(),
  });
  if (e2) throw new Error(e2.message);
  return 1;
}

export async function ensureSupplier(ma: string, k?: Record<string, unknown>): Promise<number> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("fin_suppliers").select("ma_ncc").eq("ma_ncc", ma).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return 0;
  if (!k || !txt(k.ten_ncc)) throw new Error(`Mã NCC ${ma} chưa có trong danh mục — điền thêm tên nhà cung cấp để thêm mới`);
  const nganh = NGANH_NCC.includes(String(k.nganh || "")) ? String(k.nganh) : "Khác";
  const { error: e2 } = await sb.from("fin_suppliers").insert({
    ma_ncc: ma, ten_ncc: txt(k.ten_ncc), nganh, payment_term: intOrNull(k.payment_term) ?? 30, partnership: txt(k.partnership),
    updated_at: new Date().toISOString(),
  });
  if (e2) throw new Error(e2.message);
  return 1;
}
