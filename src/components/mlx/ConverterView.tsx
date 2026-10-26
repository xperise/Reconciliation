'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import s from './mlx.module.css';
import CustomerPicker from './CustomerPicker';
import { buildStatement, outputNames } from '@/lib/mlx/buildStatement';
import { downloadBlob, loadExcelJS, XLSX_MIME } from '@/lib/mlx/download';
import { findRelated, HistoryNotReadyError, saveStatement, sha256, type StatementRecord } from '@/lib/mlx/history';
import { loadCustomers } from '@/lib/mlx/masterData';
import { hintsFromFile, matchCustomer } from '@/lib/mlx/matching';
import { companyKey, inputToPeriod, kyLabel, periodLabel, periodToInput, periodToKy } from '@/lib/mlx/normalize';
import { parseRawFile } from '@/lib/mlx/parseRaw';
import type { MlxCustomer, ParsedRawFile, Period, RawRow } from '@/lib/mlx/types';

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

/** Trạng thái của một bảng kê sẽ xuất, so với lịch sử đã lưu */
type Kind =
  | { type: 'new' }
  | { type: 'replace'; old: StatementRecord[] } // kỳ này đã có bảng kê từ bộ file khác
  | { type: 'duplicate'; reason: string }; // đúng bộ file này đã xử lý rồi

/**
 * Một bảng kê sẽ xuất ra: gom mọi file của cùng một khách trong cùng một kỳ,
 * bất kể đến từ XPAY hay CMS.
 */
