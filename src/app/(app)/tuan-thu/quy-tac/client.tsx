'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Nut } from '../ui';
import { capNhatHopDong, chotQuyTac } from '../actions';

export function ChotQuyTac({ id, chot, yKien, hopDongId, ma }: { id: string; chot: string; yKien: string; hopDongId: string; ma: string }) {
  const [y, setY] = useState(yKien);
  return (
    <div className="flex flex-col gap-1">
      <input className="field !py-1 text-[12px]" placeholder="Ý kiến (tùy chọn)" value={y} onChange={(e) => setY(e.target.value)} />
      <div className="flex gap-1 flex-wrap">
        {chot !== 'dong_y' && <Nut chay={() => chotQuyTac(id, 'dong_y', y)} nhan="Đồng ý" kieu="btn-primary" />}
        {chot !== 'can_sua' && <Nut chay={() => chotQuyTac(id, 'can_sua', y)} nhan="Cần sửa" />}
        <Link className="btn btn-sm" href={`/tuan-thu/sua-doi?hd=${hopDongId}&ma=${ma}`}>Đề xuất sửa</Link>
      </div>
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
