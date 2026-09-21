"use client";
// Dashboard quản trị tài chính & KPI — /dashboard (tab thứ 3 cạnh Xperise | MLX)
import "./dashboard.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataSet } from "@/lib/dashboard/types";
import { makeCtx, calcPeriod, calcAR, calcAP, calcCash, alerts, hasActual } from "@/lib/dashboard/calc";
import { renderView, kpiStrip, VM } from "@/lib/dashboard/views";
import { kyIdx, ty, pc, tr, todayIso } from "@/lib/dashboard/util";
import DataTab from "@/components/dashboard/DataTab";

const TABS: [string, string][] = [["overview", "Tổng quan"], ["revenue", "Doanh thu & Margin"], ["customers", "Khách hàng"], ["cash", "Dòng tiền"], ["ar", "Công nợ phải thu"], ["ap", "Công nợ phải trả"], ["kpi", "KPI & Hoa hồng"], ["alerts", "Cảnh báo"], ["data", "Dữ liệu"]];

export default function DashboardPage() {
  const [data, setData] = useState<DataSet | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("overview");
  const [ky, setKy] = useState("");
  const [toastMsg, setToastMsg] = useState<{ m: string; err: boolean } | null>(null);

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

  const ctx = useMemo(() => (data ? makeCtx(data) : null), [data]);
  useEffect(() => {
    if (!ctx || (ky && ctx.periods.includes(ky))) return;
    const now = kyIdx(`T${todayIso().slice(5, 7)}.${todayIso().slice(0, 4)}`);
    const withAct = ctx.periods.filter((p) => hasActual(ctx, p));
    setKy(withAct.slice(-1)[0] || ctx.periods.filter((p) => kyIdx(p) <= now).slice(-1)[0] || ctx.periods[0] || "");
  }, [ctx, ky]);

  const vm: VM | null = useMemo(() => {
    if (!ctx || !ky) return null;
    const P = calcPeriod(ctx, ky), A = calcAR(ctx), B = calcAP(ctx, A.dso), CS = calcCash(ctx);
    return { C: ctx, P, A, B, CS, AL: alerts(ctx, P, A, B, CS, { ty, pc }), ky };
  }, [ctx, ky]);

  const onClick = (e: React.MouseEvent) => {
    const g = (e.target as HTMLElement).closest("[data-go]") as HTMLElement | null;
    if (g) { e.preventDefault(); setTab(g.dataset.go || "overview"); window.scrollTo({ top: 0 }); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
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
          {TABS.map(([k, l]) => (<button key={k} className={"xd-tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}{k === "alerts" && nCrit > 0 && <span className="cnt">{nCrit}</span>}</button>))}
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
      {toastMsg && <div className={"toast" + (toastMsg.err ? " err" : "")}>{toastMsg.m}</div>}
    </div>
  );
}
