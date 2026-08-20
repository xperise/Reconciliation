import { createClient } from '@supabase/supabase-js';

/**
 * Client dùng service_role — bỏ qua RLS.
 * CHỈ dùng trong workflow và API route chạy trên server.
 * Không bao giờ import file này vào Client Component.
 */
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
