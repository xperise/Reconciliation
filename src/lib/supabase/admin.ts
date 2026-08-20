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
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Next.js cache mọi fetch() theo mặc định, kể cả trên route động.
        // Dữ liệu vận hành thay đổi liên tục nên phải đọc thẳng từ database,
        // không thì trang hiện lại ảnh chụp cũ của bảng.
        fetch: (url, options = {}) =>
          fetch(url, { ...options, cache: 'no-store' }),
      },
    },
  );
}
