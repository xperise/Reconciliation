'use client';
import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { luuLichWorkflow } from '@/app/actions';

export function WorkflowCard({ wf, laAdmin }: { wf: any; laAdmin: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean>(wf.enabled);
  const [kind, setKind] = useState<'daily' | 'interval'>(wf.schedule_kind);
  const [hhmm, setHhmm] = useState(wf.run_at_hhmm ?? '08:00');
  const [phut, setPhut] = useState(wf.interval_minutes ?? 5);
  const [thongBao, setThongBao] = useState('');
  const [loi, setLoi] = useState('');
  const [dangChay, start] = useTransition();

  // Khi máy chủ trả về dữ liệu mới, kéo state cục bộ theo. Không có đoạn này
  // thì ô nhập giữ giá trị cũ và người dùng tưởng lưu bị mất.
  useEffect(() => {
    setEnabled(wf.enabled);
    setKind(wf.schedule_kind);
    setHhmm(wf.run_at_hhmm ?? '08:00');
    setPhut(wf.interval_minutes ?? 5);
  }, [wf.enabled, wf.schedule_kind, wf.run_at_hhmm, wf.interval_minutes]);

  /**
   * Ghi cấu hình xuống database.
   *
   * Công tắc bật/tắt gọi thẳng hàm này ngay khi bấm, không đợi nút Lưu. Một
   * công tắc đã gạt mà chưa có hiệu lực là thứ nguy hiểm: người dùng tin là
   * đã tắt rồi rời trang, trong khi hệ thống vẫn gửi thư cho khách.
   */
  function ghi(patch: Partial<{
    enabled: boolean; kind: 'daily' | 'interval'; hhmm: string; phut: number;
  }>, nhanNgay = false) {
    const moi = {
      enabled: patch.enabled ?? enabled,
      schedule_kind: patch.kind ?? kind,
      run_at_hhmm: patch.hhmm ?? hhmm,
      interval_minutes: Number(patch.phut ?? phut),
    };

    setLoi('');
    setThongBao(nhanNgay ? 'Đang lưu…' : '');

    start(async () => {
      try {
        const kq = await luuLichWorkflow(wf.key, moi);
        setThongBao(kq?.xacNhan ?? 'Đã lưu lịch chạy.');
        router.refresh();
      } catch (e) {
        // Ghi hỏng thì trả công tắc về đúng giá trị đang có trong database,
        // để màn hình không nói dối về trạng thái thật của hệ thống
        setEnabled(wf.enabled);
        setThongBao('');
        setLoi(e instanceof Error ? e.message : 'Không lưu được.');
      }
    });
  }

  function batTat(v: boolean) {
    setEnabled(v);          // cập nhật lạc quan cho công tắc phản hồi tức thì
    ghi({ enabled: v }, true);
  }

  function chayNgay() {
    setThongBao('Đang chạy…');
    setLoi('');
    start(async () => {
      const res = await fetch('/api/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: wf.key }),
      });
      const data = await res.json();
      if (res.ok) setThongBao(data.summary);
      else setLoi(data.error ?? 'Chạy thất bại.');
      router.refresh();
    });
  }

  const lanCuoi = wf.last_run_at
    ? new Date(wf.last_run_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : 'chưa chạy lần nào';

  // Lịch đang khai khác với lịch đã lưu — nhắc bấm Lưu
  const chuaLuu = laAdmin && (
    kind !== wf.schedule_kind
    || (kind === 'daily' && hhmm !== (wf.run_at_hhmm ?? '08:00'))
    || (kind === 'interval' && Number(phut) !== (wf.interval_minutes ?? 5))
  );

  return (
    <article className="card overflow-hidden" data-status={enabled ? undefined : 'watch'}>
      <header className="card-hd flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="mono text-[var(--ink-3)] uppercase text-[11px]">{wf.key}</span>
            <h2 className="card-title">{wf.ten}</h2>
          </div>
          <p className="card-note m-0 mt-1 max-w-[70ch] leading-relaxed">{wf.mo_ta}</p>
        </div>

        <label className="flex items-center gap-2 text-[12.5px] font-semibold whitespace-nowrap cursor-pointer">
          <input type="checkbox" checked={enabled} disabled={!laAdmin || dangChay}
                 onChange={(e) => batTat(e.target.checked)} />
          <span style={{ color: enabled ? 'var(--stable)' : 'var(--ink-3)' }}>
            {enabled ? 'Đang bật' : 'Đang tắt'}
          </span>
        </label>
      </header>

      <div className="card-pad flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div style={{ minWidth: 150 }}>
            <label className="label" htmlFor={`k-${wf.key}`}>Kiểu lịch</label>
            <select id={`k-${wf.key}`} className="field" value={kind} disabled={!laAdmin}
                    onChange={(e) => setKind(e.target.value as 'daily' | 'interval')}>
              <option value="daily">Mỗi ngày một lần</option>
              <option value="interval">Lặp theo phút</option>
            </select>
          </div>

          {kind === 'daily' ? (
            <div style={{ width: 120 }}>
              <label className="label" htmlFor={`t-${wf.key}`}>Giờ chạy</label>
              <input id={`t-${wf.key}`} type="time" className="field mono" value={hhmm}
                     disabled={!laAdmin} onChange={(e) => setHhmm(e.target.value)} />
            </div>
          ) : (
            <div style={{ width: 150 }}>
              <label className="label" htmlFor={`i-${wf.key}`}>Mỗi bao nhiêu phút</label>
              <input id={`i-${wf.key}`} type="number" min={1} max={1440} className="field mono"
                     value={phut} disabled={!laAdmin}
                     onChange={(e) => setPhut(Number(e.target.value))} />
            </div>
          )}

          {laAdmin && (
            <>
              <button className={`btn ${chuaLuu ? 'btn-primary' : ''}`}
                      onClick={() => ghi({}, true)} disabled={dangChay || !chuaLuu}>
                {chuaLuu ? 'Lưu lịch' : 'Đã lưu'}
              </button>
              <button className="btn" onClick={chayNgay} disabled={dangChay}>Chạy thử ngay</button>
            </>
          )}
        </div>

        {chuaLuu && (
          <p className="callout callout-high m-0">
            Lịch chạy vừa đổi nhưng chưa lưu. Công tắc bật/tắt có hiệu lực ngay,
            còn giờ chạy phải bấm <strong>Lưu lịch</strong>.
          </p>
        )}

        <div className="text-[11.5px] text-[var(--ink-3)] leading-relaxed"
             style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 10 }}>
          <p className="m-0">Lần chạy gần nhất: <span className="mono">{lanCuoi}</span></p>
          {wf.last_summary && (
            <p className="m-0 mt-1 text-[var(--ink-2)]">{wf.last_summary}</p>
          )}
        </div>

        {thongBao && <p className="callout callout-stable m-0">{thongBao}</p>}
        {loi && <p role="alert" className="callout callout-critical m-0">{loi}</p>}
      </div>
    </article>
  );
}
