'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { danhDauDaDoc, danhDauDocHet } from '@/app/actions';

const MUC_TONE: Record<string, string> = {
  khan: 'pill-critical', canh_bao: 'pill-high', info: 'pill-neutral',
};

export function Bell({ items, userId }: { items: any[]; userId: string }) {
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const chuaDoc = items.filter((n) => !(n.da_doc_boi ?? []).includes(userId));

  useEffect(() => {
    if (!mo) return;
    const ngoai = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMo(false);
    };
    document.addEventListener('mousedown', ngoai);
    return () => document.removeEventListener('mousedown', ngoai);
  }, [mo]);

  const gio = (s: string) => {
    const phut = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
    if (phut < 1) return 'vừa xong';
    if (phut < 60) return `${phut} phút trước`;
    if (phut < 1440) return `${Math.floor(phut / 60)} giờ trước`;
    return new Date(s).toLocaleDateString('vi-VN');
  };

  return (
    <div className="bell-wrap" ref={ref}>
      <button className="bell-btn" onClick={() => setMo(!mo)}
              aria-label={`Thông báo${chuaDoc.length ? `, ${chuaDoc.length} chưa đọc` : ''}`}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {chuaDoc.length > 0 && <span className="bell-dot">{chuaDoc.length > 9 ? '9+' : chuaDoc.length}</span>}
      </button>

      {mo && (
        <div className="bell-panel">
          <div className="bell-hd">
            <span className="eyebrow">Thông báo</span>
            {chuaDoc.length > 0 && (
              <button className="btn btn-sm" disabled={false}
                      onClick={() => start(async () => { await danhDauDocHet(); router.refresh(); })}>
                Đánh dấu đã đọc hết
              </button>
            )}
          </div>

          <div className="bell-list">
            {items.length ? items.map((n) => {
              const daDoc = (n.da_doc_boi ?? []).includes(userId);
              return (
                <a
                  key={n.id}
                  href={n.lien_ket ?? '#'}
                  className="bell-item" data-unread={!daDoc}
                  onClick={() => start(async () => { await danhDauDaDoc(n.id); })}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`pill ${MUC_TONE[n.muc] ?? 'pill-neutral'} !text-[10px] !py-0`}>
                      {n.muc === 'khan' ? 'Khẩn' : n.muc === 'canh_bao' ? 'Cảnh báo' : 'Thông tin'}
                    </span>
                    <span className="text-[10.5px] text-[var(--ink-3)] whitespace-nowrap">
                      {gio(n.created_at)}
                    </span>
                  </div>
                  <p className="text-[12.5px] font-semibold m-0 mt-1 leading-snug">{n.tieu_de}</p>
                  {n.noi_dung && (
                    <p className="text-[11.5px] text-[var(--ink-3)] m-0 mt-0.5 leading-snug">{n.noi_dung}</p>
                  )}
                </a>
              );
            }) : (
              <p className="empty !py-8">
                <strong>Chưa có thông báo nào.</strong>
                Việc cần bạn xử lý sẽ hiện ở đây.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
