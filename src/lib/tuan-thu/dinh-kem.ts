import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BUCKET_TT } from './db';

export type TepDinhKem = { path: string; ten: string; loai?: string };

const DUOI_ANH: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const GIOI_HAN_CHU = 60_000;

const catChu = (t: string) => (t.length > GIOI_HAN_CHU ? `${t.slice(0, GIOI_HAN_CHU)}\n…(đã cắt, file dài ${t.length.toLocaleString('vi-VN')} ký tự)` : t);

async function excelThanhChu(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const out: string[] = [];
  for (const ws of wb.worksheets) {
    out.push(`### Sheet: ${ws.name} (${ws.rowCount} dòng)`);
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r > 400) return;
      const v = (row.values as any[]).slice(1).map((c) => {
        if (c === null || c === undefined) return '';
        if (c instanceof Date) return c.toISOString().slice(0, 10);
        if (typeof c === 'object') return c.result ?? c.text ?? (c.richText ? c.richText.map((x: any) => x.text).join('') : '');
        return String(c);
      });
      out.push(`${r}: ${v.join(' | ')}`);
    });
    if (ws.rowCount > 400) out.push(`…(sheet còn ${ws.rowCount - 400} dòng không hiển thị)`);
  }
  return out.join('\n');
}

async function wordThanhChu(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) return '(Không đọc được nội dung Word.)';
  return xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Biến các file đính kèm thành khối nội dung cho Claude API (PDF/ảnh gửi nguyên, Excel/Word/CSV chuyển chữ). */
export async function khoiDinhKem(teps: TepDinhKem[]): Promise<any[]> {
  const sb = supabaseAdmin();
  const blocks: any[] = [];
  for (const t of teps.slice(0, 8)) {
    const { data } = await sb.storage.from(BUCKET_TT).download(t.path);
    if (!data) { blocks.push({ type: 'text', text: `[Không tải được tệp ${t.ten}]` }); continue; }
    const buf = Buffer.from(await data.arrayBuffer());
    const duoi = (t.ten.split('.').pop() ?? '').toLowerCase();
    blocks.push({ type: 'text', text: `--- Tệp đính kèm: ${t.ten} (đường dẫn để dùng trong công cụ: ${t.path}) ---` });
    try {
      if (duoi === 'pdf') blocks.push({ type: 'document', title: t.ten, source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } });
      else if (DUOI_ANH[duoi]) blocks.push({ type: 'image', source: { type: 'base64', media_type: DUOI_ANH[duoi], data: buf.toString('base64') } });
      else if (duoi === 'xlsx' || duoi === 'xlsm') blocks.push({ type: 'text', text: catChu(await excelThanhChu(buf)) });
      else if (duoi === 'docx') blocks.push({ type: 'text', text: catChu(await wordThanhChu(buf)) });
      else blocks.push({ type: 'text', text: catChu(buf.toString('utf8')) });
    } catch (e) {
      blocks.push({ type: 'text', text: `[Không đọc được ${t.ten}: ${e instanceof Error ? e.message : String(e)}]` });
    }
  }
  return blocks;
}
