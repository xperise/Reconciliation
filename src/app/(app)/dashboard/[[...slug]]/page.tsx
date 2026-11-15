"use client";
// Dashboard quản trị tài chính & KPI — /dashboard (tab thứ 3 cạnh Xperise | MLX)
// Mỗi phần / tab có đường dẫn riêng: xem lib/dashboard/routes.ts
import "../dashboard.css";
import "../ops.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataSet } from "@/lib/dashboard/types";
import { makeCtx, segCtx, Seg, Ctx } from "@/lib/dashboard/calc";
import { hasAnyActual, latestActualKy, facts, dashCtx } from "@/lib/dashboard/ops";
import { renderOps, opsStrip, opsAlertOk, opsDrill, chuaGuiBK, OpsState } from "@/lib/dashboard/overview";
import { renderView, drillPanel, buildVM, VM, ViewState } from "@/lib/dashboard/views";
import { kyIdx, kyAdd, todayIso, setUnit, UNITS, UnitKey } from "@/lib/dashboard/util";
import DataTab from "@/components/dashboard/DataTab";
import MobilityFrame from "@/components/dashboard/MobilityFrame";
import MobCostConfig from "@/components/dashboard/MobCostConfig";
import SourceUpload from "@/components/dashboard/SourceUpload";
import { parseRoute, routePath } from "@/lib/dashboard/routes";

// Hai tầng điều hướng: PHẦN (Tổng quan · Travel & SaaS · Mobility) → TAB chỉ số trong phần đó.
// [key, nhãn, icon RemixIcon] — bộ icon của Xperise Design System, không dùng emoji
type Sec = "all" | Seg;
const SECTIONS: [Sec, string, string][] = [
  ["all", "Tổng quan", "ri-dashboard-3-line"],
  ["ts", "Travel & SaaS", "ri-plane-line"],
  ["m", "Mobility", "ri-taxi-line"],
];
const TABS: Record<Sec, [string, string, string][]> = {
  all: [
    ["home", "Điều hành", "ri-compass-3-line"],
    ["cash", "Dòng tiền", "ri-wallet-3-line"],
    ["alerts", "Cảnh báo", "ri-alarm-warning-line"],
    ["data", "Dữ liệu", "ri-database-2-line"],
  ],
  // Travel & SaaS: một tab tổng hợp + một tab nhập trực tiếp công nợ phải thu / phải trả
  ts: [
    ["main", "Tổng hợp", "ri-dashboard-line"],
    ["congno", "Công nợ", "ri-file-list-3-line"],
  ],
  // Mobility = dashboard XPAY (5 tab riêng bên trong khung: Tổng quan, Lộ trình 60 tỷ, Tiến độ khách hàng,
  // Pattern di chuyển, Cập nhật số liệu) — xem components/dashboard/MobilityFrame.tsx
  m: [],
};
type Acc = { all: boolean; ts: boolean; m: boolean; canEdit?: boolean };
/** Dòng tiền ở Tổng quan chỉ gồm thu khách hàng và trả nhà cung cấp: bỏ lương, chi vận hành, hoa hồng */
const CASH_KH_NCC = ["Thu công nợ KH", "Chi nhà cung cấp"];
function khNccCtx(C: Ctx): Ctx {
  const D = C.D;
  return makeCtx({ ...D, opex: [], staff: [], alloc: [], contracts: [], cash: D.cash.filter((r) => CASH_KH_NCC.includes(r.khoan_muc)) });
}
const hasTab = (sec: Sec, t: string) => TABS[sec].some(([k]) => k === t);
const firstTab = (sec: Sec) => TABS[sec][0]?.[0] ?? "";

