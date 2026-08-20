import { supabaseAdmin } from './supabase/admin';

export const BUCKET = 'bang-ke';

/** Liên kết ký sống 90 ngày — đủ dài cho khách mở lại trong kỳ thanh toán. */
const SIGNED_URL_TTL = 60 * 60 * 24 * 90;

export type FileKind = 'bang_ke' | 'hstt';

export type StatementFile = {
  id: string;
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
): string {
  const safe = fileName
    .normalize('NFC')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 120);
  const stamp = Date.now().toString(36);
  const nhan = kind === 'hstt' ? 'HSTT' : `v${version}`;
  return `${maHeThong}/${ky}/${nhan}_${stamp}_${safe}`;
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
export async function signedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error || !data) {
    throw new Error(`Không tạo được liên kết cho ${storagePath}: ${error?.message ?? ''}`);
  }
  return data.signedUrl;
}

/** Liên kết ngắn hạn cho người dùng nội bộ bấm xem trên website. */
export async function previewUrl(storagePath: string, seconds = 300): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  return data?.signedUrl ?? null;
}

export async function removeFile(storagePath: string): Promise<void> {
  await supabaseAdmin().storage.from(BUCKET).remove([storagePath]);
}

/**
 * Bản mới nhất chưa gửi của một loại tệp trong một kỳ.
 * Workflow dùng hàm này thay cho việc dò tên file trên Drive.
 */
export async function latestUnsent(
  groupId: string, ky: string, kind: FileKind,
): Promise<StatementFile | null> {
  const { data } = await supabaseAdmin()
    .from('statement_files')
    .select('*')
    .eq('group_id', groupId)
    .eq('ky_doi_soat', ky)
    .eq('kind', kind)
    .is('sent_at', null)
    .order('version', { ascending: false })
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as StatementFile) ?? null;
}

/** Số phiên bản kế tiếp cho một kỳ, dùng khi kế toán tải bản chỉnh sửa lên. */
export async function nextVersion(
  groupId: string, ky: string, kind: FileKind,
): Promise<number> {
  if (kind === 'hstt') return 1;
  const { data } = await supabaseAdmin()
    .from('statement_files')
    .select('version')
    .eq('group_id', groupId)
    .eq('ky_doi_soat', ky)
    .eq('kind', kind)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
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
