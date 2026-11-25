'use client';
import { supabaseBrowser } from '@/lib/supabase/client';
import { xinLinkTaiLen } from './actions';

const BUCKET = 'bang-ke';

/**
 * Tải các file trong ô chọn file thẳng lên Supabase Storage rồi xóa khỏi FormData,
 * thay bằng danh sách đường dẫn (JSON) — request gửi lên Vercel chỉ còn vài KB.
 */
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
