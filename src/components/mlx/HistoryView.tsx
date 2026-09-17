'use client';

import { useEffect, useMemo, useState } from 'react';
import s from './mlx.module.css';
import { downloadBlob, XLSX_MIME } from '@/lib/mlx/download';
import {
  deleteStatements,
  downloadStatement,
  HistoryNotReadyError,
  listPeriods,
  listStatements,
  type PeriodSummary,
  type StatementRecord,
} from '@/lib/mlx/history';
import { companyKey, kyLabel, kyShort } from '@/lib/mlx/normalize';

const fmt = new Intl.NumberFormat('vi-VN');
const dt = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function HistoryView() {
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [ky, setKy] = useState('');
  const [records, setRecords] = useState<StatementRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [notReady, setNotReady] = useState('');

  async function loadPeriods(keepKy?: string) {
    try {
      const p = await listPeriods();
      setPeriods(p);
      const next = keepKy && p.some((x) => x.ky === keepKy) ? keepKy : p[0]?.ky ?? '';
      setKy(next);
      if (!next) {
        setRecords([]);
        setLoading(false);
      }
    } catch (e) {
      if (e instanceof HistoryNotReadyError) setNotReady(e.message);
      else setMsg({ type: 'err', text: (e as Error).message });
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPeriods();
  }, []);

  useEffect(() => {
    if (!ky) return;
    setLoading(true);
    setSelected(new Set());
    listStatements(ky)
      .then(setRecords)
      .catch((e: Error) => setMsg({ type: 'err', text: e.message }))
      .finally(() => setLoading(false));
  }, [ky]);

  const q = companyKey(search);
  const visible = useMemo(
    () =>
      records.filter(
        (r) => !q || [r.ten_cong_ty, r.ten_viet_tat, r.file_name, r.source_file_name].some((v) => companyKey(v).includes(q)),
      ),
    [records, q],
  );

  const current = periods.find((p) => p.ky === ky);
  const chosen = records.filter((r) => selected.has(r.id));
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function downloadOne(r: StatementRecord) {
    try {
      downloadBlob(await downloadStatement(r), r.file_name, XLSX_MIME);
    } catch (e) {
      setMsg({ type: 'err', text: `Không tải được ${r.file_name}: ${(e as Error).message}` });
    }
  }

  async function downloadMany(list: StatementRecord[], zipName: string) {
    if (busy || !list.length) return;
    if (list.length === 1) return downloadOne(list[0]);
    setBusy(true);
    setMsg(null);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const seen = new Map<string, number>();
      for (const r of list) {
        const n = seen.get(r.file_name) ?? 0;
        seen.set(r.file_name, n + 1);
        const name = n ? r.file_name.replace(/\.xlsx$/i, ` (${n + 1}).xlsx`) : r.file_name;
        zip.file(name, await downloadStatement(r));
      }
      downloadBlob(await zip.generateAsync({ type: 'blob' }), zipName, 'application/zip');
    } catch (e) {
      setMsg({ type: 'err', text: `Tải thất bại: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function remove(list: StatementRecord[]) {
    if (busy || !list.length) return;
    const text =
      list.length === 1
        ? `Xoá file "${list[0].file_name}" khỏi lịch sử? File sẽ bị xoá vĩnh viễn.`
        : `Xoá ${list.length} file khỏi lịch sử? Các file sẽ bị xoá vĩnh viễn.`;
    if (!window.confirm(text)) return;
    setBusy(true);
    setMsg(null);
    try {
      await deleteStatements(list);
      const ids = new Set(list.map((r) => r.id));
      setRecords((prev) => prev.filter((r) => !ids.has(r.id)));
      setSelected(new Set());
      await loadPeriods(ky);
      setMsg({ type: 'ok', text: `Đã xoá ${list.length} file.` });
    } catch (e) {
      setMsg({ type: 'err', text: `Xoá thất bại: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  if (notReady) {
    return (
      <div className={s.page}>
        <div className={`${s.banner} ${s.bannerErr}`}>{notReady}</div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      {/* Chọn kỳ */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <div>
            <div className={s.eyebrow}>Lịch sử bảng kê</div>
            <h2 className={s.title}>Chọn kỳ</h2>
          </div>
          <span className={s.note}>{periods.length} kỳ đã lưu</span>
        </div>
        {periods.length === 0 && !loading ? (
          <div className={s.empty}>Chưa có bảng kê nào. File sẽ xuất hiện ở đây sau khi bạn bấm “Xác nhận & tải”.</div>
        ) : (
          <div className={s.periodChips}>
            {periods.map((p) => (
              <button
                key={p.ky}
                className={`${s.periodChip} ${p.ky === ky ? s.periodChipActive : ''}`}
                onClick={() => setKy(p.ky)}
              >
                <span>{kyLabel(p.ky)}</span>
                <span className={s.periodCount}>{p.file_count} file</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {current && (
        <>
          {/* KPI theo kỳ */}
          <div className={s.kpis}>
            <div className={s.kpi}>
              <div className={s.kpiLabel}>Số file</div>
              <div className={s.kpiNum}>{fmt.format(current.file_count)}</div>
              <div className={s.kpiSub}>{kyLabel(current.ky)}</div>
            </div>
            <div className={s.kpi}>
              <div className={s.kpiLabel}>Số khách hàng</div>
              <div className={s.kpiNum}>{fmt.format(current.customer_count)}</div>
              <div className={s.kpiSub}>có bảng kê trong kỳ</div>
            </div>
            <div className={s.kpi}>
              <div className={s.kpiLabel}>Tổng giao dịch</div>
              <div className={s.kpiNum}>{fmt.format(current.row_count)}</div>
              <div className={s.kpiSub}>trên {current.file_count} file</div>
            </div>
            <div className={s.kpi}>
              <div className={s.kpiLabel}>Tổng số tiền</div>
              <div className={s.kpiNum}>{fmt.format(current.total_amount)}</div>
              <div className={s.kpiSub}>Thanh toán sau CK: {fmt.format(current.payable_amount)}</div>
            </div>
          </div>

          {/* Danh sách file */}
          <div className={s.card}>
            <div className={s.cardHead}>
              <div>
                <div className={s.eyebrow}>{kyLabel(current.ky)}</div>
                <h2 className={s.title}>File bảng kê</h2>
                <div className={s.note}>Cập nhật gần nhất: {dt(current.last_created_at)}</div>
              </div>
              <div className={s.row}>
                <input
                  className={s.input}
                  placeholder="Tìm khách, tên file…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button
                  className={s.btn}
                  disabled={busy || !records.length}
                  onClick={() => downloadMany(records, `Bang_ke_MLX_${kyShort(ky)}.zip`)}
                >
                  Tải cả kỳ
                </button>
                <button
                  className={s.btn}
                  disabled={busy || !chosen.length}
                  onClick={() => downloadMany(chosen, `Bang_ke_MLX_${kyShort(ky)}_chon.zip`)}
                >
                  Tải đã chọn{chosen.length ? ` (${chosen.length})` : ''}
                </button>
                <button className={`${s.btn} ${s.btnDanger}`} disabled={busy || !chosen.length} onClick={() => remove(chosen)}>
                  Xoá đã chọn{chosen.length ? ` (${chosen.length})` : ''}
                </button>
              </div>
            </div>

            {msg && (
              <div className={`${s.banner} ${msg.type === 'ok' ? s.bannerOk : s.bannerErr}`} style={{ marginBottom: 12 }}>
                {msg.text}
              </div>
            )}

            {loading ? (
              <div className={s.empty}>Đang tải…</div>
            ) : visible.length === 0 ? (
              <div className={s.empty}>Không có file phù hợp.</div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              visible.forEach((r) => (allVisibleSelected ? next.delete(r.id) : next.add(r.id)));
                              return next;
                            })
                          }
                        />
                      </th>
                      <th>Khách hàng</th>
                      <th>File bảng kê</th>
                      <th style={{ textAlign: 'right' }}>Số dòng</th>
                      <th style={{ textAlign: 'right' }}>Tổng tiền</th>
                      <th style={{ textAlign: 'right' }}>Thanh toán</th>
                      <th>File raw</th>
                      <th>Tạo lúc</th>
                      <th>Người tạo</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                        </td>
                        <td style={{ minWidth: 240 }}>
                          <div style={{ fontWeight: 600 }}>{r.ten_viet_tat || '—'}</div>
                          <div className={s.note}>{r.ten_cong_ty}</div>
                        </td>
                        <td className={s.fileName} title={r.file_name}>{r.file_name}</td>
                        <td className={s.num}>{fmt.format(r.row_count)}</td>
                        <td className={s.num}>{fmt.format(r.total_amount)}</td>
                        <td className={s.num}>{fmt.format(r.payable_amount)}</td>
                        <td className={`${s.muted} ${s.fileName}`} title={r.source_file_name}>{r.source_file_name}</td>
                        <td className={`${s.muted} ${s.num}`} style={{ textAlign: 'left' }}>{dt(r.created_at)}</td>
                        <td className={s.muted}>{r.created_by_email ?? '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className={s.linkBtn} disabled={busy} onClick={() => downloadOne(r)}>
                            Tải lại
                          </button>
                          <button className={`${s.linkBtn} ${s.linkDanger}`} disabled={busy} onClick={() => remove([r])}>
                            Xoá
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
