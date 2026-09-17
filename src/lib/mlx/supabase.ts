// Client Supabase phía trình duyệt cho module MLX.
// Nếu repo đã có helper (vd: src/lib/supabase/client.ts) thì đổi import sang helper đó cho đồng bộ session.
import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabase() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
