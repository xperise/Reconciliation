'use client';
import { useState } from 'react';
import { lamLaiBuoc, type BuocLamLai } from './reset-actions';

/** Nút làm lại một bước đã xong, có xác nhận. */
export function LamLai({ buoc, hopDongId, cauHoi }: { buoc: BuocLamLai; hopDongId: string; cauHoi: string }) {
  const [msg, setMsg] = useState('');
  const [dang, setDang] = useState(false);
  return (
    <div className="space-y-1">
      <button className="btn btn-sm" disabled={dang} onClick={async () => {
        if (!window.confirm(cauHoi)) return;
        setDang(true); setMsg('');
        const kq = await lamLaiBuoc(buoc, hopDongId);
        setMsg(kq.ok ? (kq.thongBao ?? 'Xong.') : kq.loi);
        setDang(false);
        if (kq.ok) window.location.reload();
      }}>Làm lại</button>
      {msg && <div className="text-[11px] text-[var(--ink-2)] max-w-[220px]">{msg}</div>}
    </div>
  );
}