export default function DashboardPage() {
  const [data, setData] = useState<DataSet | null>(null);
  const [err, setErr] = useState("");
  // Phần / tab mở đầu lấy theo đường dẫn (/dashboard/travel-saas/ar, /dashboard/mobility/progress/input…)
  const [first] = useState(() => (typeof window === "undefined" ? parseRoute("/dashboard") : parseRoute(window.location.pathname, window.location.search)));
  const [sec, setSec] = useState<Sec>(first.sec ?? "all");
  const [tab, setTab] = useState(first.sec && first.sec !== "m" && first.tab && hasTab(first.sec, first.tab) ? first.tab : firstTab(first.sec && first.sec !== "m" ? first.sec : "all") || "home");
  // Mobility: đường dẫn con do khung dashboard XPAY báo lên (overall · roadmap · progress/… · update)
  const [mobPath] = useState(() => (first.sec === "m" ? first.mob : ""));
  const [mobKh] = useState(() => (first.sec === "m" ? first.kh : ""));
  const [ky, setKy] = useState("");
  const [toastMsg, setToastMsg] = useState<{ m: string; err: boolean } | null>(null);
  // Mã tra cứu đang mở khi bấm vào một phần của biểu đồ
  const [drillKey, setDrillKey] = useState<string | null>(null);
  // Đơn vị hiển thị tiền, áp cho cả dashboard. "vnd" là số gốc không làm tròn.
  const [donVi, setDonVi] = useState<UnitKey>("trieu");
  const [soLe, setSoLe] = useState(1);
  const [xuat, setXuat] = useState(false);
  // Lựa chọn trên các tab Xu hướng / Góc nhìn CEO (khoảng thời gian, nhóm khách, kịch bản)
  const [st, setSt] = useState<ViewState & OpsState>({ gran: "m", cpG: "all", rate: null, mode: "ky", dim: "dv" });
  // Mobility: tăng số này để tải lại khung dashboard sau khi nhập dữ liệu
  const [mobKey, setMobKey] = useState(0);
  // Phần Dashboard được xem (Tổng quan / Travel & SaaS / Mobility), admin cấp ở trang Người dùng
  const [acc, setAcc] = useState<Acc | null>(null);
  const [accErr, setAccErr] = useState("");
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
  useEffect(() => {
    fetch("/api/dashboard/me", { cache: "no-store" }).then(async (r) => {
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Không đọc được quyền xem");
      setAcc(j as Acc);
    }).catch((e) => setAccErr(e instanceof Error ? e.message : String(e)));
  }, []);
  const allowed = useCallback((s: Sec) => !!acc && acc[s], [acc]);
  const secs = SECTIONS.filter(([k]) => allowed(k));
  // Tổng quan và Travel & SaaS dùng chung dữ liệu tài chính: chỉ tải khi được xem 1 trong 2 phần
  useEffect(() => { if (acc && (acc.all || acc.ts)) load(); }, [load, acc]);
  // Phần đang chọn không được xem → chuyển sang phần đầu tiên được xem
  useEffect(() => {
    if (!acc || acc[sec]) return;
    const f = SECTIONS.find(([k]) => acc[k]);
    if (f) { setSec(f[0]); setTab(firstTab(f[0])); }
  }, [acc, sec]);

  // Đồng bộ đường dẫn: đổi phần / tab → thêm vào lịch sử trình duyệt (nút Back quay lại đúng tab)
  useEffect(() => {
    if (sec === "m") { if (!location.pathname.startsWith("/dashboard/mobility")) history.pushState(null, "", routePath("m")); return; }
    const p = routePath(sec, tab);
    if (location.pathname !== p) history.pushState(null, "", p);
  }, [sec, tab]);
  useEffect(() => {
    const on = () => { const r = parseRoute(location.pathname, location.search); const s2 = (r.sec ?? "all") as Sec;
      setSec(s2); if (s2 !== "m") setTab(r.tab && hasTab(s2, r.tab) ? r.tab : firstTab(s2)); setDrillKey(null); };
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);

  const ctx = useMemo(() => (data ? dashCtx(data) : null), [data]);
  useEffect(() => {
    if (!ctx || (ky && ctx.periods.includes(ky))) return;
    const now = kyIdx(`T${todayIso().slice(5, 7)}.${todayIso().slice(0, 4)}`);
    setKy(latestActualKy(ctx) || ctx.periods.filter((p) => kyIdx(p) <= now).slice(-1)[0] || ctx.periods[0] || "");
  }, [ctx, ky, data]);

  // Tổng quan dùng số toàn công ty; hai phần còn lại dựng từ dữ liệu đã tách theo mảng
  const base: VM | null = useMemo(() => {
    if (!ctx || !ky || sec === "m") return null;
    if (sec === "all") return tab === "cash" ? buildVM(khNccCtx(ctx), ky, data, {}, { Cc: ctx }) : buildVM(ctx, ky, data, {});
    return buildVM(segCtx(ctx, sec), ky, data, {}, { seg: sec, Cc: ctx });
  }, [ctx, ky, sec, tab === "cash"]);
  /** Ngày mặc định khi xem theo ngày: ngày gần nhất có số */
  const lastDay = useMemo(() => (ctx ? facts(ctx).lastDay : null), [ctx]);
  // Cảnh báo chỉ giữ phần khách hàng / nhà cung cấp (bỏ chi phí quản lý)
  const vm: VM | null = useMemo(() => (base ? { ...base, AL: base.AL.filter(opsAlertOk), st } : null), [base, st]);

  /** Đi tới một tab: "ar" (trong phần đang xem), hoặc "ts:revenue" (sang phần khác) */
  function go(target: string) {
    const [a, b] = target.includes(":") ? target.split(":") : ["", target];
    let s2: Sec = (a as Sec) || sec, t2 = b;
    if (!a && !hasTab(s2, t2)) s2 = hasTab("all", t2) ? "all" : sec;
    if (!allowed(s2)) return;
    if (!hasTab(s2, t2)) t2 = firstTab(s2);
    setSec(s2); setTab(t2); setDrillKey(null);
    window.scrollTo({ top: 0 });
  }
  function pickSec(s2: Sec) {
    if (!allowed(s2)) return;
    setSec(s2); setDrillKey(null);
    if (!hasTab(s2, tab)) setTab(firstTab(s2));
  }

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
    // Sửa dòng có sẵn: chỉ gửi ô thực sự đổi, để bảng tổng và bảng chi tiết không ghi đè số của nhau —
    // ô nào sửa sau cùng thì lấy số đó. Dòng thêm mới thì gửi đủ.
    const fields: Record<string, string> = {};
    box.querySelectorAll("[data-f]").forEach((el) => {
      const f = (el as HTMLElement).dataset.f as string, inp = el as HTMLInputElement;
      if (f.startsWith("__")) return;
      if (!them && mode === "save" && inp.dataset.goc !== undefined && inp.value.trim() === inp.dataset.goc) return;
      fields[f] = inp.value;
    });
    if (!them && mode === "save" && !Object.keys(fields).length) return toast("Chưa có ô nào thay đổi");
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
    {
      // Trong khung chi tiết chỉ nhận các liên kết chéo mảng / khách / NCC (ops:…)
      const hit = t.closest("[data-drill]") as HTMLElement | null;
      if (hit?.dataset.drill && (!t.closest(".dp-box") || hit.dataset.drill.startsWith("ops:"))) {
        e.preventDefault(); setDrillKey(hit.dataset.drill);
        if (hit.dataset.drill.startsWith("ops:")) document.querySelector(".dp-wrap")?.scrollTo({ top: 0 });
        return;
      }
    }
    const gb = t.closest("button[data-guibk]") as HTMLButtonElement | null;
    if (gb && vm) {
      e.preventDefault();
      const den = (document.getElementById("guibkKy") as HTMLSelectElement | null)?.value || "";
      const rows = den ? chuaGuiBK(vm, den) : [];
      if (!rows.length) { toast("Không còn kỳ nào chưa đánh dấu"); return; }
      if (!window.confirm(`Đánh dấu đã gửi bảng kê cho ${rows.length} kỳ nợ (từ ${den} trở về trước)?`)) return;
      gb.disabled = true; gb.textContent = "Đang ghi…";
      fetch("/api/dashboard/nguon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "guibk", rows }) })
        .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || `Lỗi ${r.status}`); toast(`Đã đánh dấu ${j.written} kỳ nợ đã gửi bảng kê`); await load(); })
        .catch((err) => { toast(err instanceof Error ? err.message : String(err), true); gb.disabled = false; gb.textContent = "Đánh dấu đã gửi"; });
      return;
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
    if (g) { e.preventDefault(); go(g.dataset.go || "home"); }
  };
  const onChange = (e: React.ChangeEvent<HTMLDivElement>) => {
    const t = e.target as unknown as HTMLSelectElement;
    if (t.tagName === "SELECT" && t.dataset?.st) setView(t.dataset.st, t.value);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key === "Escape" && drillKey) { setDrillKey(null); return; }
    if ((e.key === "Enter" || e.key === " ") && t.dataset.go) { e.preventDefault(); go(t.dataset.go); }
  };

  const canEdit = !!(data?.me?.canEdit || acc?.canEdit);

  /** Nạp file dữ liệu dashboard Mobility (JSON xuất từ bản claude.ai hoặc file Sao lưu) */
  async function importMobility(f: File) {
    if (!window.confirm(`Nạp "${f.name}" sẽ ghi đè toàn bộ số liệu dashboard Mobility hiện tại. Tiếp tục?`)) return;
    try {
      const body = await f.text();
      JSON.parse(body);
      const r = await fetch("/api/dashboard/mobility/import", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || `Lỗi ${r.status}`);
      toast(`Đã nạp dữ liệu Mobility${j.docs ? ` (${j.docs} mục tiến độ khách hàng)` : ""}`);
      setMobKey((k) => k + 1);
    } catch (e) { toast("Không nạp được: " + (e instanceof Error ? e.message : String(e)), true); }
  }
  const nCrit = vm ? vm.AL.filter((a) => a.sev === "critical").length : 0;

  if (accErr) return <div className="xd"><div className="xd-page"><div className="card notice">{accErr}</div></div></div>;
  if (!acc) return <div className="xd"><div className="xd-page"><div className="empty">Đang tải…</div></div></div>;
  if (!secs.length) return <div className="xd"><div className="xd-page"><div className="card notice">Tài khoản chưa được cấp phần nào của Dashboard. Liên hệ Quản trị.</div></div></div>;

  return (
    <div className="xd" onClick={onClick} onKeyDown={onKey} onChange={onChange}>
      <nav className="xd-tabs no-print" aria-label="Dashboard quản trị"><div className="xd-tabs-in xd-top">
        <div className="xd-secs" role="tablist" aria-label="Phần">
          {secs.map(([k, l, ic]) => (<button key={k} role="tab" aria-selected={sec === k} className={"xd-sec" + (sec === k ? " on" : "")} onClick={() => pickSec(k)}><i className={ic} aria-hidden="true" />{l}</button>))}
        </div>
        {sec === "m" ? (canEdit && <div className="ctl">
          <label className="btn" title="Nạp file dữ liệu chép từ bản dashboard trên claude.ai (ghi đè số liệu hiện tại)">Nhập dữ liệu
            <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importMobility(f); }} /></label>
          <a className="btn" href="/api/dashboard/mobility/import" title="Tải toàn bộ số liệu Mobility ra file để sao lưu">Sao lưu</a>
        </div>) : (<>
        <div className="ctl"><label htmlFor="xdDv">Đơn vị</label>
          <select id="xdDv" value={donVi} onChange={(e) => { const k = e.target.value as UnitKey; setDonVi(k); setSoLe(k === "ty" ? 2 : k === "trieu" ? 1 : 0); }}>
            {(Object.keys(UNITS) as UnitKey[]).map((k) => (<option key={k} value={k}>{UNITS[k].ten}</option>))}
          </select>
          <label htmlFor="xdLe">Số lẻ</label>
          <select id="xdLe" value={soLe} onChange={(e) => setSoLe(Number(e.target.value))}>
            {[0, 1, 2, 3].map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
        </div>
        <div className="ctl">
          <div className="seg" role="group" aria-label="Xem theo">
            <button type="button" className={"seg-b" + (st.mode !== "ngay" ? " on" : "")} onClick={() => setSt((s) => ({ ...s, mode: "ky" }))}>Theo kỳ</button>
            <button type="button" className={"seg-b" + (st.mode === "ngay" ? " on" : "")} onClick={() => setSt((s) => ({ ...s, mode: "ngay", ngay: s.ngay || lastDay || todayIso() }))}>Theo ngày</button>
          </div>
          {st.mode === "ngay" ? (<>
            <label htmlFor="xdNgay">Ngày</label>
            <input id="xdNgay" type="date" className="fld" value={st.ngay || lastDay || todayIso()} max={todayIso()} onChange={(e) => e.target.value && setSt((s) => ({ ...s, ngay: e.target.value }))} />
          </>) : (<>
            <label htmlFor="xdKy">Kỳ</label>
            <select id="xdKy" value={ky} onChange={(e) => setKy(e.target.value)}>
              {(ctx?.periods || []).map((p) => (<option key={p} value={p}>{p}{ctx && !hasAnyActual(ctx, p) ? " (chưa có thực tế)" : ""}</option>))}
            </select>
          </>)}
          {sec === "ts" && ctx && <button className="btn" disabled={xuat} title="Tải toàn bộ dữ liệu Travel & SaaS về Excel: GMV theo ngày, bảng kê, giá vốn NCC, công nợ, danh mục, kế hoạch" onClick={async () => {
            setXuat(true);
            try {
              const r = await fetch("/api/dashboard/xuat"); const j = await r.json();
              if (!r.ok || j.error) throw new Error(j.error || `Lỗi ${r.status}`);
              const { exportTravel } = await import("@/lib/dashboard/exportTs");
              toast(`Đã tải ${await exportTravel(ctx, { kh: j.kh || [], ncc: j.ncc || [] })}`);
            } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
            finally { setXuat(false); }
          }}><i className="ri-download-2-line" aria-hidden="true" /> {xuat ? "Đang xuất…" : "Tải master data"}</button>}
          <button className="btn" onClick={() => { load(); toast("Đã tải lại dữ liệu"); }}>Tải lại</button></div>
        </>)}
      </div>
      {sec !== "m" && <div className="xd-tabs-in">
        <div className="xd-tablist">
          {TABS[sec].map(([k, l, ic]) => (<button key={k} className={"xd-tab" + (tab === k ? " on" : "")} onClick={() => { setTab(k); setDrillKey(null); }}><i className={ic} aria-hidden="true" />{l}{k === "alerts" && nCrit > 0 && <span className="cnt">{nCrit}</span>}</button>))}
        </div>
      </div>}</nav>
      {sec === "m" ? <MobilityFrame reloadKey={mobKey} initialPath={mobPath} initialKh={mobKh} /> : <div className="xd-page">
        {err && <div className="card notice">Lỗi tải dữ liệu: {err}</div>}
        {!data && !err && <div className="empty">Đang tải dữ liệu…</div>}
        {data && !ctx?.periods.length && tab !== "data" && (
          <div className="card notice">Chưa có dữ liệu. Vào tab <a href="#" data-go="data">Dữ liệu</a> để tải template và upload file đầu tiên.</div>
        )}
        {vm && tab !== "data" && <section className="kpis k5" dangerouslySetInnerHTML={{ __html: opsStrip(vm) }} />}
        {vm && tab !== "data" && <div className="view" dangerouslySetInnerHTML={{ __html: renderOps(tab, vm) ?? renderView(tab, vm) }} />}
        {data && tab === "data" && <div className="view" style={{ marginBottom: 16 }}><SourceUpload data={data} canEdit={canEdit} onDone={load} toast={toast} /></div>}
        {data && tab === "data" && <DataTab data={data} onDone={load} toast={toast} canEdit={canEdit} />}
        {data && tab === "data" && <div className="view" style={{ marginTop: 16 }}><MobCostConfig data={data} canEdit={canEdit} onDone={load} toast={toast} /></div>}
      </div>}
      {vm && drillKey && <div dangerouslySetInnerHTML={{ __html: drillKey.startsWith("ops:") ? opsDrill(vm, drillKey) : drillPanel(vm, drillKey) }} />}
      {toastMsg && <div className={"toast" + (toastMsg.err ? " err" : "")}>{toastMsg.m}</div>}
      {/* Gợi ý mã khi thêm dòng mới — dùng chung cho mọi form trên các tab */}
      {data && <datalist id="dl-kh">{data.customers.map((c) => <option key={c.ma_kh} value={c.ma_kh}>{c.ten_viet_tat || c.ten_kh} · {c.nhom}</option>)}</datalist>}
      {data && <datalist id="dl-ncc">{data.suppliers.map((s) => <option key={s.ma_ncc} value={s.ma_ncc}>{s.ten_ncc} · {s.nganh}</option>)}</datalist>}
    </div>
  );
}
