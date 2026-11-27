'use client';
import { useState } from 'react';
import { moiThanhVien, thuHoiLoiMoi } from '../loi-moi-actions';
import type { QuyenTT } from '@/lib/tuan-thu/db';

const NHAN_QUYEN: Record<QuyenTT, string> = { quan_tri: 'Quản trị', kich_hoat: 'Kích hoạt hợp đồng', xem_bao_cao: 'Xem tổng quan CEO' };

export function MoiForm({ roles }: { roles: { key: string; ten: string }[] }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(roles[0]?.key ?? '');
  const [quyen, setQuyen] = useState<QuyenTT[]>([]);
  const [msg, setMsg] = useState('');
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input className="field !py-1 text-[13px]" type="email" placeholder="email người được mời" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="field !py-1 text-[13px]" value={role} onChange={(e) => setRole(e.target.value)}>
          {roles.map((r) => <option key={r.key} value={r.key}>{r.ten}</option>)}
        </select>
        {(Object.keys(NHAN_QUYEN) as QuyenTT[]).map((q) => (
          <label key={q} className="text-[12px] flex items-center gap-1">
            <input type="checkbox" checked={quyen.includes(q)} onChange={() => setQuyen(quyen.includes(q) ? quyen.filter((x) => x !== q) : [...quyen, q])} />
            {NHAN_QUYEN[q]}
          </label>
        ))}
        <button className="btn btn-primary" onClick={async () => {
          setMsg(''); const kq = await moiThanhVien(email, role, quyen);
          setMsg(kq.ok ? (kq.thongBao ?? 'Đã gửi.') : kq.loi);
          if (kq.ok) setEmail('');
        }}>Gửi lời mời</button>
      </div>
      {msg && <div className="text-[13px]">{msg}</div>}
    </div>
  );
}

export function ThuHoi({ id }: { id: string }) {
  const [msg, setMsg] = useState('');
  return (
    <span>
      <button className="text-[12px] underline" onClick={async () => { const kq = await thuHoiLoiMoi(id); setMsg(kq.ok ? 'Đã thu hồi.' : kq.loi); }}>Thu hồi</button>
      {msg && <span className="ml-2 text-[12px]">{msg}</span>}
    </span>
  );
}
