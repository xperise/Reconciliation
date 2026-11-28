'use client';
import { useState } from 'react';
import { luuQuorumLoai } from './cau-hinh-actions';

/** Quorum theo loại thay đổi: mỗi loại chọn những bước tham gia. */
export function QuorumLoai({ loai: l0, buoc }: { loai: { loai: string; ten: string; buocKeys: string[]; canDuyet: boolean }[]; buoc: { key: string; roleKey: string }[] }) {
  const [rows, setRows] = useState(l0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dang, setDang] = useState(false);
  const bat = (i: number, k: string) => setRows(rows.map((r, j) => j !== i ? r : { ...r, buocKeys: r.buocKeys.includes(k) ? r.buocKeys.filter((x) => x !== k) : [...r.buocKeys, k] }));
  return (
    <section className="card card-pad mt-6">
      <h2 className="card-title mb-1">Quorum sửa đổi theo loại thay đổi</h2>
      <p className="text-[12px] text-[var(--ink-2)] mb-2">Mỗi loại thay đổi chọn những bước phải đồng ý trước khi áp dụng. Mỗi bước được chọn vẫn theo chế độ "Ai duyệt" của chính bước đó.</p>
      <table className="tbl text-[13px]">
        <thead><tr><th>Loại thay đổi</th><th>Cần duyệt</th>{buoc.map((b) => <th key={b.key}>{b.key}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.loai}>
            <td>{r.ten}</td>
            <td className="text-center"><input type="checkbox" checked={r.canDuyet} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, canDuyet: e.target.checked } : x))} title="Bỏ tick: sửa điều khoản loại này áp dụng ngay, không qua quorum" /></td>
            {buoc.map((b) => <td key={b.key} className="text-center"><input type="checkbox" disabled={!r.canDuyet} checked={r.buocKeys.includes(b.key)} onChange={() => bat(i, b.key)} /></td>)}
          </tr>))}</tbody>
      </table>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-primary" disabled={dang} onClick={async () => {
          setDang(true); setMsg(null);
          const kq = await luuQuorumLoai(rows.map((r) => ({ loai: r.loai, buocKeys: r.buocKeys, canDuyet: r.canDuyet })));
          setDang(false);
          setMsg(kq.ok ? { ok: true, text: kq.thongBao ?? 'Đã lưu.' } : { ok: false, text: kq.loi.join(' ') });
        }}>Lưu quorum</button>
        {msg && <span className={`text-[13px] ${msg.ok ? '' : 'text-[var(--red)]'}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
