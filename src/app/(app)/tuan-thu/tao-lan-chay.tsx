'use client';
import { useRouter } from 'next/navigation';
import { FormHanhDong } from './ui';
import { taoLanChay } from './actions';
import { taiLenTrucTiep } from './tai-len';

async function taoQuaStorage(fd: FormData) {
  try { await taiLenTrucTiep(fd, 'raw', 'raw_json', 'raw', 'raw'); }
  catch (e) { return { ok: false as const, loi: e instanceof Error ? e.message : String(e) }; }
  return taoLanChay(fd);
}

export function TaoLanChay({ hopDong }: { hopDong: { id: string; ma_khach: string; ten_khach: string; so_hop_dong: string }[] }) {
  const router = useRouter();
  const now = new Date(); now.setMonth(now.getMonth() - 1);
  const macDinh = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return (
    <FormHanhDong action={taoQuaStorage} nhanNut="Upload & xử lý" sau={(k) => { if (k.ok && k.id) router.push(`/tuan-thu/chay/${k.id}`); }}>
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
        <label className="flex flex-col gap-1 text-[12px]">File raw (khách sạn và vé máy bay)
          <input type="file" name="raw" accept=".xlsx" multiple required className="text-[12px]" />
        </label>
      </div>
    </FormHanhDong>
  );
}
