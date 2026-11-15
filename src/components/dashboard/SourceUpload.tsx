"use client";
// Nạp thẳng file nguồn: bảng kê khách hàng hotel / flight, file đối soát NCC, sổ công nợ phải thu.
// Thả nhiều file một lần; web tự nhận loại file, cho xem trước, rồi ghi theo thứ tự
// công nợ phải thu → bảng kê → đối soát NCC → dựng lại GMV & giá vốn theo ngày.
import { useRef, useState } from "react";
import type { DataSet } from "@/lib/dashboard/types";
import { readSource, SrcFile, KIND_LABEL } from "@/lib/dashboard/sources";
import { n0, pc } from "@/lib/dashboard/util";

const CHUNK = 1000;
const ORDER = ["ar", "kh_hotel", "kh_flight", "kh_be", "ncc", "b1", "ht_hotel", "ht_flight"];
const vnd = (v: number) => new Intl.NumberFormat("vi-VN").format(Math.round(v));
const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
interface Rebuild { kys: string[]; rows: number; gmv?: number; gmvCoGv?: number; ncc?: { noi: number; khongNoi: number; khongNoiTien: number }; ht?: { noi: number; khongNoi: number }; theoNguon?: Record<string, number>; khachChuaMap?: { ten: string; gmv: number }[]; note?: string }