type Group = {
  key: string;
  customerId: string;
  period: Period;
  files: Item[];
  rows: RawRow[];
  total: number;
  zeroRows: number;
  /** Khoá nhận dạng bộ file nguồn: các hash thành phần sắp xếp rồi nối lại */
  hash: string;
  kind: Kind;
};

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
          ? { ...it, customerId: matchCustomer(hintsFromFile(it.parsed), customers)?.id ?? '' }
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
  const lookupKey = `${[...hashes].sort().join(',')}|${[...kys].sort().join(',')}`;
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
      .catch((e: Error) =>
        !cancelled &&
        setHistoryError(e instanceof HistoryNotReadyError ? e.message : `Không tra được lịch sử: ${e.message}`),
      )
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
            // File master: thay dòng của file bằng từng công ty trong file (mỗi công ty = 1 file raw riêng)
            if (parsed.parts) {
              const parts = parsed.parts;
              setItems((prev) => {
                const at = prev.findIndex((it) => it.uid === uid);
                const each: Item[] = parts.map((p, k) => ({
                  uid: `${uid}#${k}`,
                  fileName: p.fileName,
                  status: 'ready',
                  parsed: p,
                  hash: `${hash}#${companyKey(p.companyFromFile)}`,
                  customerId: matchCustomer(hintsFromFile(p), customers)?.id ?? '',
                  period: p.periodFromFile,
                }));
                return at < 0 ? [...prev, ...each] : [...prev.slice(0, at), ...each, ...prev.slice(at + 1)];
              });
              setMessage({
                type: parts.length ? 'ok' : 'err',
                text: parts.length
                  ? `File master "${file.name}": tách thành ${parts.length} công ty, ${parts.reduce((n, p) => n + p.rows.length, 0)} giao dịch` +
                    `${parsed.internalRows ? ` · bỏ ${parsed.internalRows} giao dịch nội bộ Xperise` : ''}. Kiểm tra khách được khớp ở bảng dưới.`
                  : `File master "${file.name}" không có giao dịch nào để lập bảng kê.`,
              });
              return;
            }
            const matched = matchCustomer(hintsFromFile(parsed), customers);
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

  /**
   * Gom file thành các bảng kê sẽ xuất.
   * Một khách + một kỳ = một bảng kê, dù dữ liệu đến từ mấy file.
   * Trong bảng kê, giao dịch XPAY xếp trước, CMS xếp sau.
   */
  const { groups, groupOfFile, trungTrongLo } = useMemo(() => {
    const map = new Map<string, Group>();
    const groupOfFile = new Map<string, string>(); // uid → group key
    const trungTrongLo = new Map<string, string>(); // uid → lý do bị bỏ
    const hashesOfGroup = new Map<string, Set<string>>();

    for (const it of items) {
      if (it.status !== 'ready' || !it.parsed || !it.customerId || !byId.has(it.customerId)) continue;
      const period = it.period ?? defaultPeriod;
      const key = `${it.customerId}|${periodToKy(period)}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          customerId: it.customerId,
          period,
          files: [],
          rows: [],
          total: 0,
          zeroRows: 0,
          hash: '',
          kind: { type: 'new' },
        });
        hashesOfGroup.set(key, new Set());
      }
      const daCo = hashesOfGroup.get(key)!;
      if (it.hash && daCo.has(it.hash)) {
        trungTrongLo.set(it.uid, 'Trùng nội dung với file khác trong lần tải này');
        continue;
      }
      if (it.hash) daCo.add(it.hash);
      map.get(key)!.files.push(it);
      groupOfFile.set(it.uid, key);
    }

    for (const g of map.values()) {
      // XPAY trước, rồi CMS, rồi Be; trong mỗi nguồn giữ nguyên thứ tự tải lên
      const BAC: Record<string, number> = { XPAY: 0, CMS: 1, BE: 2 };
      const thuTu = (it: Item) => BAC[it.parsed?.source ?? 'XPAY'] ?? 0;
      g.files.sort((a, b) => thuTu(a) - thuTu(b));
      g.rows = g.files.flatMap((f) => f.parsed!.rows);
      g.total = g.files.reduce((n, f) => n + f.parsed!.total, 0);
      g.zeroRows = g.files.reduce((n, f) => n + f.parsed!.zeroRows, 0);
      g.hash = g.files
        .map((f) => f.hash ?? '')
        .sort()
        .join('+');

      const ky = periodToKy(g.period);
      const cungKhachCungKy = related.filter((r) => r.customer_id === g.customerId && r.ky === ky);
      const giongHet = cungKhachCungKy.find((r) => r.source_hash === g.hash);
      g.kind = giongHet
        ? {
            type: 'duplicate',
            reason: `Đã xử lý ngày ${new Date(giongHet.created_at).toLocaleDateString('vi-VN')} (${giongHet.file_name})`,
          }
        : cungKhachCungKy.length
          ? { type: 'replace', old: cungKhachCungKy }
          : { type: 'new' };
    }

    return { groups: [...map.values()], groupOfFile, trungTrongLo };
  }, [items, byId, defaultPeriod, related]);

  const groupByKey = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups]);
  const kindOfFile = (uid: string) => groupByKey.get(groupOfFile.get(uid) ?? '')?.kind;
  const groupOf = (uid: string) => groupByKey.get(groupOfFile.get(uid) ?? '');

  /** File bị bỏ qua: trùng trong lô, hoặc thuộc bảng kê đã xử lý trước đó */
  const boQua = (it: Item) => trungTrongLo.has(it.uid) || kindOfFile(it.uid)?.type === 'duplicate';

  const sapXuat = groups.filter((g) => g.kind.type !== 'duplicate');
  const active = items.filter((i) => !boQua(i));
  const ready = active.filter((i) => i.status === 'ready');
  const matched = ready.filter((i) => i.customerId && byId.has(i.customerId));
  const dupCount = items.length - active.length;
  const totalRows = sapXuat.reduce((n, g) => n + g.rows.length, 0);
  const totalAmount = sapXuat.reduce((n, g) => n + g.total, 0);
  const zeroTotal = sapXuat.reduce((n, g) => n + g.zeroRows, 0);
  const blocking = active.filter((i) => i.status !== 'ready' || !i.customerId || !byId.has(i.customerId)).length;
  const canConfirm = sapXuat.length > 0 && blocking === 0 && !busy && !checking && !historyError;

  async function confirm() {
    if (!canConfirm) return;
    setBusy(true);
    setMessage(null);
    const doneKeys: string[] = [];
    const saveErrors: string[] = [];
    try {
      const ExcelJS = await loadExcelJS();
      const outputs: { fileName: string; buffer: ArrayBuffer }[] = [];

      for (const g of sapXuat) {
        const customer = byId.get(g.customerId)!;
        const out = await buildStatement(ExcelJS, { customer, period: g.period, rows: g.rows });
        try {
          await saveStatement(
            {
              customer_id: customer.id as string,
              ten_cong_ty: customer.ten_cong_ty,
              ten_viet_tat: customer.ten_viet_tat,
              ky: periodToKy(g.period),
              file_name: out.fileName,
              source_file_name: g.files.map((f) => f.fileName).join(' + '),
              source_hash: g.hash,
              row_count: g.rows.length,
              total_amount: out.total,
              payable_amount: out.payable,
              buffer: out.buffer,
            },
            g.kind.type === 'replace' ? g.kind.old : [],
          );
          doneKeys.push(g.key);
        } catch (e) {
          saveErrors.push(`${customer.ten_cong_ty}: ${(e as Error).message}`);
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
        const periods = new Set(sapXuat.map((g) => periodLabel(g.period)));
        const suffix = periods.size === 1 ? [...periods][0] : new Date().toISOString().slice(0, 10);
        downloadBlob(await zip.generateAsync({ type: 'blob' }), `Bang_ke_MLX_${suffix}.zip`, 'application/zip');
      }

      // File đã lưu lịch sử + file bị bỏ qua → rời khỏi danh sách
      const xong = new Set(
        groups.filter((g) => doneKeys.includes(g.key)).flatMap((g) => g.files.map((f) => f.uid)),
      );
      setItems((prev) => prev.filter((i) => !xong.has(i.uid) && !boQua(i)));

      const kyText = [...new Set(sapXuat.map((g) => kyLabel(periodToKy(g.period))))].join(', ');
      setMessage(
        saveErrors.length
          ? {
              type: 'err',
              text: `Đã tải ${outputs.length} bảng kê nhưng ${saveErrors.length} bảng chưa lưu được vào lịch sử: ${saveErrors.join(' · ')}`,
            }
          : { type: 'ok', text: `Đã tải ${outputs.length} bảng kê và lưu vào Lịch sử bảng kê (${kyText}).` },
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

      {/* KPI — chỉ tính phần sẽ xuất ra */}
      <div className={s.kpis}>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>File đã tải lên</div>
          <div className={s.kpiNum}>{active.length}</div>
          <div className={s.kpiSub}>
            {active.filter((i) => i.parsed?.source === 'XPAY').length} XPAY ·{' '}
            {active.filter((i) => i.parsed?.source === 'CMS').length} CMS ·{' '}
            {active.filter((i) => i.parsed?.source === 'BE').length} Be
            {dupCount ? ` · bỏ qua ${dupCount}` : ''}
          </div>
        </div>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>Bảng kê sẽ xuất</div>
          <div className={s.kpiNum}>{sapXuat.length}</div>
          <div className={s.kpiSub}>
            đã khớp {matched.length}/{ready.length} file · master data {customers.length} khách
          </div>
        </div>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>Tổng giao dịch</div>
          <div className={s.kpiNum}>{fmt.format(totalRows)}</div>
          <div className={s.kpiSub}>
            gộp cả XPAY, CMS và Be{zeroTotal > 0 ? ` · đã bỏ ${zeroTotal} dòng 0đ` : ''}
          </div>
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
            <h2 className={s.title}>Tải lên file XPAY, CMS và Be</h2>
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
            <span className={s.note}>Dùng khi file không cho biết kỳ</span>
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
          <div className={s.dropTitle}>Kéo thả file raw XPAY, file master (nhiều công ty), bảng kê CMS và bảng kê Be vào đây hoặc bấm để chọn</div>
          <div className={s.note} style={{ marginTop: 4 }}>
            Hệ thống tự nhận loại file, khớp khách theo tên công ty / mã hợp đồng / MST, rồi gộp giao dịch của cùng một
            khách trong cùng một kỳ vào <b>một bảng kê</b>. Dòng 0đ và file đã xử lý trước đó được bỏ qua.
            <br />
            <b>File master</b> (raw XPAY có cột <b>Công ty</b>): tự tách thành từng công ty, mỗi công ty một bảng kê đã
            format; kỳ tính theo ngày đi thực tế (26 → 25). Giao dịch nội bộ Xperise được bỏ qua.
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
              Bảng kê tải về được lưu tự động vào <Link href="/mlx/lich-su">Lịch sử bảng kê</Link>
            </div>
          </div>
          <div className={s.row}>
            {checking && <span className={s.chip}>Đang kiểm tra lịch sử…</span>}
            {blocking > 0 && <span className={`${s.chip} ${s.chipWarn}`}>{blocking} file cần xử lý</span>}
            <button className={s.btn} onClick={() => setItems([])} disabled={!items.length || busy}>
              Xoá tất cả
            </button>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={confirm} disabled={!canConfirm}>
              {busy ? 'Đang tạo…' : `Xác nhận & tải bảng kê${sapXuat.length ? ` (${sapXuat.length})` : ''}`}
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
                  <th>File tải lên</th>
                  <th>Nguồn</th>
                  <th>Khách hàng (master data)</th>
                  <th>Kỳ</th>
                  <th style={{ textAlign: 'right' }}>Số dòng</th>
                  <th style={{ textAlign: 'right' }}>Tổng tiền</th>
                  <th style={{ minWidth: 230 }}>Bảng kê xuất ra</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const customer = byId.get(it.customerId);
                  const period = it.period ?? defaultPeriod;
                  const g = groupOf(it.uid);
                  const kind = g?.kind;
                  const trungLo = trungTrongLo.get(it.uid);
                  const bo = boQua(it);
                  const src = it.parsed?.source;
                  return (
                    <tr key={it.uid} className={bo ? s.rowDim : ''}>
                      <td className={s.muted}>{idx + 1}</td>
                      <td>
                        <div className={s.fileName} title={it.fileName}>{it.fileName}</div>
                        {it.parsed && (
                          <div className={s.note}>
                            Đọc được: {it.parsed.companyFromFile}
                            {it.parsed.codeFromFile ? ` · mã ${it.parsed.codeFromFile}` : ''}
                            {it.parsed.mstFromFile ? ` · MST ${it.parsed.mstFromFile}` : ''}
                          </div>
                        )}
                      </td>
                      <td>
                        {src && (
                          <span className={`${s.chip} ${src === 'CMS' ? s.srcCms : src === 'BE' ? s.srcBe : s.srcXpay}`}>
                            {src === 'BE' ? 'Be' : src}
                          </span>
                        )}
                      </td>
                      <td>
                        <CustomerPicker
                          customers={customers}
                          value={it.customerId}
                          disabled={it.status !== 'ready' || busy}
                          onChange={(id) => update(it.uid, { customerId: id })}
                        />
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
                      <td className={s.num}>
                        {it.parsed ? fmt.format(it.parsed.rows.length) : '—'}
                        {it.parsed && it.parsed.zeroRows > 0 && (
                          <div className={s.note}>bỏ {it.parsed.zeroRows} dòng 0đ</div>
                        )}
                      </td>
                      <td className={s.num}>{it.parsed ? fmt.format(it.parsed.total) : '—'}</td>
                      <td className={s.muted}>
                        {customer ? outputNames(customer, period).fileName : '—'}
                        {g && g.files.length > 1 && (
                          <div className={s.note}>
                            gộp {g.files.length} file · {fmt.format(g.rows.length)} dòng ·{' '}
                            {fmt.format(g.total)}
                          </div>
                        )}
                      </td>
                      <td>
                        {it.status === 'reading' && <span className={s.chip}>Đang đọc…</span>}
                        {it.status === 'error' && (
                          <span className={`${s.chip} ${s.chipErr}`} title={it.error}>
                            Lỗi: {it.error}
                          </span>
                        )}
                        {it.status === 'ready' && !customer && (
                          <span className={`${s.chip} ${s.chipWarn}`}>Chưa khớp khách</span>
                        )}
                        {it.status === 'ready' && customer && trungLo && (
                          <>
                            <span className={s.chip} title={trungLo}>Trùng – bỏ qua</span>
                            <div className={s.note}>{trungLo}</div>
                          </>
                        )}
                        {it.status === 'ready' && customer && !trungLo && kind?.type === 'new' && (
                          <span className={`${s.chip} ${s.chipOk}`}>Mới</span>
                        )}
                        {it.status === 'ready' && customer && !trungLo && kind?.type === 'replace' && (
                          <span
                            className={`${s.chip} ${s.chipWarn}`}
                            title="Kỳ này đã có bảng kê cho khách này từ bộ file khác"
                          >
                            Mới · thay bản cũ
                          </span>
                        )}
                        {it.status === 'ready' && customer && !trungLo && kind?.type === 'duplicate' && (
                          <>
                            <span className={s.chip} title={kind.reason}>Đã xử lý – bỏ qua</span>
                            <div className={s.note}>{kind.reason}</div>
                          </>
                        )}
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
