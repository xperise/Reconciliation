import { supabaseAdmin } from './supabase/admin';

export const BUCKET = 'bang-ke';

/** Liên kết ký sống 90 ngày — đủ dài cho khách mở lại trong kỳ thanh toán. */
const SIGNED_URL_TTL = 60 * 60 * 24 * 90;

export type FileKind = 'bang_ke' | 'hstt';

export type StatementFile = {
  id: string;
  batch_id: string;
  dot: number;
  group_id: string;
  ma_he_thong: string;
  ky_doi_soat: string;
  kind: FileKind;
  version: number;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  sent_at: string | null;
  ghi_chu: string | null;
};

/**
 * Đường dẫn trong kho. Có tiền tố ngẫu nhiên để hai lần tải lên cùng tên
 * không đè lên nhau — bản cũ vẫn giữ được để truy vết khi khách khiếu nại.
 */
export function buildPath(
  maHeThong: string, ky: string, kind: FileKind, version: number, fileName: string,
  dot = 1,
): string {
  const safe = fileName
    .normalize('NFC')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 120);
  const stamp = Date.now().toString(36);
  const nhan = kind === 'hstt' ? 'HSTT' : `v${version}`;
  const thuMuc = dot > 1 ? `${ky}/dot${dot}` : ky;
  return `${maHeThong}/${thuMuc}/${nhan}_${stamp}_${safe}`;
}

/** Tải nội dung tệp về bộ nhớ để đính kèm vào email. */
export async function downloadFile(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`Không tải được tệp ${storagePath}: ${error?.message ?? 'không rõ nguyên nhân'}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Liên kết có chữ ký để chèn vào nút "Xem bảng kê" trong email khách. */
/**
 * Liên kết ký cho khách. Truyền tên tệp gốc vào tham số download để trình
 * duyệt lưu đúng tên kế toán đã đặt — nếu không, tệp bị lưu theo đường dẫn
 * trong kho và biến thành "v1_mtb1x2_TEST_GROUP".
 */
export async function signedUrl(storagePath: string, fileName?: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL,
      fileName ? { download: fileName } : undefined);
  if (error || !data) {
    throw new Error(`Không tạo được liên kết cho ${storagePath}: ${error?.message ?? ''}`);
  }
  return data.signedUrl;
}

/** Liên kết ngắn hạn cho người dùng nội bộ bấm xem trên website. */
export async function previewUrl(
  storagePath: string, seconds = 300, fileName?: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(storagePath, seconds, fileName ? { download: fileName } : undefined);
  return data?.signedUrl ?? null;
}

export async function removeFile(storagePath: string): Promise<void> {
  await supabaseAdmin().storage.from(BUCKET).remove([storagePath]);
}

/**
 * Bản mới nhất chưa gửi của một loại tệp trong một kỳ.
 * Workflow dùng hàm này thay cho việc dò tên file trên Drive.
 */
/**
 * Lô tệp chưa gửi mới nhất của một kỳ.
 *
 * Trả về cả lô chứ không phải một tệp: một bảng kê có thể gồm nhiều tệp
 * (bảng kê chính, phụ lục, bảng kê chi tiết) và chúng phải đi chung một email
 * thì khách mới đối chiếu được.
 */
export async function latestUnsentBatch(
  groupId: string, ky: string, kind: FileKind, dot = 1,
): Promise<StatementFile[]> {
  const sb = supabaseAdmin();

  const { data: dau } = await sb
    .from('statement_files')
    .select('batch_id')
    .eq('group_id', groupId).eq('ky_doi_soat', ky)
    .eq('kind', kind).eq('dot', dot)
    .is('sent_at', null)
    .order('version', { ascending: false })
    .order('uploaded_at', { ascending: false })
    .limit(1).maybeSingle();

  if (!dau?.batch_id) return [];

  const { data } = await sb
    .from('statement_files')
    .select('*')
    .eq('batch_id', dau.batch_id)
    .is('sent_at', null)
    .order('uploaded_at');

  return (data ?? []) as StatementFile[];
}

/** Toàn bộ tệp trong một lô, kể cả tệp đã gửi. */
export async function filesInBatch(batchId: string): Promise<StatementFile[]> {
  const { data } = await supabaseAdmin()
    .from('statement_files').select('*')
    .eq('batch_id', batchId).order('uploaded_at');
  return (data ?? []) as StatementFile[];
}

/** Số phiên bản kế tiếp cho một kỳ, dùng khi kế toán tải bản chỉnh sửa lên. */
/** Số bản kế tiếp cho một kỳ. Mọi tệp trong cùng một lô dùng chung số này. */
export async function nextVersion(
  groupId: string, ky: string, kind: FileKind, dot = 1,
): Promise<number> {
  const { data } = await supabaseAdmin()
    .from('statement_files')
    .select('version')
    .eq('group_id', groupId).eq('ky_doi_soat', ky)
    .eq('kind', kind).eq('dot', dot)
    .order('version', { ascending: false })
    .limit(1).maybeSingle();
  return ((data?.version as number) ?? 0) + 1;
}

export function mimeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    pdf: 'application/pdf',
    zip: 'application/zip',
  };
  return map[ext ?? ''] ?? 'application/octet-stream';
}
