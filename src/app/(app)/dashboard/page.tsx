"use client";
// Dashboard quản trị tài chính & KPI — /dashboard (tab thứ 3 cạnh Xperise | MLX)
import "./dashboard.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataSet } from "@/lib/dashboard/types";
import { makeCtx, hasActual, mergeEdits } from "@/lib/dashboard/calc";
import { renderView, kpiStrip, drillPanel, buildVM, VM, ViewState } from "@/lib/dashboard/views";
import { kyIdx, kyAdd, tr, todayIso, setUnit, UNITS, UnitKey } from "@/lib/dashboard/util";
import DataTab from "@/components/dashboard/DataTab";

// [key, nhãn, icon RemixIcon] — bộ icon của Xperise Design System, không dùng emoji
const TABS: [string, string, string][] = [
  ["overview", "Tổng quan", "ri-compass-3-line"],
  ["ceo", "Góc nhìn CEO", "ri-briefcase-4-line"],
  ["trend", "Xu hướng", "ri-stock-line"],
  ["revenue", "Doanh thu & Margin", "ri-line-chart-line"],
  ["customers", "Khách hàng", "ri-group-line"],
  ["cash", "Dòng tiền", "ri-wallet-3-line"],
  ["ar", "Công nợ phải thu", "ri-arrow-down-circle-line"],
  ["ap", "Công nợ phải trả", "ri-arrow-up-circle-line"],
  ["kpi", "KPI & Hoa hồng", "ri-award-line"],
  ["alerts", "Cảnh báo", "ri-alarm-warning-line"],
  ["data", "Dữ liệu", "ri-database-2-line"],
];

