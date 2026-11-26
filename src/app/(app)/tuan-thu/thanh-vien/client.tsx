'use client';
import { useState } from 'react';
import { Nut } from '../ui';
import { datQuyen, ganThanhVien } from '../actions';
import type { QuyenTT } from '@/lib/tuan-thu/db';

export function ChonPhongBan({ userId, dau, roles }: { userId: string; dau: string; roles: { key: string; ten: string }[] }) {
  const [v, setV] = useState(dau);
  return (
    <div className="flex items-start gap-2">
      <select className="field !py-1 text-[12px]" value={v} onChange={(e) => setV(e.target.value)}>
        <option value="">— Không tham gia —</option>{roles.map((r) => <option key={r.key} value={r.key}>{r.ten}</option>)}</select>
      {v !== dau && <Nut chay={() => ganThanhVien(userId, v)} nhan="Lưu" kieu="btn-primary" />}
    </div>
  );
}

const NHAN_QUYEN: Record<QuyenTT, string> = { quan_tri: 'Quản trị (làm thay mọi phòng)', kich_hoat: 'Kích hoạt hợp đồng', xem_bao_cao: 'Xem tổng quan CEO' };

export function QuyenNguoi({ userId, dang }: { userId: string; dang: string[] }) {
  const [dangCo, setDangCo] = useState<string[]>(dang);
  const [loi, setLoi] = useState('');
  async function doi(q: QuyenTT) {
    const bat = !dangCo.includes(q);
    setLoi('');
    const kq = await datQuyen(userId, q, bat);
    if (kq.ok) setDangCo(bat ? [...dangCo, q] : dangCo.filter((x) => x !== q));
    else setLoi(kq.loi);
  }
  return (
    <div className="space-y-1 text-[12px]">
      {(Object.keys(NHAN_QUYEN) as QuyenTT[]).map((q) => (
        <label key={q} className="flex items-center gap-2">
          <input type="checkbox" checked={dangCo.includes(q)} onChange={() => doi(q)} /> {NHAN_QUYEN[q]}
        </label>
      ))}
      {loi && <div className="text-[var(--red)]">{loi}</div>}
    </div>
  );
}
