'use client';
import { useState } from 'react';
import { chapNhanLoiMoi } from '../loi-moi-actions';

export function NhanLoiMoi({ ma }: { ma: string }) {
  const [msg, setMsg] = useState('');
  const [dang, setDang] = useState(false);
  return (
    <div className="space-y-2">
      <button className="btn btn-primary" disabled={dang} onClick={async () => {
        setDang(true); setMsg('');
        const kq = await chapNhanLoiMoi(ma);
        setMsg(kq.ok ? (kq.thongBao ?? 'Xong.') : kq.loi);
        setDang(false);
        if (kq.ok) window.location.href = '/tuan-thu';
      }}>Nhận lời mời</button>
      {msg && <div className="text-[13px]">{msg}</div>}
    </div>
  );
}
