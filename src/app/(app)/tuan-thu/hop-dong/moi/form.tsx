'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { taoHopDong } from '../../actions';
import { taiLenTrucTiep } from '../../tai-len';

export function FormHopDong({ nhom }: { nhom: { id: string; ten: string }[] }) {
  const router = useRouter();
  const [dang, bat] = useTransition();
  const [buoc, setBuoc] = useState('');
  const [loi, setLoi] = useState('');
  const d = new Date();
  const thang = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => {
      e.preventDefault(); setLoi('');
      const fd = new FormData(e.currentTarget);
      bat(async () => {
        try {
          setBuoc('Đang tải file hợp đồng lên…');
          await taiLenTrucTiep(fd, 'tep', 'tep_json', 'hop_dong', String(fd.get('ma_khach') ?? ''));
          setBuoc('Đang tạo hợp đồng…');
          const k = await taoHopDong(fd);
          if (!k.ok) { setLoi(k.loi); setBuoc(''); return; }
          setBuoc('Agent đang đọc hợp đồng: tóm tắt điều khoản, tham số và quy tắc của 4 phòng (thường 1–3 phút)…');
          const r = await fetch('/api/tuan-thu/doc-hop-dong', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: k.id }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.ok) { setLoi(`Đã lưu hợp đồng nhưng agent đọc lỗi: ${j.error ?? `HTTP ${r.status}`}. Bấm "Agent đọc lại" ở trang Hợp đồng & quy tắc.`); setBuoc(''); return; }
          router.push(`/tuan-thu/quy-tac/${k.id}`);
        } catch (err) {
          setLoi(err instanceof Error ? err.message : String(err)); setBuoc('');
        }
      });
    }}>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-[12px]">Mã khách (viết tắt, không dấu)<input name="ma_khach" className="field" placeholder="VD: NAB" required /></label>
        <label className="flex flex-col gap-1 text-[12px]">Tên khách (hiển thị, in trên thư)<input name="ten_khach" className="field" required /></label>
        <label className="flex flex-col gap-1 text-[12px]">Tên ở cột "Tên công ty" của raw<input name="ten_cong_ty_raw" className="field" placeholder="đúng như file raw xuất từ hệ thống" /></label>
        <label className="flex flex-col gap-1 text-[12px]">Số hợp đồng<input name="so_hop_dong" className="field" required /></label>
        <label className="flex flex-col gap-1 text-[12px]">Ngày ký<input name="ngay_ky" type="date" className="field" /></label>
        <label className="flex flex-col gap-1 text-[12px]">Áp dụng cho bảng kê từ tháng<input name="hieu_luc_tu" type="month" className="field" defaultValue={thang} required /></label>
        <label className="flex flex-col gap-1 text-[12px]">Nhóm Master Data (email đầu mối, CC)
          <select name="group_id" className="field"><option value="">— Gắn sau —</option>{nhom.map((g) => <option key={g.id} value={g.id}>{g.ten}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px] md:col-span-2">CC thêm (cách nhau dấu phẩy)<input name="cc_them" className="field" /></label>
      </div>
      <label className="flex flex-col gap-1 text-[12px]">Hợp đồng và phụ lục còn hiệu lực (PDF, chọn được nhiều file)
        <input name="tep" type="file" accept="application/pdf,.pdf" multiple required className="text-[12px]" /></label>
      <label className="flex flex-col gap-1 text-[12px]">Danh mục phòng ban / cost center (tùy chọn — mỗi dòng: Tên phòng ban;mã cost center). Để trống thì sheet tổng hợp lấy theo phòng ban có trong raw.
        <textarea name="phong_ban" rows={4} className="field mono text-[12px]" /></label>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={dang}>{dang ? 'Đang xử lý…' : 'Tạo hợp đồng & cho agent đọc'}</button>
        {buoc && <span className="text-[12px]">{buoc}</span>}
      </div>
      {loi && <div className="callout callout-critical text-[12px]">{loi}</div>}
      <div className="callout callout-accent text-[12px]">Mẫu bảng kê của khách mới hiện dùng mẫu chuẩn (Tiền phòng, Tiền vé, Chi phí phòng ban — theo cấu trúc PL01). Khách cần mẫu riêng thì báo để cấu hình thêm.</div>
    </form>
  );
}
