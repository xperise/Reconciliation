'use client';
import { supabaseBrowser } from '@/lib/supabase/client';
import { xinLinkTaiLen } from './actions';

const BUCKET = 'bang-ke';

/**
 * Tải các file trong ô chọn file thẳng lên Supabase Storage rồi xóa khỏi FormData,
 * thay bằng danh sách đường dẫn (JSON) — request gửi lên Vercel chỉ còn vài KB.
 */
const MIME: Record<string, string> = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const mimeCua = (ten: string) => MIME[(ten.split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream';

/** Tải danh sách File thẳng lên Storage (dùng cho đính kèm chat). */
export async function taiFileLen(files: File[], loai: 'hop_dong' | 'raw' | 'chat', maKhach: string) {
  if (!files.length) return [] as { path: string; ten: string }[];
  const k = await xinLinkTaiLen(loai, maKhach, files.map((f) => f.name));
  if (!k.ok) throw new Error(k.loi);
  const sb = supabaseBrowser();
  const out: { path: string; ten: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const { path, token, ten } = k.ds[i];
    const { error } = await sb.storage.from(BUCKET).uploadToSignedUrl(path, token, files[i], { contentType: mimeCua(ten) });
    if (error) throw new Error(`Không tải lên được ${ten}: ${error.message}`);
    out.push({ path, ten });
  }
  return out;
}

export async function taiLenTrucTiep(fd: FormData, oFile: string, oJson: string, loai: 'hop_dong' | 'raw', maKhach: string) {
  const files = (fd.getAll(oFile) as File[]).filter((f) => f && f.size);
  if (!files.length) return;
  const k = await xinLinkTaiLen(loai, maKhach, files.map((f) => f.name));
  if (!k.ok) throw new Error(k.loi);
  const sb = supabaseBrowser();
  const out: { path: string; ten: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const { path, token, ten } = k.ds[i];
    const { error } = await sb.storage.from(BUCKET).uploadToSignedUrl(path, token, files[i], {
      contentType: loai === 'hop_dong' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (error) throw new Error(`Không tải lên được ${ten}: ${error.message}`);
    out.push({ path, ten });
  }
  fd.delete(oFile);
  fd.set(oJson, JSON.stringify(out));
}
