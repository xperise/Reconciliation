'use client';
import { useState, useTransition } from 'react';
import { overrideTracking } from '@/app/actions';
import { STATUS_LABEL, TrackingStatus } from '@/lib/types';

/** Can thiệp thủ công — thay cho việc sửa tay trên Google Sheets (SOP mục 6.1). */
export function OverrideForm({ row }: { row: any }) {
  const [mo, setMo] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [threadId, setThreadId] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [resetRemind, setResetRemind] = useState(false);
  const [resetEscalate, setResetEscalate] = useState(false);
  const [loi, setLoi] = useState('');
  const [dangChay, start] = useTransition();

  function luu() {
    setLoi('');
    start(async () => {
      try {
        await overrideTracking(row.id, {
          status: (status || undefined) as TrackingStatus | undefined,
          thread_id: threadId || undefined,
          ghi_chu: ghiChu || undefined,
          reset_remind: resetRemind,
          ...(resetEscalate ? { escalate_level: 0, so_vong_remind: 0 } : {}),
        });
        setMo(false);
      } catch (e) {
        setLoi(e instanceof Error ? e.message : 'Không lưu được.');
      }
    });
  }

  if (!mo) {
    return <button className="btn btn-sm" onClick={() => setMo(true)}>Can thiệp</button>;
  }

  return (
    <div className="card p-3 space-y-2.5 w-[280px] text-left">
      <div>
        <label className="label" htmlFor={`st-${row.id}`}>Đổi trạng thái</label>
        <select id={`st-${row.id}`} className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Giữ nguyên</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`th-${row.id}`}>Thread ID mới</label>
        <input id={`th-${row.id}`} className="field mono" value={threadId}
               placeholder="Dán từ Gmail nếu mất thread"
               onChange={(e) => setThreadId(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor={`gc2-${row.id}`}>Lý do</label>
        <input id={`gc2-${row.id}`} className="field" value={ghiChu}
               onChange={(e) => setGhiChu(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={resetRemind} onChange={(e) => setResetRemind(e.target.checked)} />
        Cho phép nhắc lại ngay hôm nay
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={resetEscalate} onChange={(e) => setResetEscalate(e.target.checked)} />
        Đặt lại cấp escalate về 0
      </label>

      {loi && <p className="text-xs text-[var(--red)] m-0">{loi}</p>}

      <div className="flex gap-2 pt-1">
        <button className="btn btn-sm btn-primary" onClick={luu} disabled={dangChay}>Lưu</button>
        <button className="btn btn-sm" onClick={() => setMo(false)} disabled={dangChay}>Hủy</button>
      </div>
      <p className="text-[0.6875rem] text-[var(--muted)] m-0 leading-snug">
        Mọi can thiệp đều được ghi vào nhật ký kèm tên người thực hiện.
      </p>
    </div>
  );
}
