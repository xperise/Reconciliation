"use client";
// Tab Dữ liệu: tải template, upload file, kiểm tra lỗi, ghi vào DB, lịch sử & độ phủ dữ liệu
import { useRef, useState } from "react";
import { parseWorkbook, crossCheck, ParseResult } from "@/lib/dashboard/parse";
import { SHEETS } from "@/lib/dashboard/spec";
import type { DataSet } from "@/lib/dashboard/types";
import { kyIdx, n0, pc } from "@/lib/dashboard/util";

const MODE_LABEL = { upsert: "Cập nhật theo mã", replace_by_ky: "Thay theo kỳ", replace_all: "Thay toàn bộ" } as const;
const CHUNK = 1000;

export default function DataTab({ data, onDone, toast, canEdit }: { data: DataSet; onDone: () => Promise<void>; toast: (m: string, err?: boolean) => void; canEdit: boolean }) {
  const [res, setRes] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [over, setOver] = useState(false);
  const inp = useRef<HTMLInputElement>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true); setRes(null); setFileName(f.name);
    try {
      const r = await parseWorkbook(await f.arrayBuffer());
      crossCheck(r, data.customers.map((c) => c.ma_kh), data.suppliers.map((s) => s.ma_ncc));
      if (!r.sheets.length) r.issues.push({ sheet: "—", level: "error", msg: "Không tìm thấy sheet nào đúng template (tên sheet + dòng tiêu đề)" });
      setRes(r);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
    finally { setBusy(false); if (inp.current) inp.current.value = ""; }
  }

  const errors = res ? res.issues.filter((i) => i.level === "error") : [];
  const warns = res ? res.issues.filter((i) => i.level === "warn") : [];

  async function commit() {
    if (!res || errors.length || busy) return;
    setBusy(true); setProg(0);
    const order = SHEETS.map((s) => s.sheet);
    const sheets = res.sheets.slice().sort((a, b) => order.indexOf(a.spec.sheet) - order.indexOf(b.spec.sheet));
    const total = sheets.reduce((s, x) => s + Math.max(1, Math.ceil(x.rows.length / CHUNK)), 0);
    let done = 0;
    try {
      for (const s of sheets) {
        for (let i = 0; i < Math.max(1, s.rows.length); i += CHUNK) {
          const r = await fetch("/api/dashboard/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chunk", sheet: s.spec.sheet, rows: s.rows.slice(i, i + CHUNK), first: i === 0, kys: s.kys }) });
          const j = (await r.json()) as { error?: string };
          if (!r.ok || j.error) throw new Error(j.error || `Lỗi ghi ${s.spec.sheet}`);
          done++; setProg(done / total);
        }
      }
      const summary = Object.fromEntries(sheets.map((s) => [s.spec.sheet, { rows: s.rows.length, kys: s.kys }]));
      await fetch("/api/dashboard/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "log", fileName, summary }) });
      toast(`Đã cập nhật ${sheets.length} sheet từ ${fileName}`);
      setRes(null);
      await onDone();
    } catch (e) {
      toast((e instanceof Error ? e.message : String(e)) + " — các sheet trước đó đã ghi; sửa lỗi rồi upload lại cả file.", true);
    } finally { setBusy(false); }
  }

  // Độ phủ dữ liệu
  const kys = Array.from(new Set([...data.targets.map((t) => t.ky), ...data.gmv.map((g) => g.ky), ...data.opex.map((o) => o.ky), ...data.ar.map((a) => a.ky)])).filter((k) => !isNaN(kyIdx(k))).sort((a, b) => kyIdx(a) - kyIdx(b));
  const cnt = (arr: { ky: string | null }[], k: string) => arr.filter((x) => x.ky === k).length;
  const gmvNcc = data.gmv.length ? data.gmv.filter((g) => g.ma_ncc).length / data.gmv.length : null;
  const coverage: [string, number | null][] = [
    ["Khách hàng đã gắn PM phụ trách", data.customers.length ? data.customers.filter((c) => c.pm).length / data.customers.length : null],
    ["Khách N1/N3/N5 đã gắn Sales chốt", (() => { const c = data.customers.filter((x) => ["N1", "N3", "N5"].includes(x.nhom)); return c.length ? c.filter((x) => x.sales).length / c.length : null; })()],
    ["Dòng GMV có Mã NCC (để tính payment term)", gmvNcc],
    ["NCC có payment term hợp đồng", data.suppliers.length ? data.suppliers.filter((s) => s.payment_term != null).length / data.suppliers.length : null],
  ];

  return (
    <div className="view">
      <div className="g57">
        <div className="card">
          <div className="card-h"><div><div className="eyebrow">Upload</div><div className="card-title">Nạp file template số liệu</div></div>
            <div className="card-note"><a href="/dashboard/templates/Xperise_Dashboard_Template.xlsx" download>Tải template trống</a> · <a href="/dashboard/templates/Xperise_Dashboard_FileMau_DuLieuThu.xlsx" download>File mẫu có dữ liệu thử</a></div></div>
          {!canEdit ? <div className="empty">Chỉ Quản trị và Kế toán được upload dữ liệu. Bạn đang ở chế độ chỉ xem.</div> : (
          <label className={"drop" + (over ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
            <b>{busy && !res ? "Đang đọc file…" : "Kéo thả file Excel vào đây hoặc bấm để chọn"}</b>
            Chỉ cần điền các sheet có thay đổi · sheet trống được bỏ qua
            <input ref={inp} type="file" accept=".xlsx,.xls" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          )}
          {res && (
            <div style={{ marginTop: 14 }}>
              <div className="tw"><table>
                <thead><tr><th>Sheet</th><th>Cách ghi</th><th className="r">Số dòng</th><th>Kỳ</th></tr></thead>
                <tbody>{res.sheets.map((s) => (<tr key={s.spec.sheet}><td className="num">{s.spec.sheet}</td><td>{MODE_LABEL[s.spec.mode]}</td><td className="r num">{n0(s.rows.length)}</td><td className="small">{s.kys.join(", ") || (s.spec.mode === "replace_all" ? "toàn bộ sổ" : "—")}</td></tr>))}</tbody>
              </table></div>
              {res.unknownSheets.length > 0 && <div className="small" style={{ marginTop: 8 }}>Bỏ qua sheet không thuộc template: {res.unknownSheets.join(", ")}</div>}
              <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn primary" disabled={!!errors.length || busy || !res.sheets.length} onClick={commit}>{busy ? "Đang ghi…" : `Ghi ${res.sheets.length} sheet vào dashboard`}</button>
                <button className="btn" disabled={busy} onClick={() => setRes(null)}>Hủy</button>
                {errors.length > 0 && <span className="pill dot p-critical">{errors.length} lỗi — sửa file rồi upload lại</span>}
                {!errors.length && warns.length > 0 && <span className="pill dot p-high">{warns.length} lưu ý</span>}
              </div>
              {busy && <div className="progress"><i style={{ width: `${Math.round(prog * 100)}%` }} /></div>}
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-h"><div><div className="eyebrow">Kiểm tra</div><div className="card-title">Lỗi & lưu ý của file</div></div><div className="card-note">{fileName}</div></div>
          {!res ? <div className="empty">Chọn file để kiểm tra trước khi ghi.</div> : !res.issues.length ? <div className="empty">Không có lỗi. Có thể ghi dữ liệu.</div> : (
            <div className="tw" style={{ maxHeight: 360, overflowY: "auto" }}><table>
              <thead><tr><th>Mức</th><th>Sheet</th><th className="r">Dòng</th><th>Cột</th><th>Nội dung</th></tr></thead>
              <tbody>{[...errors, ...warns].slice(0, 300).map((i, k) => (<tr key={k}><td><span className={"pill dot " + (i.level === "error" ? "p-critical" : "p-high")}>{i.level === "error" ? "Lỗi" : "Lưu ý"}</span></td><td className="num">{i.sheet}</td><td className="r num">{i.row ?? ""}</td><td>{i.col ?? ""}</td><td>{i.msg}</td></tr>))}</tbody>
            </table></div>
          )}
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-h"><div><div className="eyebrow">Độ phủ</div><div className="card-title">Dữ liệu đang có theo kỳ</div></div><div className="card-note">số dòng</div></div>
          <div className="tw"><table>
            <thead><tr><th>Kỳ</th><th>Kế hoạch</th><th className="r">GMV</th><th className="r">Chi phí</th><th className="r">Công nợ phải thu</th><th>Chốt hoa hồng</th></tr></thead>
            <tbody>{kys.map((k) => { const snap = data.snapshots.find((s) => s.ky === k); return (<tr key={k}><td className="num">{k}</td><td>{data.targets.some((t) => t.ky === k) ? "✓" : "–"}</td><td className="r num">{n0(cnt(data.gmv, k))}</td><td className="r num">{n0(cnt(data.opex, k))}</td><td className="r num">{n0(cnt(data.ar, k))}</td><td>{snap ? <span className="pill dot p-stable">đã chốt</span> : "–"}</td></tr>); })}</tbody>
          </table></div>
          <table style={{ marginTop: 14 }}><tbody>
            <tr><td>Danh mục khách hàng</td><td className="r num">{n0(data.customers.length)}</td></tr>
            <tr><td>Danh mục nhà cung cấp</td><td className="r num">{n0(data.suppliers.length)}</td></tr>
            <tr><td>Công nợ phải trả (dòng)</td><td className="r num">{n0(data.ap.length)}</td></tr>
            <tr><td>Dòng tiền (dòng)</td><td className="r num">{n0(data.cash.length)}</td></tr>
            <tr><td>Hợp đồng mới</td><td className="r num">{n0(data.contracts.length)}</td></tr>
            {coverage.map(([l, v]) => (<tr key={l}><td>{l}</td><td className={"r num " + (v == null ? "" : v >= 0.9 ? "c-stable" : v >= 0.6 ? "c-high" : "c-critical")}>{pc(v, 0)}</td></tr>))}
          </tbody></table>
        </div>
        <div className="card">
          <div className="card-h"><div><div className="eyebrow">Lịch sử</div><div className="card-title">Các lần upload gần đây</div></div></div>
          {!data.uploads.length ? <div className="empty">Chưa có lần upload nào.</div> : (
            <div className="tw"><table>
              <thead><tr><th>Thời gian</th><th>File</th><th>Sheet</th></tr></thead>
              <tbody>{data.uploads.map((u) => (<tr key={u.id}><td className="num">{new Date(u.uploaded_at).toLocaleString("vi-VN")}</td><td>{u.file_name}</td><td className="small">{Object.keys(u.summary || {}).join(", ")}</td></tr>))}</tbody>
            </table></div>
          )}
          <details style={{ marginTop: 14 }}><summary>Tham số đang áp dụng ({Object.keys(data.params).length})</summary>
            <div className="tw" style={{ marginTop: 8 }}><table><tbody>{Object.entries(data.params).map(([k, v]) => (<tr key={k}><td className="num">{k}</td><td className="r num">{v}</td></tr>))}</tbody></table></div>
          </details>
        </div>
      </div>
    </div>
  );
}
