"use client";
// Dashboard quản trị tài chính & KPI — /dashboard (tab thứ 3 cạnh Xperise | MLX)
import "./dashboard.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataSet } from "@/lib/dashboard/types";
import { makeCtx, calcPeriod, calcAR, calcAP, calcCash, alerts, hasActual, customerRows, customersByGroup, arByCustomer, apBySupplier, cashDetail, paySchedule, mergeEdits } from "@/lib/dashboard/calc";
import { renderView, kpiStrip, drillPanel, VM } from "@/lib/dashboard/views";
import { kyIdx, ty, pc, tr, todayIso, setUnit, UNITS, UnitKey, tyLe, leVua, unit } from "@/lib/dashboard/util";
import DataTab from "@/components/dashboard/DataTab";

// [key, nhãn, icon RemixIcon] — bộ icon của Xperise Design System, không dùng emoji
const TABS: [string, string, string][] = [
  ["overview", "Tổng quan", "ri-compass-3-line"],
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

  const vm: VM | null = useMemo(() => {
    if (!ctx || !ky) return null;
    const P = calcPeriod(ctx, ky), A = calcAR(ctx), B = calcAP(ctx, A.dso), CS = calcCash(ctx);
    const CR = customerRows(ctx, ky), ARC = arByCustomer(ctx);
    const AA: Record<string, import("@/lib/dashboard/types").AlertAction> = {};
    (data?.alertActions || []).forEach((x) => { AA[x.id] = x; });
    return {
      C: ctx, P, A, B, CS, AL: alerts(ctx, P, A, B, CS, { ty, pc, tien: (x: number) => `${tyLe(x, leVua(x))} ${unit().nhan}` }, { CR, ARC }), ky,
      CR, GB: customersByGroup(ctx, ky, CR), ARC, APS: apBySupplier(ctx),
      CD: cashDetail(ctx), PS: paySchedule(ctx, ky, P), AA, canEdit: !!data?.me?.canEdit,
    };
  }, [ctx, ky]);

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
    const loai = box.dataset.loai, ma = box.dataset.ma;
    if (!loai || !ma) return;
    const them = box.dataset.them === "1";
    const val = (f: string) => (box.querySelector(`[data-f="${f}"]`) as HTMLInputElement | null)?.value?.trim() || "";
    const fields: Record<string, string> = {};
    box.querySelectorAll("[data-f]").forEach((el) => {
      const f = (el as HTMLElement).dataset.f as string;
      if (!f.startsWith("__")) fields[f] = (el as HTMLInputElement).value;
    });
    const ky = them ? val("__ky").toUpperCase() : box.dataset.ky || "";
    const so_ct = them ? val("__soct") : box.dataset.soct || "";
    if (them && loai === "ar" && !/^T\d{2}\.\d{4}$/.test(ky)) return toast("Kỳ nợ phải có dạng T09.2026", true);
    const btns = Array.from(box.querySelectorAll("button")) as HTMLButtonElement[];
    btns.forEach((b) => (b.disabled = true));
    try {
      const r = await fetch("/api/dashboard/congno", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loai, ma, ky, so_ct, tu_tao: them, xoa: mode === "hide", reset: mode === "reset", fields }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Không lưu được");
      toast(mode === "reset" ? "Đã bỏ số sửa tay, quay về số trong file" : mode === "hide" ? "Đã ẩn dòng công nợ" : them ? "Đã thêm dòng công nợ" : "Đã lưu công nợ");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
      btns.forEach((b) => (b.disabled = false));
    }
  }

  // Lưu bảng nhập số tổng (kế hoạch, GMV & giá vốn, chi phí, dòng tiền)
  async function saveNhap(form: HTMLElement) {
    // chỉ gửi những ô thực sự đổi, để ô đang lấy từ file không bị biến thành số nhập tay
    const ins = (Array.from(form.querySelectorAll("input.nq-in")) as HTMLInputElement[])
      .filter((el) => el.value.trim() !== (el.dataset.goc || "") || (el.dataset.tay === "1" && el.value.trim() === ""));
    if (!ins.length) return toast("Chưa có ô nào thay đổi");
    const rows = ins.map((el) => {
      const raw = el.value.trim();
      const tien = el.dataset.tien === "1";
      const n = raw === "" ? null : Number(raw.replace(",", "."));
      return {
        nhom: el.dataset.nhom as string, ky: el.dataset.ky as string, khoa: el.dataset.khoa as string,
        gia_tri: n == null || !isFinite(n) ? null : Math.round(tien ? n * UNITS[donVi].chia : n),
      };
    });
    const btn = form.querySelector(".nq-save") as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = "Đang lưu…"; }
    try {
      const r = await fetch("/api/dashboard/nhap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Không lưu được");
      toast(`Đã lưu ${j.luu} ô${j.xoa ? `, xóa ${j.xoa} ô nhập tay` : ""}`);
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
    <div className="xd" onClick={onClick} onKeyDown={onKey}>
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
    </div>
  );
}
