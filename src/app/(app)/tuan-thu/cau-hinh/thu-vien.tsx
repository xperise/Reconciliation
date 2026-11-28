'use client';
import { useState } from 'react';
import { congBoLenHub, dungMau } from './thu-vien-actions';

type Mau = { id: string; ma: string; ten: string; mo_ta: string; nguon: 'he_thong' | 'hub'; kiem_dinh: boolean };

/** Thư viện mẫu: mẫu hệ thống (Cấp 1, 2, 3), mẫu công bố lên hub; dùng mẫu và công bố cấu hình hiện tại. */
export function ThuVien({ mau }: { mau: Mau[] }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ten, setTen] = useState('');
  const [moTa, setMoTa] = useState('');
  return (
    <div className="space-y-6">
      <section className="card card-pad">
        <h2 className="card-title mb-2">Mẫu hệ thống và mẫu hub</h2>
        <p className="text-[12px] text-[var(--ink-2)] mb-3">Dùng mẫu sẽ thay cấu hình hiện tại của tổ chức. Mẫu chỉ có cấu trúc (role, bước, điều kiện), không có người, khách hay số liệu.</p>
        <table className="tbl text-[13px]"><thead><tr><th>Mẫu</th><th>Nguồn</th><th>Mô tả</th><th></th></tr></thead>
          <tbody>{mau.map((m) => (
            <tr key={m.id}>
              <td className="font-semibold">{m.ten}</td>
              <td className="text-[12px]">{m.nguon === 'he_thong' ? 'Hệ thống' : `Hub${m.kiem_dinh ? ' · đã kiểm định' : ' · chưa kiểm định'}`}</td>
              <td className="text-[12px]">{m.mo_ta}</td>
              <td><button className="btn btn-sm" onClick={async () => {
                if (!window.confirm(`Dùng mẫu "${m.ten}"? Cấu hình hiện tại sẽ bị thay.`)) return;
                const kq = await dungMau(m.id);
                setMsg(kq.ok ? { ok: true, text: kq.thongBao ?? 'Xong.' } : { ok: false, text: kq.loi.join(' ') });
              }}>Dùng mẫu</button></td>
            </tr>))}</tbody></table>
      </section>
      <section className="card card-pad">
        <h2 className="card-title mb-2">Công bố cấu hình hiện tại lên hub</h2>
        <p className="text-[12px] text-[var(--ink-2)] mb-2">Chỉ cấu trúc được công bố. Hệ thống quét trước khi lưu: nếu còn email, mã người, mã khách hay mã hợp đồng thì không công bố được.</p>
        <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto] items-end">
          <label className="flex flex-col gap-1 text-[12px]">Tên mẫu<input className="field" value={ten} onChange={(e) => setTen(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-[12px]">Mô tả<input className="field" value={moTa} onChange={(e) => setMoTa(e.target.value)} /></label>
          <button className="btn btn-primary" onClick={async () => {
            const kq = await congBoLenHub(ten, moTa);
            setMsg(kq.ok ? { ok: true, text: kq.thongBao ?? 'Đã công bố.' } : { ok: false, text: kq.loi.join(' ') });
            if (kq.ok) { setTen(''); setMoTa(''); }
          }}>Công bố</button>
        </div>
      </section>
      {msg && <div className={`text-[13px] ${msg.ok ? '' : 'text-[var(--red)]'}`}>{msg.text}</div>}
    </div>
  );
}
