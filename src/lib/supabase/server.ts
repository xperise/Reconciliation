import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Client gắn với phiên đăng nhập của người dùng — chịu ràng buộc RLS. */
export function supabaseServer() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: ((list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Gọi từ Server Component — middleware đã lo việc làm mới cookie.
          }
        }) satisfies SetAllCookies,
      },
    },
  );
}

/** Người dùng hiện tại kèm vai trò, hoặc null nếu chưa đăng nhập. */
export async function currentUser() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data: profile } = await sb
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile?.is_active) return null;
  return profile;
}
