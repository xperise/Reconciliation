'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import s from './mlx.module.css';
import { buildStatement, outputNames } from '@/lib/mlx/buildStatement';
import { downloadBlob, loadExcelJS, XLSX_MIME } from '@/lib/mlx/download';
import { findRelated, HistoryNotReadyError, saveStatement, sha256, type StatementRecord } from '@/lib/mlx/history';
import { loadCustomers } from '@/lib/mlx/masterData';
import { matchCustomer } from '@/lib/mlx/matching';
import { inputToPeriod, kyLabel, periodLabel, periodToInput, periodToKy } from '@/lib/mlx/normalize';
import { parseRawFile } from '@/lib/mlx/parseRaw';
import type { MlxCustomer, ParsedRawFile, Period } from '@/lib/mlx/types';

type Item = {
  uid: string;
  fileName: string;
  status: 'reading' | 'ready' | 'error';
  error?: string;
  parsed?: ParsedRawFile;
  hash?: string;
  customerId: string; // '' = chưa chọn
  period: Period | null;
};

/** Trạng thái so với lịch sử */
type Kind =
  | { type: 'new' }
  | { type: 'replace'; old: StatementRecord[] } // cùng khách + kỳ nhưng file raw khác → thay bản cũ
  | { type: 'duplicate'; reason: string }; // đã xử lý trước đó / trùng trong lô

const fmt = new Intl.NumberFormat('vi-VN');

