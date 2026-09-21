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
