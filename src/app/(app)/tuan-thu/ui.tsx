'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type KQ = { ok: true; id?: string; thongBao?: string } | { ok: false; loi: string };

/** Nút gọi server action, hiện lỗi/thông báo ngay dưới nút. */
export function Nut({ chay, nhan, kieu = '', xacNhan, sau }: {
  chay: () => Promise<KQ>; nhan: string; kieu?: string; xacNhan?: string; sau?: (k: KQ) => void;
}) {
  const [dang, bat] = useTransition();
  const [tb, setTb] = useState<{ loi: boolean; t: string } | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" className={`btn btn-sm ${kieu}`} disabled={dang}
        onClick={() => {
          if (xacNhan && !confirm(xacNhan)) return;
          bat(async () => {
            const k = await chay();
            setTb(k.ok ? (k.thongBao ? { loi: false, t: k.thongBao } : null) : { loi: true, t: k.loi });
            if (k.ok) { sau?.(k); router.refresh(); }
          });
        }}>{dang ? 'Đang xử lý…' : nhan}</button>
      {tb && <span className={`text-[11.5px] ${tb.loi ? 'text-red-600' : 'text-emerald-700'}`}>{tb.t}</span>}
    </span>
  );
}

/** Form gửi FormData tới server action. */
export function FormHanhDong({ action, children, nhanNut, sau, kieu = 'btn-primary' }: {
  action: (fd: FormData) => Promise<KQ>; children: React.ReactNode; nhanNut: string; sau?: (k: KQ) => void; kieu?: string;
}) {
  const [dang, bat] = useTransition();
  const [tb, setTb] = useState<{ loi: boolean; t: string } | null>(null);
  const router = useRouter();
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      bat(async () => {
        const k = await action(fd);
        setTb(k.ok ? { loi: false, t: k.thongBao ?? 'Đã lưu.' } : { loi: true, t: k.loi });
        if (k.ok) { sau?.(k); router.refresh(); }
      });
    }}>
      {children}
      <div className="flex items-center gap-3">
        <button className={`btn ${kieu}`} disabled={dang}>{dang ? 'Đang xử lý…' : nhanNut}</button>
        {tb && <span className={`text-[12px] ${tb.loi ? 'text-red-600' : 'text-emerald-700'}`}>{tb.t}</span>}
      </div>
    </form>
  );
}

/** Ô nhập ngắn + nút lưu (giải trình, ý kiến). */
export function OGhi({ dau, luu, nhan = 'Lưu', placeholder }: {
  dau: string; luu: (t: string) => Promise<KQ>; nhan?: string; placeholder?: string;
}) {
  const [t, setT] = useState(dau);
  return (
    <div className="flex items-start gap-2">
      <textarea className="field !min-h-[36px] text-[12px] flex-1" rows={2} value={t} placeholder={placeholder}
        onChange={(e) => setT(e.target.value)} />
      <Nut chay={() => luu(t)} nhan={nhan} />
    </div>
  );
}

/** Khối duyệt: ý kiến + Duyệt / Trả về. */
export function KhoiDuyet({ duyet, nhanDuyet = 'Duyệt', xacNhanDuyet }: {
  duyet: (q: 'duyet' | 'tra_ve', y: string) => Promise<KQ>; nhanDuyet?: string; xacNhanDuyet?: string;
}) {
  const [y, setY] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <textarea className="field text-[12px]" rows={2} placeholder="Ý kiến (bắt buộc khi trả về hoặc khi duyệt khác đề xuất của agent)"
        value={y} onChange={(e) => setY(e.target.value)} />
      <div className="flex gap-2">
        <Nut chay={() => duyet('duyet', y)} nhan={nhanDuyet} kieu="btn-primary" xacNhan={xacNhanDuyet} />
        <Nut chay={() => duyet('tra_ve', y)} nhan="Trả về kế toán" kieu="btn-danger" />
      </div>
    </div>
  );
}