function previousMonth(): Period {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function ConverterView() {
  const [customers, setCustomers] = useState<MlxCustomer[]>([]);
  const [loadError, setLoadError] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [related, setRelated] = useState<StatementRecord[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [checking, setChecking] = useState(false);
  const [defaultPeriod, setDefaultPeriod] = useState<Period>(previousMonth());
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCustomers()
      .then(setCustomers)
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const byId = useMemo(() => new Map(customers.map((c) => [c.id as string, c])), [customers]);

  // Master data tải xong sau khi đã thả file → tự khớp lại các file chưa có khách
  useEffect(() => {
    if (!customers.length) return;
    setItems((prev) =>
      prev.map((it) =>
        it.status === 'ready' && !it.customerId && it.parsed
          ? { ...it, customerId: matchCustomer(it.parsed.companyFromFile, customers)?.id ?? '' }
          : it,
      ),
    );
  }, [customers]);

  // Tra lịch sử mỗi khi danh sách hash / kỳ thay đổi
  const hashes = useMemo(() => [...new Set(items.map((i) => i.hash).filter(Boolean) as string[])], [items]);
  const kys = useMemo(
    () => [...new Set(items.filter((i) => i.status === 'ready').map((i) => periodToKy(i.period ?? defaultPeriod)))],
    [items, defaultPeriod],
  );
  const lookupKey = `${[...hashes].sort().join(",")}|${[...kys].sort().join(",")}`;
  useEffect(() => {
    if (!hashes.length && !kys.length) {
      setRelated([]);
      return;
    }
    let cancelled = false;
    setChecking(true);
    findRelated(hashes, kys)
      .then((r) => {
        if (!cancelled) {
          setRelated(r);
          setHistoryError('');
        }
      })
      .catch((e: Error) => !cancelled && setHistoryError(e instanceof HistoryNotReadyError ? e.message : `Không tra được lịch sử: ${e.message}`))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey]);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => /\.xlsx$/i.test(f.name));
      const skipped = Array.from(files).length - list.length;
      setMessage(skipped ? { type: 'err', text: `Bỏ qua ${skipped} file không phải .xlsx` } : null);
      if (!list.length) return;

      const fresh: Item[] = list.map((f) => ({
        uid: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: f.name,
        status: 'reading',
        customerId: '',
        period: null,
      }));
      setItems((prev) => [...prev, ...fresh]);

      const ExcelJS = await loadExcelJS();
      await Promise.all(
        list.map(async (file, i) => {
          const uid = fresh[i].uid;
          try {
            const buf = await file.arrayBuffer();
            const [hash, parsed] = await Promise.all([sha256(buf.slice(0)), parseRawFile(ExcelJS, file.name, buf)]);
            const matched = matchCustomer(parsed.companyFromFile, customers);
            setItems((prev) =>
              prev.map((it) =>
                it.uid === uid
                  ? { ...it, status: 'ready', parsed, hash, customerId: matched?.id ?? '', period: parsed.periodFromFile }
                  : it,
              ),
            );
          } catch (e) {
            setItems((prev) =>
              prev.map((it) =>
                it.uid === uid ? { ...it, status: 'error', error: (e as Error).message || 'Không đọc được file' } : it,
              ),
            );
          }
        }),
      );
    },
    [customers],
  );

  const update = (uid: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)));

  // Phân loại từng file: mới / thay bản cũ / trùng
  const kinds = useMemo(() => {
    const map = new Map<string, Kind>();
    const seenInBatch = new Map<string, number>();
    items.forEach((it, idx) => {
      if (it.status !== 'ready' || !it.hash) return;
      const ky = periodToKy(it.period ?? defaultPeriod);
      const batchKey = `${it.hash}|${it.customerId}|${ky}`;
      if (seenInBatch.has(batchKey)) {
        map.set(it.uid, { type: 'duplicate', reason: `Trùng với file #${seenInBatch.get(batchKey)! + 1} trong lần tải này` });
        return;
      }
      seenInBatch.set(batchKey, idx);
      const same = related.find((r) => r.source_hash === it.hash && r.ky === ky && r.customer_id === it.customerId);
      if (same) {
        map.set(it.uid, {
          type: 'duplicate',
          reason: `Đã xử lý ngày ${new Date(same.created_at).toLocaleDateString('vi-VN')} (${same.file_name})`,
        });
        return;
      }
      const old = it.customerId ? related.filter((r) => r.customer_id === it.customerId && r.ky === ky) : [];
      map.set(it.uid, old.length ? { type: 'replace', old } : { type: 'new' });
    });
    return map;
  }, [items, related, defaultPeriod]);

  const isDup = (it: Item) => kinds.get(it.uid)?.type === 'duplicate';
  const active = items.filter((i) => !isDup(i)); // file mới (kể cả đang đọc/lỗi)
  const ready = active.filter((i) => i.status === 'ready');
  const matched = ready.filter((i) => i.customerId && byId.has(i.customerId));
  const dupCount = items.length - active.length;
  const totalRows = matched.reduce((n, i) => n + (i.parsed?.rows.length ?? 0), 0);
  const totalAmount = matched.reduce((n, i) => n + (i.parsed?.total ?? 0), 0);
  const blocking = active.filter((i) => i.status !== 'ready' || !i.customerId || !byId.has(i.customerId)).length;
  const canConfirm = matched.length > 0 && blocking === 0 && !busy && !checking && !historyError;

  async function confirm() {
    if (!canConfirm) return;
    setBusy(true);
    setMessage(null);
    const doneUids: string[] = [];
    const saveErrors: string[] = [];
    try {
      const ExcelJS = await loadExcelJS();
      const outputs: { fileName: string; buffer: ArrayBuffer }[] = [];

      for (const it of matched) {
        const customer = byId.get(it.customerId)!;
        const period = it.period ?? defaultPeriod;
        const out = await buildStatement(ExcelJS, { customer, period, rows: it.parsed!.rows });
        const kind = kinds.get(it.uid);
        try {
          await saveStatement(
            {
              customer_id: customer.id as string,
              ten_cong_ty: customer.ten_cong_ty,
              ten_viet_tat: customer.ten_viet_tat,
              ky: periodToKy(period),
              file_name: out.fileName,
              source_file_name: it.fileName,
              source_hash: it.hash!,
              row_count: it.parsed!.rows.length,
              total_amount: out.total,
              payable_amount: out.payable,
              buffer: out.buffer,
            },
            kind?.type === 'replace' ? kind.old : [],
          );
          doneUids.push(it.uid);
        } catch (e) {
          saveErrors.push(`${it.fileName}: ${(e as Error).message}`);
        }
        outputs.push({ fileName: out.fileName, buffer: out.buffer });
      }

      // Tránh trùng tên file trong ZIP
      const seen = new Map<string, number>();
      for (const o of outputs) {
        const n = seen.get(o.fileName) ?? 0;
        seen.set(o.fileName, n + 1);
        if (n > 0) o.fileName = o.fileName.replace(/\.xlsx$/i, ` (${n + 1}).xlsx`);
      }

      if (outputs.length === 1) {
        downloadBlob(outputs[0].buffer, outputs[0].fileName, XLSX_MIME);
      } else {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        outputs.forEach((o) => zip.file(o.fileName, o.buffer));
        const periods = new Set(matched.map((i) => periodLabel(i.period ?? defaultPeriod)));
        const suffix = periods.size === 1 ? [...periods][0] : new Date().toISOString().slice(0, 10);
        downloadBlob(await zip.generateAsync({ type: 'blob' }), `Bang_ke_MLX_${suffix}.zip`, 'application/zip');
      }

      // File đã lưu lịch sử + file trùng → rời khỏi danh sách
      const dupUids = items.filter(isDup).map((i) => i.uid);
      setItems((prev) => prev.filter((i) => !doneUids.includes(i.uid) && !dupUids.includes(i.uid)));

      const kyText = [...new Set(matched.map((i) => kyLabel(periodToKy(i.period ?? defaultPeriod))))].join(', ');
      setMessage(
        saveErrors.length
          ? { type: 'err', text: `Đã tải ${outputs.length} file nhưng ${saveErrors.length} file chưa lưu được vào lịch sử: ${saveErrors.join(' · ')}` }
          : { type: 'ok', text: `Đã tải ${outputs.length} file mới và lưu vào Lịch sử bảng kê (${kyText}).` },
      );
    } catch (e) {
      setMessage({ type: 'err', text: `Lỗi khi tạo file: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.page}>
      {loadError && <div className={`${s.banner} ${s.bannerErr}`}>{loadError}</div>}
      {historyError && <div className={`${s.banner} ${s.bannerErr}`}>{historyError}</div>}

      {/* KPI — chỉ tính file mới */}
      <div className={s.kpis}>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>File đã tải lên</div>
          <div className={s.kpiNum}>{active.length}</div>
          <div className={s.kpiSub}>
            file mới{dupCount ? ` · bỏ qua ${dupCount} file đã xử lý` : ''}
            {active.some((i) => i.status === 'error') ? ` · ${active.filter((i) => i.status === 'error').length} lỗi đọc` : ''}
          </div>
        </div>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>Đã khớp khách hàng</div>
          <div className={s.kpiNum}>
            {matched.length}/{ready.length}
          </div>
          <div className={s.kpiSub}>Master data: {customers.length} khách</div>
        </div>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>Tổng giao dịch</div>
          <div className={s.kpiNum}>{fmt.format(totalRows)}</div>
          <div className={s.kpiSub}>của {matched.length} file mới đã khớp</div>
        </div>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>Tổng số tiền</div>
          <div className={s.kpiNum}>{fmt.format(totalAmount)}</div>
          <div className={s.kpiSub}>trước chiết khấu, đã gồm VAT</div>
        </div>
      </div>

      {/* Upload */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <div>
            <div className={s.eyebrow}>Bước 1</div>
            <h2 className={s.title}>Tải lên file raw</h2>
          </div>
          <div className={s.row}>
            <span className={s.label}>Kỳ mặc định</span>
            <input
              type="month"
              className={s.input}
              value={periodToInput(defaultPeriod)}
              onChange={(e) => {
                const p = inputToPeriod(e.target.value);
                if (p) setDefaultPeriod(p);
              }}
            />
            <span className={s.note}>Dùng khi tên file không có kỳ</span>
          </div>
        </div>
        <div
          className={`${s.drop} ${dragOver ? s.dropActive : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <div className={s.dropTitle}>Kéo thả nhiều file .xlsx vào đây hoặc bấm để chọn</div>
          <div className={s.note} style={{ marginTop: 4 }}>
            Tên file theo dạng <b>Tên công ty_Kỳ</b>. File đã xử lý trước đó sẽ tự bỏ qua.
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Review */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <div>
            <div className={s.eyebrow}>Bước 2</div>
            <h2 className={s.title}>Kiểm tra & xác nhận</h2>
            <div className={s.note}>
              File tải về được lưu tự động vào <Link href="/mlx/lich-su">Lịch sử bảng kê</Link>
            </div>
          </div>
          <div className={s.row}>
            {checking && <span className={s.chip}>Đang kiểm tra lịch sử…</span>}
            {blocking > 0 && <span className={`${s.chip} ${s.chipWarn}`}>{blocking} file cần xử lý</span>}
            <button className={s.btn} onClick={() => setItems([])} disabled={!items.length || busy}>
              Xoá tất cả
            </button>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={confirm} disabled={!canConfirm}>
              {busy ? 'Đang tạo…' : `Xác nhận & tải file mới${matched.length ? ` (${matched.length})` : ''}`}
            </button>
          </div>
        </div>

        {message && (
          <div className={`${s.banner} ${message.type === 'ok' ? s.bannerOk : s.bannerErr}`} style={{ marginBottom: 12 }}>
            {message.text}
          </div>
        )}

        {items.length === 0 ? (
          <div className={s.empty}>Chưa có file nào.</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>File raw</th>
                  <th>Khách hàng (master data)</th>
                  <th>Kỳ</th>
                  <th style={{ textAlign: 'right' }}>Số dòng</th>
                  <th style={{ textAlign: 'right' }}>Tổng tiền</th>
                  <th>File xuất</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const customer = byId.get(it.customerId);
                  const period = it.period ?? defaultPeriod;
                  const kind = kinds.get(it.uid);
                  const dup = kind?.type === 'duplicate';
                  return (
                    <tr key={it.uid} className={dup ? s.rowDim : ''}>
                      <td className={s.muted}>{idx + 1}</td>
                      <td>
                        <div className={s.fileName} title={it.fileName}>{it.fileName}</div>
                        {it.parsed && <div className={s.note}>Tên đọc được: {it.parsed.companyFromFile}</div>}
                      </td>
                      <td>
                        <select
                          className={s.select}
                          style={{ maxWidth: 320 }}
                          value={it.customerId}
                          disabled={it.status !== 'ready' || busy}
                          onChange={(e) => update(it.uid, { customerId: e.target.value })}
                        >
                          <option value="">— Chọn khách hàng —</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.ten_viet_tat ? `${c.ten_viet_tat} - ` : ''}
                              {c.ten_cong_ty}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="month"
                          className={s.input}
                          value={periodToInput(period)}
                          disabled={busy}
                          onChange={(e) => update(it.uid, { period: inputToPeriod(e.target.value) })}
                        />
                        {!it.period && it.status === 'ready' && <div className={s.note}>theo kỳ mặc định</div>}
                      </td>
                      <td className={s.num}>{it.parsed ? fmt.format(it.parsed.rows.length) : '—'}</td>
                      <td className={s.num}>{it.parsed ? fmt.format(it.parsed.total) : '—'}</td>
                      <td className={s.muted}>{customer ? outputNames(customer, period).fileName : '—'}</td>
                      <td>
                        {it.status === 'reading' && <span className={s.chip}>Đang đọc…</span>}
                        {it.status === 'error' && (
                          <span className={`${s.chip} ${s.chipErr}`} title={it.error}>
                            Lỗi: {it.error}
                          </span>
                        )}
                        {it.status === 'ready' && !customer && <span className={`${s.chip} ${s.chipWarn}`}>Chưa khớp khách</span>}
                        {it.status === 'ready' && customer && kind?.type === 'new' && (
                          <span className={`${s.chip} ${s.chipOk}`}>Mới</span>
                        )}
                        {it.status === 'ready' && customer && kind?.type === 'replace' && (
                          <span className={`${s.chip} ${s.chipWarn}`} title="Kỳ này đã có bảng kê cho khách này từ file raw khác">
                            Mới · thay bản cũ
                          </span>
                        )}
                        {dup && (
                          <span className={s.chip} title={kind.reason}>
                            Đã xử lý – bỏ qua
                          </span>
                        )}
                        {dup && <div className={s.note}>{kind.reason}</div>}
                      </td>
                      <td>
                        <button
                          className={s.iconBtn}
                          title="Bỏ file"
                          disabled={busy}
                          onClick={() => setItems((prev) => prev.filter((x) => x.uid !== it.uid))}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