export default function SourceUpload({ data, canEdit, onDone, toast }: { data: DataSet; canEdit: boolean; onDone: () => Promise<void>; toast: (m: string, err?: boolean) => void }) {
  const [files, setFiles] = useState<SrcFile[]>([]);
  const [busy, setBusy] = useState("");
  const [prog, setProg] = useState(0);
  const [over, setOver] = useState(false);
  const [res, setRes] = useState<Rebuild | null>(null);
  const inp = useRef<HTMLInputElement>(null);

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    setBusy("Đang đọc file…"); setRes(null);
    try {
      const out: SrcFile[] = [];
      for (const f of Array.from(list)) out.push(await readSource(f, data.customers));
      // file trùng tên (nạp lại) thay bản trước trong danh sách chờ
      setFiles((cur) => [...cur.filter((x) => !out.some((o) => o.name === x.name)), ...out]);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
    finally { setBusy(""); if (inp.current) inp.current.value = ""; }
  }

  async function post(body: unknown) {
    const r = await fetch("/api/dashboard/nguon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `Lỗi ${r.status}`);
    return j;
  }

  async function commit() {
    const ok = files.filter((f) => f.kind !== "unknown" && f.rows);
    if (!ok.length || busy) return;
    const sorted = ok.slice().sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
    const steps = sorted.reduce((s, f) => s + Math.max(1, Math.ceil(f.rows / CHUNK)) + (f.kind === "ar" ? 1 : 0), 1);
    let done = 0;
    const tick = () => { done++; setProg(done / steps); };
    setBusy("Đang ghi…"); setProg(0);
    try {
      for (const f of sorted) {
        setBusy(`Đang ghi ${f.name}…`);
        if (f.kind === "ar") {
          await post({ action: "dm", rows: f.dm || [] }); tick();
          for (let i = 0; i < (f.ar || []).length; i += CHUNK) { await post({ action: "ar", kys: f.kys, rows: (f.ar || []).slice(i, i + CHUNK), first: i === 0 }); tick(); }
        } else if (f.kind === "kh_hotel" || f.kind === "kh_flight" || f.kind === "kh_be") {
          const loai = f.kind === "kh_hotel" ? "hotel" : f.kind === "kh_flight" ? "flight" : "transport";
          for (let i = 0; i < (f.kh || []).length; i += CHUNK) { await post({ action: "kh", loai, cty: f.cty, kys: f.kys, rows: (f.kh || []).slice(i, i + CHUNK), first: i === 0, fileName: f.name }); tick(); }
        } else if (f.kind === "ncc" || f.kind === "b1" || f.kind === "ht_hotel" || f.kind === "ht_flight") {
          for (let i = 0; i < (f.ncc || []).length; i += CHUNK) { await post({ action: "ncc", fileKey: f.fileKey, fileName: f.name, rows: (f.ncc || []).slice(i, i + CHUNK), first: i === 0 }); tick(); }
        }
      }
      setBusy("Đang dựng lại GMV & giá vốn theo ngày…");
      const rb = (await post({ action: "rebuild" })) as Rebuild; tick();
      setRes(rb);
      await fetch("/api/dashboard/upload", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "log", fileName: sorted.map((f) => f.name).join(" · "), summary: Object.fromEntries(sorted.map((f) => [KIND_LABEL[f.kind] + " · " + f.name, { rows: f.rows, kys: f.kys }])) }) });
      toast(`Đã nạp ${sorted.length} file và dựng lại GMV ${rb.kys?.join(", ") || ""}`);
      setFiles([]);
      await onDone();
    } catch (e) {
      toast((e instanceof Error ? e.message : String(e)) + " — các file trước đó đã ghi; sửa lỗi rồi nạp lại file lỗi.", true);
    } finally { setBusy(""); }
  }

  /** Dựng lại GMV & giá vốn từ file đã nạp (không cần nạp lại file) */
  async function rebuildOnly() {
    if (busy) return;
    setBusy("Đang dựng lại GMV & giá vốn theo ngày…"); setRes(null);
    try { const rb = (await post({ action: "rebuild" })) as Rebuild; setRes(rb); toast(`Đã dựng lại GMV ${rb.kys?.join(", ") || ""}`); await onDone(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
    finally { setBusy(""); }
  }
  const loaded = data.src;
  return (
    <div className="card">
      <div className="card-h"><div><div className="eyebrow">Nạp file nguồn</div><div className="card-title">Bảng kê khách hàng · Đối soát NCC · Chi KS trực tiếp · Công nợ phải thu</div></div>
        <div className="card-note">thả nhiều file một lần — web tự nhận loại file</div></div>
      {!canEdit ? <div className="empty">Chỉ Quản trị và Kế toán được nạp dữ liệu.</div> : (
        <label className={"drop" + (over ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}>
          <i className={busy ? "ri-loader-4-line" : "ri-upload-cloud-2-line"} aria-hidden="true" />
          <b>{busy || "Kéo thả các file Excel vào đây hoặc bấm để chọn"}</b>
          xperise_hotel_statement · xperise_flight_statement · Be_statement_… · Doi_soat_… · hoa-don-ks-b1-… · Performance_Dashboard_…spending (.csv) · GOC_CONG_NO_PHAI_THU…
          <input ref={inp} type="file" accept=".xlsx,.xls,.csv" multiple hidden onChange={(e) => pick(e.target.files)} />
        </label>
      )}
      {files.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="tw"><table>
            <thead><tr><th>File</th><th>Loại</th><th className="r">Số dòng</th><th>Khoảng ngày</th><th>Tổng</th><th></th></tr></thead>
            <tbody>{files.map((f) => (
              <tr key={f.name}>
                <td className="small" style={{ maxWidth: 280, wordBreak: "break-all" }}>{f.name}</td>
                <td><span className={"pill dot " + (f.kind === "unknown" ? "p-critical" : "p-stable")}>{KIND_LABEL[f.kind]}</span></td>
                <td className="r num">{n0(f.rows)}</td>
                <td className="num small">{dmy(f.from)} – {dmy(f.to)}</td>
                <td className="small">{f.totalL}
                  {f.notes.map((n, i) => <div key={i} className="t2">{n}</div>)}
                  {f.warns.map((n, i) => <div key={"w" + i} className="t2 c-high">{n}</div>)}</td>
                <td><button className="icon-btn" title="Bỏ file này" onClick={() => setFiles((c) => c.filter((x) => x.name !== f.name))}><i className="ri-close-line" /></button></td>
              </tr>))}</tbody>
          </table></div>
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn primary" disabled={!!busy || !files.some((f) => f.kind !== "unknown" && f.rows)} onClick={commit}>{busy ? "Đang ghi…" : `Ghi ${files.filter((f) => f.kind !== "unknown" && f.rows).length} file vào dashboard`}</button>
            <button className="btn" disabled={!!busy} onClick={() => setFiles([])}>Hủy</button>
            <span className="small">Thứ tự ghi: công nợ phải thu → bảng kê khách hàng → đối soát NCC → dựng lại GMV & giá vốn.</span>
          </div>
          {busy && <div className="progress"><i style={{ width: `${Math.round(prog * 100)}%` }} /></div>}
        </div>
      )}
      {res && (
        <div className="card notice" style={{ marginTop: 14 }}>
          <b>Đã dựng lại GMV {res.kys.join(", ")}</b>: {n0(res.rows)} dòng theo ngày × khách × NCC.
          {res.gmv != null && <> GMV {vnd(res.gmv)}, trong đó đã có giá vốn {vnd(res.gmvCoGv || 0)} ({pc(res.gmv ? (res.gmvCoGv || 0) / res.gmv : null, 0)}).</>}
          {res.ncc && <> Dòng đối soát NCC / B1 nối được bảng kê: {n0(res.ncc.noi)}; không nối được: {n0(res.ncc.khongNoi)} ({vnd(res.ncc.khongNoiTien)}).</>}
          {res.ht && <> Giá NCC trên hệ thống: {n0(res.ht.noi)} booking dùng làm giá vốn; {n0(res.ht.khongNoi)} booking không có trên bảng kê hoặc dòng bảng kê đã có giá vốn từ đối soát / B1 — không tính.</>}
          {res.theoNguon && <div className="small" style={{ marginTop: 6 }}>GMV có giá vốn theo nguồn: {Object.entries(res.theoNguon).map(([k, v]) => `${k} ${vnd(v)}`).join(" · ")}</div>}
          {!!res.khachChuaMap?.length && <div className="small" style={{ marginTop: 6 }}>Chưa nhận được mã khách (giữ theo tên công ty — thêm vào danh mục khách hàng để gộp đúng): {res.khachChuaMap.map((x) => `${x.ten} (${vnd(x.gmv)})`).join(" · ")}</div>}
        </div>
      )}
      {loaded && (loaded.kh.length > 0 || loaded.ncc.length > 0) && (
        <details style={{ marginTop: 14 }}><summary>File nguồn đang có trong dashboard</summary>
          {canEdit && <div style={{ margin: "8px 0" }}><button className="btn" disabled={!!busy} onClick={rebuildOnly}>Dựng lại GMV & giá vốn từ file đã nạp</button></div>}
          <div className="tw" style={{ marginTop: 8 }}><table>
            <thead><tr><th>Bảng kê khách hàng</th><th>Kỳ</th><th>Khoảng ngày</th><th className="r">Số dòng</th><th className="r">GMV — Tổng thành tiền (VND)</th><th>Nạp lúc</th></tr></thead>
            <tbody>{loaded.kh.slice().sort((a, b) => b.ky.localeCompare(a.ky)).map((k) => (<tr key={k.loai + k.ky}><td>{k.loai === "hotel" ? "Hotel" : k.loai === "flight" ? "Flight" : "Transportation (Be)"}</td><td className="num">{k.ky}</td><td className="num small">{dmy(k.from)} – {dmy(k.to)}</td><td className="r num">{n0(k.n)}</td><td className="r num">{vnd(k.gmv)}</td><td className="small">{new Date(k.at).toLocaleString("vi-VN")}</td></tr>))}</tbody>
          </table></div>
          <div className="tw" style={{ marginTop: 8 }}><table>
            <thead><tr><th>File đối soát NCC / chi KS trực tiếp</th><th className="r">Số dòng</th><th className="r">Bảng kê NCC (VND)</th><th className="r">Ledger (VND)</th></tr></thead>
            <tbody>{Array.from(loaded.ncc.reduce((m, r) => { const o = m.get(r.file) || { n: 0, bk: 0, led: 0 }; o.n += r.n; o.bk += r.bang_ke; o.led += r.ledger; m.set(r.file, o); return m; }, new Map<string, { n: number; bk: number; led: number }>()).entries())
              .map(([f, o]) => (<tr key={f}><td className="small" style={{ wordBreak: "break-all" }}>{f}</td><td className="r num">{n0(o.n)}</td><td className="r num">{vnd(o.bk)}</td><td className="r num">{vnd(o.led)}</td></tr>))}</tbody>
          </table></div>
        </details>
      )}
    </div>
  );
}
