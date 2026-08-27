import Link from 'next/link';
import { loadDashboard, execSummary, Metric } from '@/lib/metrics';
import { currentPeriod, nowInVN, daysBetween } from '@/lib/period';
import { StatusBadge } from '@/components/StatusBadge';
import { SlaRail } from '@/components/SlaRail';
import { TrackingStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TONE_VAR: Record<string, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  watch: 'var(--watch)',
  stable: 'var(--stable)',
  neutral: 'var(--ink-3)',
};

function KpiCard({ m }: { m: Metric }) {
  const color = TONE_VAR[m.tone];
  const body = (
    <>
      <span className="kpi-label">{m.label}</span>
      <span className="kpi-num" style={{ color }}>{m.display}</span>
      <span className="kpi-sub">{m.sub}</span>
      <span className="kpi-meter">
        {m.meter !== undefined && (
          <i style={{ width: `${Math.min(m.meter * 100, 100)}%`, background: color }} />
        )}
      </span>
    </>
  );

  if (m.href) {
    return <Link href={m.href} className="kpi" style={{ textDecoration: 'none' }}>{body}</Link>;
  }
  return <div className="kpi">{body}</div>;
}

function Tier({ eyebrow, title, note, metrics }: {
  eyebrow: string; title: string; note: string; metrics: Metric[];
}) {
  return (
    <section className="mb-4">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
        <div>
          <p className="eyebrow" style={{ color: 'var(--accent)' }}>{eyebrow}</p>
          <h2 className="card-title mt-0.5">{title}</h2>
        </div>
        <p className="card-note m-0 text-right max-w-[52ch]">{note}</p>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {metrics.map((m) => <KpiCard key={m.key} m={m} />)}
      </div>
    </section>
  );
}

