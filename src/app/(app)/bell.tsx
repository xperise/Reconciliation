'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { danhDauDaDoc, danhDauDocHet } from '@/app/actions';

const MUC_TONE: Record<string, string> = {
  khan: 'pill-critical', canh_bao: 'pill-high', info: 'pill-neutral',
};

type XpayItem = { kind: string; title: string; body: string; kh: string; urgent?: boolean };
const homNayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
/* Việc hôm nay XPAY (dashboard Mobility tính và gửi lên): meeting hôm nay, next step, khách hứa active… */
function useXpayToday() {
  const [x, setX] = useState<{ pic: string; items: XpayItem[] }>({ pic: '', items: [] });
  useEffect(() => {
    const doc = () => { try { const o = JSON.parse(localStorage.getItem('xpay_today') || 'null'); setX(o && o.date === homNayVN() ? { pic: o.pic || '', items: o.items || [] } : { pic: '', items: [] }); } catch { setX({ pic: '', items: [] }); } };
    doc(); window.addEventListener('xpay-today', doc); window.addEventListener('storage', doc);
    return () => { window.removeEventListener('xpay-today', doc); window.removeEventListener('storage', doc); };
  }, []);
  return x;
}

export function Bell({ items, userId }: { items: any[]; userId: string }) {
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const xp = useXpayToday();
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
        {chuaDoc.length + xp.items.length > 0 && <span className="bell-dot">{chuaDoc.length + xp.items.length > 9 ? '9+' : chuaDoc.length + xp.items.length}</span>}
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
            {xp.items.length > 0 && (
              <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent, #0d6e63)' }}>
                Hôm nay cần làm · XPAY{xp.pic ? ` · ${xp.pic}` : ''}
              </div>
            )}
            {xp.items.map((n, i) => (
              <a key={'xp' + i} href={n.kh ? `/dashboard/mobility/progress/input?kh=${encodeURIComponent(n.kh)}` : '/dashboard/mobility/progress/input'} className="bell-item" data-unread>
                <div className="flex items-start justify-between gap-2">
                  <span className={`pill ${n.urgent ? 'pill-critical' : 'pill-high'} !text-[10px] !py-0`}>{n.urgent ? 'Quá hạn' : 'Hôm nay'}</span>
                </div>
                <p className="text-[12.5px] font-semibold m-0 mt-1 leading-snug">{n.title}</p>
                {n.body && <p className="text-[11.5px] text-[var(--ink-3)] m-0 mt-0.5 leading-snug">{n.body}</p>}
              </a>
            ))}
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
            }) : xp.items.length ? null : (
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
