import { getSupabase } from './supabase';

export const BUCKET = 'mlx-bang-ke';
const TABLE = 'mlx_statements';

export interface StatementRecord {
  id: string;
  customer_id: string | null;
  ten_cong_ty: string;
  ten_viet_tat: string;
  ky: string;
  file_name: string;
  storage_path: string;
  source_file_name: string;
  source_hash: string;
  row_count: number;
  total_amount: number;
  payable_amount: number;
  created_by_email: string | null;
  created_at: string;
}

export interface PeriodSummary {
  ky: string;
  file_count: number;
  customer_count: number;
  row_count: number;
  total_amount: number;
  payable_amount: number;
  last_created_at: string;
}

export class HistoryNotReadyError extends Error {}

function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /does not exist|schema cache|bucket not found/i.test(error.message)
  ) {
    throw new HistoryNotReadyError(
      'Chưa có bảng/bucket lịch sử. Chạy file supabase/migrations/12_mlx_statements.sql trong SQL Editor.',
    );
  }
  throw new Error(error.message);
}

const num = (v: unknown) => Number(v ?? 0);
const toRecord = (r: Record<string, unknown>): StatementRecord => ({
  ...(r as unknown as StatementRecord),
  row_count: num(r.row_count),
  total_amount: num(r.total_amount),
  payable_amount: num(r.payable_amount),
});

/** SHA-256 của nội dung file raw — dùng nhận diện file đã xử lý */
export async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Lấy các bản ghi có liên quan tới lô upload hiện tại (cùng hash hoặc cùng kỳ) */
export async function findRelated(hashes: string[], kys: string[]): Promise<StatementRecord[]> {
  const sb = getSupabase();
  const cols = 'id, customer_id, ten_cong_ty, ten_viet_tat, ky, file_name, storage_path, source_file_name, source_hash, row_count, total_amount, payable_amount, created_by_email, created_at';
  const out = new Map<string, StatementRecord>();
  if (hashes.length) {
    const { data, error } = await sb.from(TABLE).select(cols).in('source_hash', hashes);
    check(error);
    (data ?? []).forEach((r: Record<string, unknown>) => out.set(r.id as string, toRecord(r)));
  }
  if (kys.length) {
    const { data, error } = await sb.from(TABLE).select(cols).in('ky', kys).range(0, 4999);
    check(error);
    (data ?? []).forEach((r: Record<string, unknown>) => out.set(r.id as string, toRecord(r)));
  }
  return [...out.values()];
}

export interface NewStatement {
  customer_id: string;
  ten_cong_ty: string;
  ten_viet_tat: string;
  ky: string;
  file_name: string;
  source_file_name: string;
  source_hash: string;
  row_count: number;
  total_amount: number;
  payable_amount: number;
  buffer: ArrayBuffer;
}

let cachedEmail: string | null | undefined;
async function currentEmail(): Promise<string | null> {
  if (cachedEmail !== undefined) return cachedEmail ?? null;
  const { data } = await getSupabase().auth.getUser();
  cachedEmail = data.user?.email ?? null;
  return cachedEmail ?? null;
}

/** Lưu file vào Storage + ghi bản ghi lịch sử. Nếu `replaceIds` có giá trị thì xoá bản cũ sau khi lưu xong. */
export async function saveStatement(s: NewStatement, replace: StatementRecord[] = []): Promise<void> {
  const sb = getSupabase();
  const path = `${s.ky}/${crypto.randomUUID()}.xlsx`; // key ASCII, tên hiển thị lưu ở file_name
  const up = await sb.storage.from(BUCKET).upload(path, new Blob([s.buffer]), {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: false,
  });
  check(up.error);

  const { buffer: _b, ...row } = s;
  const { error } = await sb.from(TABLE).insert({ ...row, storage_path: path, created_by_email: await currentEmail() });
  if (error) {
    await sb.storage.from(BUCKET).remove([path]); // dọn file mồ côi
    check(error);
  }
  if (replace.length) await deleteStatements(replace);
}

export async function listPeriods(): Promise<PeriodSummary[]> {
  const { data, error } = await getSupabase()
    .from('mlx_statement_periods')
    .select('*')
    .order('ky', { ascending: false });
  check(error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ky: r.ky as string,
    file_count: num(r.file_count),
    customer_count: num(r.customer_count),
    row_count: num(r.row_count),
    total_amount: num(r.total_amount),
    payable_amount: num(r.payable_amount),
    last_created_at: r.last_created_at as string,
  }));
}

export async function listStatements(ky: string): Promise<StatementRecord[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('ky', ky)
    .order('ten_viet_tat')
    .range(0, 4999);
  check(error);
  return (data ?? []).map(toRecord);
}

export async function downloadStatement(rec: StatementRecord): Promise<Blob> {
  const { data, error } = await getSupabase().storage.from(BUCKET).download(rec.storage_path);
  check(error);
  return data as Blob;
}

/** Xoá file trong Storage và bản ghi lịch sử */
export async function deleteStatements(recs: StatementRecord[]): Promise<void> {
  if (!recs.length) return;
  const sb = getSupabase();
  const { error: se } = await sb.storage.from(BUCKET).remove(recs.map((r) => r.storage_path));
  check(se);
  const { error } = await sb.from(TABLE).delete().in('id', recs.map((r) => r.id));
  check(error);
}
