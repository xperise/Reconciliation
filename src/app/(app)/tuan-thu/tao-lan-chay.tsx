'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormHanhDong } from './ui';
import { taoLanChay } from './actions';
import { taiLenTrucTiep } from './tai-len';

async function taoQuaStorage(fd: FormData) {
  try {
    const cheDo = String(fd.get('che_do') ?? 'raw');
    const coRaw = (fd.getAll('raw') as File[]).some((f) => f && f.size);
    const coBk = (fd.getAll('bk') as File[]).some((f) => f && f.size);
    if (cheDo === 'raw' && !coRaw) return { ok: false as const, loi: 'Chọn file raw (khách sạn và vé máy bay).' };
    if (cheDo === 'da_format' && !coBk) return { ok: false as const, loi: 'Chọn file bảng kê đã format.' };
    await taiLenTrucTiep(fd, 'bk', 'bk_json', 'raw', 'bk');
    await taiLenTrucTiep(fd, 'raw', 'raw_json', 'raw', 'raw');
  } catch (e) { return { ok: false as const, loi: e instanceof Error ? e.message : String(e) }; }
  return taoLanChay(fd);
}

export function TaoLanChay({ hopDong }: { hopDong: { id: string; ma_khach: string; ten_khach: string; so_hop_dong: string }[] }) {
  const router = useRouter();
  const [cheDo, setCheDo] = useState<'raw' | 'da_format'>('raw');
  const now = new Date(); now.setMonth(now.getMonth() - 1);
  const macDinh = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return (
    <FormHanhDong action={taoQuaStorage} nhanNut={cheDo === 'raw' ? 'Upload & xử lý' : 'Upload & kiểm tra'} sau={(k) => { if (k.ok && k.id) router.push(`/tuan-thu/chay/${k.id}`); }}>
      <div className="flex gap-2 flex-wrap text-[12.5px]">
        {([['raw', 'Từ raw — app format theo mẫu khách'], ['da_format', 'Bảng kê kế toán đã format — app kiểm tra & đề xuất bản sửa']] as const).map(([v, t]) => (
          <label key={v} className={`btn btn-sm ${cheDo === v ? 'btn-primary' : ''}`}><input type="radio" name="che_do" value={v} checked={cheDo === v} onChange={() => setCheDo(v)} className="sr-only" />{t}</label>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-[12px]">Hợp đồng
          <select name="hop_dong_id" className="field" required>
            {hopDong.map((h) => <option key={h.id} value={h.id}>{h.ma_khach} — {h.so_hop_dong}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px]">Tháng dữ liệu
          <input type="month" name="thang" className="field" defaultValue={macDinh} required />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">Đợt
          <select name="dot" className="field" defaultValue="">
            <option value="">Cả tháng</option><option value="1">Đợt 1</option><option value="2">Đợt 2</option>
          </select>
          <span className="text-[11px] text-[var(--ink-3)]">Theo bộ quy tắc hiện hành của hợp đồng.</span>
        </label>
        {cheDo === 'da_format' && (
          <label className="flex flex-col gap-1 text-[12px]">Bảng kê đã format (1 file .xlsx)
            <input type="file" name="bk" accept=".xlsx" className="text-[12px]" />
          </label>
        )}
        <label className="flex flex-col gap-1 text-[12px]">{cheDo === 'raw' ? 'File raw (khách sạn và vé máy bay)' : 'Raw để đối chiếu (không bắt buộc)'}
          <input type="file" name="raw" accept=".xlsx" multiple className="text-[12px]" />
        </label>
      </div>
      {cheDo === 'da_format' && <p className="text-[11.5px] text-[var(--ink-3)]">App kiểm tra file theo bộ quy tắc hợp đồng (đầu trang, tài khoản, chiết khấu, phí, số học, dòng tổng, sheet tổng hợp, định mức, kỳ…), đối chiếu raw nếu có, và tạo thêm bản đã sửa theo quy tắc (giữ nguyên mẫu của file). Kế toán chọn bản gửi khách.</p>}
    </FormHanhDong>
  );
}