export default async function Dashboard() {
  const ky = currentPeriod();
  const d = await loadDashboard(ky);
  const today = nowInVN().isoDate;
  const gioMax = d.bottleneck[0]?.gio || 1;

  return (
    <>
      {/* ---- Tóm tắt điều hành ---- */}
      <section className="exec mb-4">
        <p className="eyebrow mb-1.5">Tóm tắt kỳ {ky}</p>
        <p className="exec-text">{execSummary(d)}</p>

        <div className="flex flex-wrap gap-2 mt-3 no-print">
          <Link href="/tracking?loc=qua_han" className="chip" data-zero={d.overdue.length === 0}>
            Quá hạn <span className="chip-count">{d.overdue.length}</span>
          </Link>
          <Link href="/tracking?loc=can_han" className="chip" data-zero={d.atRisk.length === 0}>
            Cận hạn 24 giờ <span className="chip-count">{d.atRisk.length}</span>
          </Link>
          <Link href="/tracking?status=can_xu_ly_tay" className="chip">
            Cần xử lý tay
          </Link>
          <Link href="/approvals" className="chip">Hàng chờ duyệt</Link>
        </div>
      </section>

      <Tier
        eyebrow="Tầng 1 — Chiến lược"
        title="Hiệu quả tự động hoá và dòng tiền"
        note="Quy trình đang giúp thu tiền nhanh hay chậm, và bao nhiêu phần trăm chạy được mà không cần người chạm vào."
        metrics={d.tier1}
      />

      <Tier
        eyebrow="Tầng 2 — Vận hành"
        title="Nút thắt và hiệu suất"
        note="Bóc tách trách nhiệm giữa nội bộ và đối tác, chỉ ra khâu đang làm chậm cả quy trình."
        metrics={d.tier2}
      />

      <Tier
        eyebrow="Tầng 3 — Hành động"
        title="Cảnh báo cần can thiệp"
        note="Báo trước khi số liệu chuyển đỏ, để còn kịp gọi điện hối thúc."
        metrics={d.tier3}
      />

      {/* ---- Hai cột phân tích ---- */}
      <div className="grid gap-4 mb-4 dash-split">
        <div className="flex flex-col gap-4">
          <section className="card">
            <div className="card-hd">
              <p className="eyebrow">Phân tích</p>
              <h2 className="card-title mt-0.5">Thời gian nằm lại mỗi trạng thái</h2>
              <p className="card-note m-0 mt-1">Trung bình số giờ trước khi chuyển tiếp, tính trên kỳ {ky}.</p>
            </div>
            {d.bottleneck.length ? (
              <ul className="list-none m-0 p-0">
                {d.bottleneck.map((b, i) => (
                  <li key={b.status} className="px-5 py-2.5 border-b border-[var(--line-soft)] last:border-0">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <StatusBadge status={b.status as TrackingStatus} />
                        {i === 0 && (
                          <span className="pill pill-critical !text-[10px] !px-1.5 !py-0">Nút thắt</span>
                        )}
                      </span>
                      <span className="mono text-[12.5px] font-semibold whitespace-nowrap">
                        {b.gio.toFixed(1)}h
                        <span className="text-[var(--ink-3)] font-normal"> · {b.soLan} lượt</span>
                      </span>
                    </div>
                    <div className="kpi-meter">
                      <i style={{
                        width: `${(b.gio / gioMax) * 100}%`,
                        background: i === 0 ? 'var(--critical)' : 'var(--ink-3)',
                      }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">
                <strong>Chưa đủ dữ liệu.</strong>
                Cần ít nhất một kỳ đi qua vài trạng thái mới tính được.
              </p>
            )}
          </section>

          <section className="card">
            <div className="card-hd">
              <p className="eyebrow">Trách nhiệm</p>
              <h2 className="card-title mt-0.5">Thời gian chờ thuộc về ai</h2>
            </div>
            {d.rootCause.length ? (
              <div className="p-5">
                <div className="flex h-7 rounded-[var(--r-sm)] overflow-hidden mb-3">
                  {d.rootCause.map((r) => (
                    <div key={r.nguon} title={`${r.nguon}: ${Math.round(r.gio)} giờ`}
                      style={{
                        width: `${r.tyLe}%`,
                        background: r.nguon.includes('Nội bộ') ? 'var(--critical)' : 'var(--watch)',
                      }} />
                  ))}
                </div>
                {d.rootCause.map((r) => (
                  <div key={r.nguon} className="flex items-center justify-between text-[12.5px] py-1">
                    <span className="flex items-center gap-2">
                      <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{
                        background: r.nguon.includes('Nội bộ') ? 'var(--critical)' : 'var(--watch)',
                      }} />
                      {r.nguon}
                    </span>
                    <span className="mono font-semibold">
                      {Math.round(r.tyLe)}%
                      <span className="text-[var(--ink-3)] font-normal"> · {Math.round(r.gio)}h</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">
                <strong>Chưa đủ dữ liệu.</strong>
                Số liệu xuất hiện sau khi có kỳ chuyển trạng thái.
              </p>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="card" data-status={d.overdue.length ? 'critical' : undefined}>
            <div className="card-hd flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Hành động</p>
                <h2 className="card-title mt-0.5">Quá hạn và cận hạn</h2>
              </div>
              <Link href="/tracking" className="btn btn-sm no-print">Mở Theo dõi kỳ</Link>
            </div>

            {d.overdue.length + d.atRisk.length ? (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Nhóm</th><th>Kỳ</th><th>Trạng thái</th>
                      <th>Escalate</th><th className="text-right">Hạn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...d.overdue, ...d.atRisk].slice(0, 12).map((r: any) => {
                      const tre = r.han_chap_nhan ? daysBetween(r.han_chap_nhan, today) : 0;
                      return (
                        <tr key={r.id}>
                          <td>
                            <span className="font-semibold">{r.ten_nhom}</span>
                            <span className="sub mono">{r.ma_he_thong}</span>
                          </td>
                          <td className="mono text-[12px]">{r.ky_doi_soat}</td>
                          <td><StatusBadge status={r.status} /></td>
                          <td><SlaRail level={r.escalate_level} loops={r.so_vong_remind} /></td>
                          <td className="text-right mono text-[12px] whitespace-nowrap font-semibold"
                              style={{ color: tre > 0 ? 'var(--critical)' : 'var(--high)' }}>
                            {tre > 0 ? `trễ ${tre}n` : tre === 0 ? 'hôm nay' : 'ngày mai'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">
                <strong>Không có kỳ nào quá hạn hay cận hạn.</strong>
                Mọi nhóm đang trong hạn xác nhận.
              </p>
            )}
          </section>

          <section className="card">
            <div className="card-hd">
              <p className="eyebrow">Tuân thủ</p>
              <h2 className="card-title mt-0.5">SLA thực tế so với cam kết</h2>
              <p className="card-note m-0 mt-1">Số ngày khách thực sự dùng để xác nhận, đối chiếu hợp đồng.</p>
            </div>
            {d.slaCompare.length ? (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Nhóm</th><th>Kỳ</th>
                      <th className="text-right">Thực tế</th>
                      <th className="text-right">Cam kết</th>
                      <th className="text-right">Lệch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.slaCompare.map((s, i) => (
                      <tr key={`${s.nhom}-${s.ky}-${i}`}>
                        <td className="font-semibold">{s.nhom}</td>
                        <td className="mono text-[12px]">{s.ky}</td>
                        <td className="text-right mono text-[12px]">{s.thucTe}n</td>
                        <td className="text-right mono text-[12px] text-[var(--ink-3)]">{s.camKet}n</td>
                        <td className="text-right mono text-[12px] font-semibold"
                            style={{ color: s.lech > 0 ? 'var(--critical)' : 'var(--stable)' }}>
                          {s.lech > 0 ? `+${s.lech}` : s.lech}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">
                <strong>Chưa có kỳ nào chốt xong.</strong>
                Bảng này so sánh ngày xác nhận thực tế với SLA khai trong Master Data.
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
