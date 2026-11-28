'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Nut } from '../ui';
import { capNhatHopDong, capNhatNguongTien, capNhatTuGui, chotQuyTac, chotTatCaQuyTac, kichHoatHopDong, suaThamSoNhap } from '../actions';
import type { PhongBan } from '@/lib/tuan-thu/types';

export function ChotQuyTac({ id, chot, yKien, hopDongId, ma }: { id: string; chot: string; yKien: string; hopDongId: string; ma: string }) {
  const [y, setY] = useState(yKien);
  return (
    <div className="flex flex-col gap-1">
      <input className="field !py-1 text-[12px]" placeholder="Ý kiến (tùy chọn)" value={y} onChange={(e) => setY(e.target.value)} />
      <div className="flex gap-1 flex-wrap">
        {chot !== 'dong_y' && <Nut chay={() => chotQuyTac(id, 'dong_y', y)} nhan="Đồng ý" kieu="btn-primary" />}
        {chot !== 'can_sua' && <Nut chay={() => chotQuyTac(id, 'can_sua', y)} nhan="Cần sửa" />}
        <Link className="btn btn-sm" href={`/tuan-thu/quy-tac/${hopDongId}?ma=${ma}#sua-doi`}>Đề xuất sửa</Link>
      </div>
    </div>
  );
}

export function TuGuiKhach({ id, tuGui, daKiemDinh }: { id: string; tuGui: boolean; daKiemDinh: boolean }) {
  const [bat, setBat] = useState(tuGui);
  const [kd, setKd] = useState(daKiemDinh);
  return (
    <div className="grid gap-2 text-[12px]">
      <label className="flex items-center gap-2"><input type="checkbox" checked={bat} onChange={(e) => setBat(e.target.checked)} /> Tự gửi bảng kê cho khách này (không qua bước CEO khi đủ điều kiện)</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={kd} onChange={(e) => setKd(e.target.checked)} /> Tôi đã kiểm định: bảng kê tự động khớp với các bảng kê đã duyệt trước đó</label>
      <div><Nut chay={() => capNhatTuGui(id, bat, kd)} nhan="Lưu tự gửi" kieu="btn-primary" /></div>
      <p className="text-[var(--ink-3)]">Điều kiện tự gửi: không có cảnh báo chặn gửi, không có ngoại lệ, tổng tiền không vượt ngưỡng của khách. Lần nào không đủ điều kiện thì đi qua bước CEO như bình thường.</p>
    </div>
  );
}

export function NguongTien({ id, nguong }: { id: string; nguong: number | null }) {
  const [v, setV] = useState(nguong != null ? String(nguong) : '');
  return (
    <div className="grid gap-2 md:grid-cols-[1fr_auto] items-end">
      <label className="flex flex-col gap-1 text-[12px]">Ngưỡng tiền của khách (đ) — bước "chạy khi vượt ngưỡng" dùng số này. Để trống nếu chưa đặt.
        <input className="field" inputMode="numeric" placeholder="ví dụ 500000000" value={v} onChange={(e) => setV(e.target.value)} /></label>
      <Nut chay={() => capNhatNguongTien(id, v)} nhan="Lưu ngưỡng" kieu="btn-primary" />
    </div>
  );
}

export function SuaHopDong({ id, groupId, ccThem, nhom }: { id: string; groupId: string | null; ccThem: string; nhom: { id: string; ten: string }[] }) {
  const [g, setG] = useState(groupId ?? ''); const [cc, setCc] = useState(ccThem);
  return (
    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] items-end">
      <label className="flex flex-col gap-1 text-[12px]">Nhóm Master Data (lấy email đầu mối, CC)
        <select className="field" value={g} onChange={(e) => setG(e.target.value)}>
          <option value="">— Chưa gắn —</option>{nhom.map((x) => <option key={x.id} value={x.id}>{x.ten}</option>)}
        </select></label>
      <label className="flex flex-col gap-1 text-[12px]">CC thêm (cách nhau dấu phẩy)
        <input className="field" value={cc} onChange={(e) => setCc(e.target.value)} /></label>
      <Nut chay={() => capNhatHopDong(id, g || null, cc)} nhan="Lưu" kieu="btn-primary" />
    </div>
  );
}

export function KichHoat({ id }: { id: string }) {
  return <Nut chay={() => kichHoatHopDong(id)} nhan="Kích hoạt hợp đồng" kieu="btn-primary" xacNhan="Kích hoạt hợp đồng này? Sau khi kích hoạt, mọi thay đổi quy tắc phải qua luồng sửa đổi 4/4 head." />;
}

export function DocLai({ id }: { id: string }) {
  const [tb, setTb] = useState(''); const [dang, setDang] = useState(false);
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" className="btn btn-sm" disabled={dang} onClick={async () => {
        if (!confirm('Cho agent đọc lại hợp đồng? Bản nháp quy tắc hiện tại (kể cả các chốt) sẽ bị thay.')) return;
        setDang(true); setTb('Agent đang đọc lại (1–3 phút)…');
        const r = await fetch('/api/tuan-thu/doc-hop-dong', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
        const j: any = await r.json().catch(() => null);
        setDang(false);
        if (!j) { setTb(`Máy chủ không trả kết quả (HTTP ${r.status}) — thường do xử lý quá thời gian. Tải lại trang sau 1–2 phút: nếu hợp đồng đã sang "Chờ chốt" là đã đọc xong; nếu vẫn lỗi thì bấm đọc lại.`); return; }
        setTb(j.ok ? `Xong: ${j.so_quy_tac} quy tắc, ${j.cau_hoi_mo} điểm còn mở.` : `Lỗi: ${j.error ?? r.status}`);
        if (j.ok) location.reload();
      }}>{dang ? 'Đang đọc…' : 'Agent đọc lại hợp đồng'}</button>
      {tb && <span className="text-[11.5px]">{tb}</span>}
    </span>
  );
}

export function SuaThamSo({ id, dau }: { id: string; dau: string }) {
  const [t, setT] = useState(dau);
  return (
    <details className="mt-2"><summary className="text-[12px] cursor-pointer">Sửa tham số máy (bản nháp, JSON)</summary>
      <textarea className="field mono text-[11.5px] mt-2" rows={14} value={t} onChange={(e) => setT(e.target.value)} />
      <div className="mt-2"><Nut chay={() => suaThamSoNhap(id, t)} nhan="Lưu tham số" kieu="btn-primary" /></div>
    </details>
  );
}

export function ChotTatCa({ hopDongId, pb, con }: { hopDongId: string; pb: PhongBan; con: number }) {
  return <Nut chay={() => chotTatCaQuyTac(hopDongId, pb, '')} nhan={`Đồng ý tất cả (${con} quy tắc còn chờ)`} kieu="btn-primary"
    xacNhan={`Đồng ý một lần ${con} quy tắc còn chờ chốt của phòng này? Quy tắc nào cần sửa thì bấm Cần sửa / Đề xuất sửa riêng sau.`} />;
}
