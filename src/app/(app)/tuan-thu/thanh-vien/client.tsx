'use client';
import { useState } from 'react';
import { Nut } from '../ui';
import { ganThanhVien } from '../actions';

export function ChonPhongBan({ userId, dau }: { userId: string; dau: string }) {
  const [v, setV] = useState(dau);
  return (
    <div className="flex items-start gap-2">
      <select className="field !py-1 text-[12px]" value={v} onChange={(e) => setV(e.target.value)}>
        <option value="">— Không tham gia —</option><option value="ke_toan">Kế toán</option><option value="demand">Demand</option>
        <option value="supply">Supply</option><option value="ceo">CEO</option></select>
      {v !== dau && <Nut chay={() => ganThanhVien(userId, v)} nhan="Lưu" kieu="btn-primary" />}
    </div>
  );
}
