// Ghi nhớ "tên trên file → khách master data" (bảng mlx_alias)
import { getSupabase } from './supabase';
import { companyKey } from './normalize';

export type Alias = { alias_key: string; alias_text: string; customer_id: string };
const missing = (m: string) => /mlx_alias|does not exist|schema cache|PGRST205|42P01/i.test(m);
export const ALIAS_MIGRATE = 'Chưa có bảng ghi nhớ tên khách — chạy supabase/migrations/28_mlx_alias.sql trong SQL Editor của Supabase.';

/** Khoá ghi nhớ: tên đã chuẩn hoá, bỏ mã đứng đầu kiểu "C493 - " */
export const aliasKey = (name: string | null | undefined) => companyKey(String(name ?? '').replace(/^\s*[A-Za-z0-9]{2,12}\s*[-–_]\s*/, '').trim() || String(name ?? ''));

export async function loadAliases(): Promise<Alias[]> {
  const out: Alias[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await getSupabase().from('mlx_alias').select('alias_key,alias_text,customer_id').range(from, from + 999);
    if (error) throw new Error(missing(error.message) ? ALIAS_MIGRATE : error.message);
    out.push(...((data ?? []) as Alias[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function saveAlias(name: string, customerId: string): Promise<Alias | null> {
  const k = aliasKey(name); if (!k || !customerId) return null;
  const row = { alias_key: k, alias_text: name.trim(), customer_id: customerId };
  const { error } = await getSupabase().from('mlx_alias').upsert(row, { onConflict: 'alias_key' });
  if (error) throw new Error(missing(error.message) ? ALIAS_MIGRATE : error.message);
  return row;
}
