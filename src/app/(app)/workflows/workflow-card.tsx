'use client';
import { useState, useTransition } from 'react';
import { luuLichWorkflow } from '@/app/actions';

export function WorkflowCard({ wf, laAdmin }: { wf: any; laAdmin: boolean }) {
  const [enabled, setEnabled] = useState(wf.enabled);
  const [kind, setKind] = useState<'daily' | 'interval'>(wf.schedule_kind);
  const [hhmm, setHhmm] = useState(wf.run_at_hhmm ?? '08:00');
  const [phut, setPhut] = useState(wf.interval_minutes ?? 5);
  const [thongBao, setThongBao] = useState('');
  const [dangChay, start] = useTransition();

  function luu() {
    setThongBao('');
    start(async () => {
      try {
        await luuLichWorkflow(wf.key, {
          enabled, schedule_kind: kind, run_at_hhmm: hhmm, interval_minutes: Number(phut),
        });
        setThongBao('Đã lưu lịch chạy.');
      } catch (e) {
        setThongBao(e instanceof Error ? e.message : 'Không lưu được.');
      }
    });
  }

  function chayNgay() {
    setThongBao('Đang chạy…');
    start(async () => {
      const res = await fetch('/api/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: wf.key }),
      });
      const data = await res.json();
      setThongBao(res.ok ? data.summary : (data.error ?? 'Chạy thất bại.'));
    });
  }

  const lanCuoi = wf.last_run_at
    ? new Date(wf.last_run_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : 'chưa chạy lần nào';

  return (
    <article className="card overflow-hidden">
      <header className="px-4 py-3 border-b border-[var(--line)] flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="mono text-[var(--muted)] uppercase">{wf.key}</span>
            <h2 className="text-sm font-bold m-0">{wf.ten}</h2>
          </div>
          <p className="text-xs text-[var(--muted)] mt-1 mb-0 leading-relaxed max-w-lg">{wf.mo_ta}</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold whitespace-nowrap cursor-pointer">
          <input type="checkbox" checked={enabled} disabled={!laAdmin}
                 onChange={(e) => setEnabled(e.target.checked)} />
          {enabled ? 'Đang bật' : 'Đang tắt'}
        </label>
      </header>

      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[150px]">
            <label className="label" htmlFor={`k-${wf.key}`}>Kiểu lịch</label>
            <select id={`k-${wf.key}`} className="field" value={kind} disabled={!laAdmin}
                    onChange={(e) => setKind(e.target.value as 'daily' | 'interval')}>
              <option value="daily">Mỗi ngày một lần</option>
              <option value="interval">Lặp theo phút</option>
            </select>
          </div>

          {kind === 'daily' ? (
            <div className="w-[120px]">
              <label className="label" htmlFor={`t-${wf.key}`}>Giờ chạy</label>
              <input id={`t-${wf.key}`} type="time" className="field tnum" value={hhmm}
                     disabled={!laAdmin} onChange={(e) => setHhmm(e.target.value)} />
            </div>
          ) : (
            <div className="w-[140px]">
              <label className="label" htmlFor={`i-${wf.key}`}>Mỗi bao nhiêu phút</label>
              <input id={`i-${wf.key}`} type="number" min={1} max={1440} className="field tnum"
                     value={phut} disabled={!laAdmin}
                     onChange={(e) => setPhut(Number(e.target.value))} />
            </div>
          )}

          {laAdmin && (
            <>
              <button className="btn btn-primary" onClick={luu} disabled={dangChay}>Lưu lịch</button>
              <button className="btn" onClick={chayNgay} disabled={dangChay}>Chạy thử ngay</button>
            </>
          )}
        </div>

        <div className="text-xs text-[var(--muted)] leading-relaxed border-t border-[var(--line-soft)] pt-3">
          <p className="m-0">Lần chạy gần nhất: <span className="tnum">{lanCuoi}</span></p>
          {wf.last_summary && <p className="m-0 mt-1 text-[var(--ink-soft)]">{wf.last_summary}</p>}
        </div>

        {thongBao && (
          <p className="text-sm bg-[var(--teal-wash)] text-[var(--teal-deep)] px-3 py-2 rounded-md m-0">
            {thongBao}
          </p>
        )}
      </div>
    </article>
  );
}