export default function DashboardPage() {
  const [data, setData] = useState<DataSet | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("overview");
  const [ky, setKy] = useState("");
  const [toastMsg, setToastMsg] = useState<{ m: string; err: boolean } | null>(null);
  // Mã tra cứu đang mở khi bấm vào một phần của biểu đồ
  const [drillKey, setDrillKey] = useState<string | null>(null);
  // Đơn vị hiển thị tiền, áp cho cả dashboard. "vnd" là số gốc không làm tròn.
  const [donVi, setDonVi] = useState<UnitKey>("ty");
  const [soLe, setSoLe] = useState(2);
  // Lựa chọn trên các tab Xu hướng / Góc nhìn CEO (khoảng thời gian, nhóm khách, kịch bản)
  const [st, setSt] = useState<ViewState>({ gran: "m", cpG: "all", rate: null });
  setUnit(donVi, soLe);

  const toast = useCallback((m: string, e = false) => { setToastMsg({ m, err: e }); setTimeout(() => setToastMsg(null), e ? 7000 : 3600); }, []);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard/data", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Không tải được dữ liệu");
      setData(j as DataSet); setErr("");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const ctx = useMemo(() => (data ? makeCtx(mergeEdits(data)) : null), [data]);
  useEffect(() => {
    if (!ctx || (ky && ctx.periods.includes(ky))) return;
    const now = kyIdx(`T${todayIso().slice(5, 7)}.${todayIso().slice(0, 4)}`);
    const withAct = ctx.periods.filter((p) => hasActual(ctx, p));
    setKy(withAct.slice(-1)[0] || ctx.periods.filter((p) => kyIdx(p) <= now).slice(-1)[0] || ctx.periods[0] || "");
  }, [ctx, ky, data]);

  const base: VM | null = useMemo(() => (ctx && ky ? buildVM(ctx, ky, data, {}) : null), [ctx, ky]);
  const vm: VM | null = useMemo(() => (base ? { ...base, st } : null), [base, st]);

  /** Đổi một lựa chọn của người xem (nút có data-st / data-v, hoặc ô chọn có data-st) */
  function setView(k: string, raw: string) {
    setSt((s) => {
      if (k === "range") {
        const n = Number(raw) || 6;
        return { ...s, tTo: ky, tFrom: kyAdd(ky, -(n - 1)) };
      }
      if (k === "rate") return { ...s, rate: raw === "" ? null : Number(raw), fcScn: raw === "" ? s.fcScn : "custom" };
      return { ...s, [k]: raw };
    });
  }

  // Lưu ghi chú xử lý của một cảnh báo (PIC, hạn, hành động, trạng thái)
  async function saveAlert(box: HTMLElement) {
    const id = box.dataset.alert;
    if (!id) return;
    const get = (f: string) => (box.querySelector(`[data-f="${f}"]`) as HTMLInputElement | HTMLSelectElement | null)?.value || "";
    const btn = box.querySelector(".al-save") as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = "Đang lưu…"; }
    try {
      const r = await fetch("/api/dashboard/alert", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ky, pic: get("pic"), han_xu_ly: get("han_xu_ly") || null, hanh_dong: get("hanh_dong"), trang_thai: get("trang_thai") }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Không lưu được");
      toast("Đã lưu phân công xử lý");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
      if (btn) { btn.disabled = false; btn.textContent = "Lưu"; }
    }
  }

  // Lưu một dòng công nợ sửa trên web (hoặc thêm dòng mới / bỏ sửa tay / ẩn dòng)
  async function saveCongNo(box: HTMLElement, mode: "save" | "reset" | "hide") {
    const loai = box.dataset.loai;
    const val = (f: string) => (box.querySelector(`[data-f="${f}"]`) as HTMLInputElement | null)?.value?.trim() || "";
    const ma = box.dataset.ma || val("__ma");
    if (!loai) return;
    if (!ma) return toast(loai === "ar" ? "Chưa nhập mã khách hàng" : "Chưa nhập mã nhà cung cấp", true);
    const them = box.dataset.them === "1";
    // Dòng thêm mới có thể kèm khách / NCC mới — server chỉ thêm vào danh mục khi mã chưa có
    const moi = box.dataset.moi === "1";
    const khach = moi && loai === "ar" && val("__ten") ? { ten_kh: val("__ten"), nhom: val("__nhom"), pm: val("__pm"), sales: val("__sales"), credit_term: val("__term") } : undefined;
    const ncc = moi && loai === "ap" && val("__ten") ? { ten_ncc: val("__ten"), nganh: val("__nganh"), payment_term: val("__term"), partnership: val("__part") } : undefined;
    const fields: Record<string, string> = {};
    box.querySelectorAll("[data-f]").forEach((el) => {
      const f = (el as HTMLElement).dataset.f as string;
      if (!f.startsWith("__")) fields[f] = (el as HTMLInputElement).value;
    });
    const ky = them ? val("__ky").toUpperCase() : box.dataset.ky || "";
    const so_ct = them ? val("__soct") : box.dataset.soct || "";
    if (them && loai === "ar" && !/^T\d{2}\.\d{4}$/.test(ky)) return toast("Kỳ nợ phải có dạng T09.2026", true);
    if (them && loai === "ap" && ky && !/^T\d{2}\.\d{4}$/.test(ky)) return toast("Kỳ phải có dạng T09.2026 hoặc để trống", true);
    const btns = Array.from(box.querySelectorAll("button")) as HTMLButtonElement[];
    btns.forEach((b) => (b.disabled = true));
    try {
      const r = await fetch("/api/dashboard/congno", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loai, ma, ky, so_ct, tu_tao: them, xoa: mode === "hide", reset: mode === "reset", fields, khach, ncc }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Không lưu được");
      toast(mode === "reset" ? "Đã bỏ số sửa tay / xóa dòng thêm tay" : mode === "hide" ? "Đã ẩn dòng công nợ" : them ? `Đã thêm dòng công nợ${j.taoMoi ? " và thêm " + j.taoMoi + " vào danh mục" : ""}` : "Đã lưu công nợ");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
      btns.forEach((b) => (b.disabled = false));
    }
  }

  // Lưu bảng nhập số tổng (kế hoạch, GMV & giá vốn, chi phí, dòng tiền)
  async function saveNhap(form: HTMLElement) {
    const chia = UNITS[donVi].chia;
    const soTien = (raw: string, tien = true) => { const n = raw === "" ? null : Number(raw.replace(",", ".")); return n == null || !isFinite(n) ? null : Math.round(tien ? n * chia : n); };
    // chỉ gửi những ô thực sự đổi, để ô đang lấy từ file không bị biến thành số nhập tay
    const ins = (Array.from(form.querySelectorAll("input.nq-in")) as HTMLInputElement[])
      .filter((el) => el.value.trim() !== (el.dataset.goc || "") || (el.dataset.tay === "1" && el.value.trim() === ""));
    type Row = { nhom: string; ky: string; khoa: string; gia_tri: number | null; ghi_chu?: string | null };
    const rows: Row[] = [];
    ins.forEach((el) => {
      const raw = el.value.trim();
      const r: Row = { nhom: el.dataset.nhom as string, ky: el.dataset.ky as string, khoa: el.dataset.khoa as string, gia_tri: soTien(raw, el.dataset.tien === "1"), ghi_chu: el.dataset.note || null };
      rows.push(r);
      // xóa GMV của một dòng theo khách thì xóa luôn giá vốn và chiết khấu đi kèm
      if (r.nhom === "gmvkh" && r.khoa.endsWith("|gmv") && raw === "") {
        const b = r.khoa.slice(0, -4);
        rows.push({ nhom: "gmvkh", ky: r.ky, khoa: b + "|gia_von", gia_tri: null }, { nhom: "gmvkh", ky: r.ky, khoa: b + "|chiet_khau", gia_tri: null });
      }
    });
    // Dòng thêm mới: khoản mục chi phí, khoản mục dòng tiền, hoặc GMV của một khách
    let khach: Record<string, string> | undefined;
    for (const trEl of Array.from(form.querySelectorAll("tr.nq-new")) as HTMLElement[]) {
      const q = (c: string) => (trEl.querySelector(c) as HTMLInputElement | HTMLSelectElement | null)?.value.trim() || "";
      const vals = (Array.from(trEl.querySelectorAll("input.nq-v")) as HTMLInputElement[]).filter((el) => el.value.trim() !== "");
      if (!vals.length) continue;
      const nhom = trEl.dataset.nhom as string;
      let base = "", note: string | null = null;
      if (nhom === "gmvkh") {
        const ma = q(".nq-ma");
        if (!ma) return toast("Dòng GMV mới chưa có mã khách", true);
        base = `${ma}|${q(".nq-dv")}`; note = q(".nq-ncc") || null;
        const kf: Record<string, string> = {};
        (Array.from(form.querySelectorAll(".nq-kh-f")) as HTMLInputElement[]).forEach((el) => { if (el.value.trim()) kf[el.dataset.k as string] = el.value.trim(); });
        if (kf.ten_kh) khach = { ma_kh: ma, ...kf };
        if (!vals.some((el) => el.dataset.sfx === "|gmv")) return toast("Dòng GMV mới phải có số GMV", true);
      } else {
        const name = q(".nq-name");
        if (!name) return toast("Chưa nhập tên khoản mục mới", true);
        base = nhom === "cash" && !/^(thu|chi)/i.test(name) ? `${q(".nq-dir") === "in" ? "Thu" : "Chi"} ${name}` : name;
      }
      vals.forEach((el) => rows.push({ nhom, ky: el.dataset.ky || (trEl.dataset.ky as string), khoa: base + (el.dataset.sfx || ""), gia_tri: soTien(el.value.trim()), ghi_chu: el.dataset.sfx === "|gmv" ? note : null }));
    }
    if (!rows.length) return toast("Chưa có ô nào thay đổi");
    const btn = form.querySelector(".nq-save") as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = "Đang lưu…"; }
    try {
      const r = await fetch("/api/dashboard/nhap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows, khach }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Không lưu được");
      toast(`Đã lưu ${j.luu} ô${j.xoa ? `, xóa ${j.xoa} ô nhập tay` : ""}${j.taoMoi ? `, thêm ${j.taoMoi} vào danh mục` : ""}`);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Lưu số đã nhập"; }
    }
  }

  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-dpclose]")) { e.preventDefault(); setDrillKey(null); return; }
    if (t.closest(".dp-wrap") && !t.closest(".dp-box")) { setDrillKey(null); return; }
    if (!t.closest(".dp-box")) {
      const hit = t.closest("[data-drill]") as HTMLElement | null;
      if (hit?.dataset.drill) { e.preventDefault(); setDrillKey(hit.dataset.drill); return; }
    }
    const sb = t.closest("button[data-st]") as HTMLElement | null;
    if (sb?.dataset.st) { e.preventDefault(); setView(sb.dataset.st, sb.dataset.v || ""); return; }
    const tog = t.closest(".cn-toggle") as HTMLElement | null;
    if (tog) {
      e.preventDefault();
      const tr = tog.closest("tr")?.nextElementSibling as HTMLElement | null;
      if (tr?.classList.contains("ed-row")) tr.hidden = !tr.hidden;
      return;
    }
    const nq = t.closest(".nq-save") as HTMLElement | null;
    if (nq) {
      e.preventDefault();
      const form = nq.closest(".nq-form") as HTMLElement | null;
      if (form) saveNhap(form);
      return;
    }
    if (t.closest(".nq-form")) return;
    const cn = t.closest(".cn-save, .cn-reset, .cn-hide") as HTMLElement | null;
    if (cn) {
      e.preventDefault();
      const box = cn.closest(".cn-form") as HTMLElement | null;
      if (box) saveCongNo(box, cn.classList.contains("cn-reset") ? "reset" : cn.classList.contains("cn-hide") ? "hide" : "save");
      return;
    }
    if (t.closest(".cn-form")) return;
    const save = t.closest(".al-save") as HTMLElement | null;
    if (save) {
      e.preventDefault();
      const box = save.closest("[data-alert]") as HTMLElement | null;
      if (box) saveAlert(box);
      return;
    }
    if (t.closest(".al-form")) return;
    const g = t.closest("[data-go]") as HTMLElement | null;
    if (g) { e.preventDefault(); setTab(g.dataset.go || "overview"); window.scrollTo({ top: 0 }); }
  };
  const onChange = (e: React.ChangeEvent<HTMLDivElement>) => {
    const t = e.target as unknown as HTMLSelectElement;
    if (t.tagName === "SELECT" && t.dataset?.st) setView(t.dataset.st, t.value);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key === "Escape" && drillKey) { setDrillKey(null); return; }
    if ((e.key === "Enter" || e.key === " ") && t.dataset.go) { e.preventDefault(); setTab(t.dataset.go); }
  };

  const snap = data?.snapshots.find((s) => s.ky === ky);
  async function lock() {
    if (!vm) return;
    const P = vm.P;
    const payload = { x: P.x, H: P.H, totAct: P.totAct, totTgt: P.totTgt, pT: P.pT.v, pM: P.pM.v, pm: P.pmPeople.map((p) => ({ name: p.name, total: Math.round(p.total), now: Math.round(p.now), laterMax: Math.round(p.laterMax) })), sales: P.sales.map((s) => ({ name: s.name, total: Math.round(s.total) })), partners: P.partners.map((s) => ({ name: s.name, total: Math.round(s.total) })), companyKeep: Math.round(P.companyKeep), comm: Math.round(P.comm) };
    const r = await fetch("/api/dashboard/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ky, data: payload }) });
    const j = await r.json();
    if (!r.ok || j.error) return toast(j.error || "Không chốt được", true);
    toast(`Đã chốt hoa hồng kỳ ${ky}`); await load();
  }
  async function unlock() {
    if (!window.confirm(`Mở khóa số chốt hoa hồng kỳ ${ky}?`)) return;
    const r = await fetch(`/api/dashboard/snapshot?ky=${encodeURIComponent(ky)}`, { method: "DELETE" });
    if (!r.ok) return toast("Không mở khóa được", true);
    toast(`Đã mở khóa kỳ ${ky}`); await load();
  }

  const canEdit = !!data?.me?.canEdit;
  const nCrit = vm ? vm.AL.filter((a) => a.sev === "critical").length : 0;
  const snapComm = snap ? Number((snap.data as { comm?: number }).comm || 0) : 0;

  return (
    <div className="xd" onClick={onClick} onKeyDown={onKey} onChange={onChange}>
      <nav className="xd-tabs no-print" aria-label="Dashboard quản trị"><div className="xd-tabs-in">
        <div className="xd-tablist">
          {TABS.map(([k, l, ic]) => (<button key={k} className={"xd-tab" + (tab === k ? " on" : "")} onClick={() => { setTab(k); setDrillKey(null); }}><i className={ic} aria-hidden="true" />{l}{k === "alerts" && nCrit > 0 && <span className="cnt">{nCrit}</span>}</button>))}
        </div>
        <div className="ctl"><label htmlFor="xdDv">Đơn vị</label>
          <select id="xdDv" value={donVi} onChange={(e) => { const k = e.target.value as UnitKey; setDonVi(k); setSoLe(k === "ty" ? 2 : k === "trieu" ? 1 : 0); }}>
            {(Object.keys(UNITS) as UnitKey[]).map((k) => (<option key={k} value={k}>{UNITS[k].ten}</option>))}
          </select>
          <label htmlFor="xdLe">Số lẻ</label>
          <select id="xdLe" value={soLe} onChange={(e) => setSoLe(Number(e.target.value))}>
            {[0, 1, 2, 3].map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
        </div>
        <div className="ctl"><label htmlFor="xdKy">Kỳ</label>
          <select id="xdKy" value={ky} onChange={(e) => setKy(e.target.value)}>
            {(ctx?.periods || []).map((p) => (<option key={p} value={p}>{p}{ctx && !hasActual(ctx, p) ? " (chưa có thực tế)" : ""}</option>))}
          </select>
          <button className="btn" onClick={() => { load(); toast("Đã tải lại dữ liệu"); }}>Tải lại</button></div>
      </div></nav>
      <div className="xd-page">
        {err && <div className="card notice">Lỗi tải dữ liệu: {err}</div>}
        {!data && !err && <div className="empty">Đang tải dữ liệu…</div>}
        {data && !ctx?.periods.length && tab !== "data" && (
          <div className="card notice">Chưa có dữ liệu. Vào tab <a href="#" data-go="data">Dữ liệu</a> để tải template và upload file đầu tiên.</div>
        )}
        {vm && tab !== "data" && <section className="kpis" dangerouslySetInnerHTML={{ __html: kpiStrip(vm) }} />}
        {vm && tab === "kpi" && vm.P.hasActual && (snap || canEdit) && (
          <div className="card lockbar">
            {snap ? (<>
              <span className="pill dot p-stable">Đã chốt {new Date(snap.locked_at).toLocaleString("vi-VN")}</span>
              <span className="small">Tổng chi hoa hồng đã chốt <b className="num">{tr(snapComm)}</b> · theo dữ liệu hiện tại <b className="num">{tr(vm.P.comm)}</b>{Math.abs(snapComm - vm.P.comm) > 1000 ? " — dữ liệu đã thay đổi sau khi chốt" : ""}</span>
              <span className="spacer" />{canEdit && <button className="btn danger" onClick={unlock}>Mở khóa</button>}
            </>) : (<>
              <span className="small">Số hoa hồng kỳ {ky} đang tính theo dữ liệu hiện tại và sẽ thay đổi nếu upload lại. Chốt để lưu lại số đã duyệt.</span>
              <span className="spacer" /><button className="btn primary" onClick={lock}>Chốt hoa hồng kỳ {ky}</button>
            </>)}
          </div>
        )}
        {vm && tab !== "data" && <div className="view" dangerouslySetInnerHTML={{ __html: renderView(tab, vm) }} />}
        {data && tab === "data" && <DataTab data={data} onDone={load} toast={toast} canEdit={canEdit} />}
      </div>
      {vm && drillKey && <div dangerouslySetInnerHTML={{ __html: drillPanel(vm, drillKey) }} />}
      {toastMsg && <div className={"toast" + (toastMsg.err ? " err" : "")}>{toastMsg.m}</div>}
      {/* Gợi ý mã khi thêm dòng mới — dùng chung cho mọi form trên các tab */}
      {data && <datalist id="dl-kh">{data.customers.map((c) => <option key={c.ma_kh} value={c.ma_kh}>{c.ten_viet_tat || c.ten_kh} · {c.nhom}</option>)}</datalist>}
      {data && <datalist id="dl-ncc">{data.suppliers.map((s) => <option key={s.ma_ncc} value={s.ma_ncc}>{s.ten_ncc} · {s.nganh}</option>)}</datalist>}
    </div>
  );
}
