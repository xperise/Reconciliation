// Giao diện Tổng quan › Điều hành và Travel & SaaS (Tổng hợp, Công nợ) — từ 11/2026.
// Chỉ phần bán hàng cho khách và trả nhà cung cấp; số liệu tính ở ops.ts.
// Các hàm form công nợ (bảng kê, chi tiết khách, chi tiết NCC, thêm dòng) là bản đã chỉnh từ views.ts:
//   · form chỉ gửi ô có thay đổi (data-goc) → bảng tổng và bảng chi tiết, ô nào sửa sau cùng thì lấy số đó
//   · ngày gửi bảng kê chỉ sửa ở bảng tổng "Bảng kê & tiền thu"
import { Ctx, Seg, SEG_NAME, segCtx, calcAR, calcAP, AR_BUCKETS, num, ArCust } from "./calc";
import { waterfall, divBars, donut, hStack, hBullet, barChart, legend, pill, stCls, empty, LegendItem } from "./charts";
import { kyFromIdx } from "./util";
import { esc, ty, tyN, tr, n0, pc, sum, ok, N1, kyShort, fmtDate, kyIdx, days, unit, unitLabel, axisNum, leVua, tyLe, kyAdd, kyEnd } from "./util";
import { GROUPS } from "./insight";
import type { VM } from "./views";
import { drillPanel } from "./views";
import type { SrcNccSum } from "./types";
import { canonNcc, nccOfSrc, nccTen } from "./alias";
import { dimKey, grpKey, custInfo, groupArCustomers, makeWin, block, facts, mgOf, covOf, byDim, topRest, bridgeOf, nrByCustomer, onTimeSeg, invCol, Win, Dim, Block, Sum, Mode } from "./ops";

/** Lựa chọn của người xem dành cho các màn hình này (nằm chung trong VM.st) */
export interface OpsState { mode?: Mode; ngay?: string; dim?: string; dimAll?: string }
const S = (v: VM) => v.st as OpsState;

/** Dựng tab mới; tab khác trả null để views.ts xử lý như cũ */
export function renderOps(tab: string, v: VM): string | null {
  switch (tab) {
    case "home": return homeOps(v);
    case "main": return tsMain(v);
    case "congno": return tsCongNo(v);
    default: return null;
  }
}
/** Chỉ giữ cảnh báo về khách hàng / nhà cung cấp — bỏ chi phí quản lý (vận hành, EBITDA, hoa hồng, lương) */
export const opsAlertOk = (a: { area: string; msg: string; act: string }) => a.area !== "Chi phí" && !/EBITDA|hoa hồng|lương|chi phí vận hành/i.test(a.msg + " " + a.act);

/* ---------- Phần dùng chung (chép từ views.ts) ---------- */
/** Định dạng tiền tự thêm số lẻ khi số nhỏ so với đơn vị đang chọn */
const tien = (x: number) => { const v = x || 0; return `${tyLe(v, leVua(v))} ${unit().nhan}`; };

const D = (hue: string, step = "default") => `color-display-${hue}-${step}`;

const BCLS = [D("green"), D("yellow"), D("orange"), D("red"), D("red", "strong")];

const GNAME: Record<string, string> = { N1: "Travel", N2: "Top200 active", N3: "Top200 lapser", N4: "Active ngoài Top200", N5: "Lapser ngoài Top200" };

const card = (eyebrow: string, title: string, note: string, body: string, extra = "") =>
  `<div class="card ${extra}"><div class="card-h"><div><div class="eyebrow">${esc(eyebrow)}</div><div class="card-title">${esc(title)}</div></div><div class="card-note">${note}</div></div>${body}</div>`;

const stat = (l: string, v: string, c = "") => `<div class="stat"><div class="l">${esc(l)}</div><div class="v ${c ? "c-" + c : ""}">${v}</div></div>`;

/** "tại 08/10/2026" — kèm ngày chốt số liệu nếu file có khai và khác hôm nay */
const asOfTxt = (C: Ctx) => `tại ${fmtDate(C.asOf)}` + (C.chotFile && C.chotFile !== C.asOf ? ` · số liệu chốt ${fmtDate(C.chotFile)}` : "");

type Tile = [string, string, string, number, string, string, string];

const kpiTiles = (k: Tile[]) => k.map(([l, val, s, m, c, go, ic]) => `<div class="kpi" data-go="${go}" tabindex="0" role="button"><div class="kpi-l"><i class="${ic}" aria-hidden="true"></i>${esc(l)}</div><div class="kpi-n c-${c}">${val}</div><div class="kpi-s">${esc(s)}</div><div class="meter"><i style="width:${Math.min(100, Math.max(0, m * 100))}%;background:var(--${c === "muted" ? "line" : c})"></i></div></div>`).join("");

interface EdF { f: string; l: string; t: "date" | "money" | "text"; v?: string | number | null; w?: string }

function edForm(loai: "ar" | "ap", ma: string, ky: string, soCt: string, fields: EdF[], opts: { them?: boolean; suaTay?: boolean; note?: string } = {}): string {
  const inp = (x: EdF) => {
    const val = x.v == null ? "" : x.t === "money" ? String(Math.round(Number(x.v))) : String(x.v);
    const type = x.t === "date" ? "date" : x.t === "money" ? "number" : "text";
    return `<label${x.w ? ` class="${x.w}"` : ""}>${esc(x.l)}<input type="${type}" class="fld" data-f="${x.f}" value="${esc(val)}" data-goc="${esc(val)}"${x.t === "money" ? " step=\"1000\" inputmode=\"numeric\"" : ""}></label>`;
  };
  return `<div class="cn-form" data-loai="${loai}" data-ma="${esc(ma)}" data-ky="${esc(ky)}" data-soct="${esc(soCt)}"${opts.them ? " data-them=\"1\"" : ""}>
    ${opts.note ? `<div class="cn-note">${esc(opts.note)}</div>` : ""}
    ${fields.map(inp).join("")}
    <div class="cn-act">
      <button type="button" class="btn primary cn-save">${opts.them ? "Thêm dòng" : "Lưu"}</button>
      ${opts.them ? "" : `<button type="button" class="btn cn-reset" title="Bỏ số sửa tay, quay về số trong file template"${opts.suaTay ? "" : " disabled"}>Về số gốc</button>`}
      ${opts.them ? "" : `<button type="button" class="btn danger cn-hide" title="Ẩn cả kỳ này khỏi dashboard">Ẩn kỳ này</button>`}
    </div>
  </div>`;
}

const TT_AR: Record<string, [string, string]> = {
  da_thu: ["Đã thu đủ", "stable"], qua_han: ["Quá hạn", "critical"], den_han: ["Đến hạn hôm nay", "high"], chua_den_han: ["Chưa đến hạn", "neutral"],
};

/** Chi tiết từng khách: kỳ nào chưa trả, còn bao nhiêu, trễ mấy ngày — sửa được số của cả kỳ.
 *  Ngày gửi bảng kê không sửa ở đây: luôn lấy theo bảng "Bảng kê & tiền thu" (tab Công nợ). */
function arDetailCard(v: VM): string {
  const { ARC, C, canEdit } = v;
  if (!ARC.length) return "";
  const detail = ARC.slice(0, 60).map((c) => {
    // Bảng chính là theo KỲ — đây cũng là mức cập nhật công nợ trên web
    // Chỉ hiện kỳ còn nợ và 6 kỳ gần nhất — sổ phải thu có lịch sử nhiều năm, hiện hết thì trang rất nặng
    const lim = kyIdx(v.ky) - 5, show = (ky: string, open: number) => open > 0 || !(kyIdx(ky) < lim);
    const kysShow = c.kys.filter((k) => show(k.ky, k.con_lai)), linesShow = c.lines.filter((l) => show(l.ky, l.con_lai));
    const an = c.kys.length - kysShow.length;
    const kyRows = kysShow.map((k) => {
      const [lab, cls] = TT_AR[k.tt];
      const src = k.nguonBK === "recon" ? ` <span class="src" title="Lấy từ app Reconciliation">↩</span>` : k.nguonBK === "web" ? ` <span class="src web" title="Sửa tay trên web">✎</span>` : "";
      const form = canEdit ? `<tr class="ed-row" hidden><td colspan="10">${edForm("ar", c.ma_kh, k.ky, "", [
        { f: "ngay_den_han", l: "Ngày đến hạn", t: "date", v: k.den_han },
        { f: "so_tien", l: "Phải thu cả kỳ", t: "money", v: k.so_tien },
        { f: "da_thu", l: "Đã thu cả kỳ", t: "money", v: k.da_thu },
        { f: "ngay_thu_du", l: "Ngày thu đủ", t: "date", v: k.thu_du },
        { f: "ngay_thu_gan_nhat", l: "Ngày thu gần nhất", t: "date", v: k.thu_gan_nhat },
        { f: "ghi_chu", l: "Ghi chú", t: "text", v: k.ghiChu, w: "wide" },
      ], { suaTay: k.suaTay, note: (k.n > 1 ? `Kỳ này có ${k.n} hóa đơn trong file. Số sửa ở đây là của cả kỳ: phải thu rải theo tỷ trọng từng hóa đơn, đã thu rải lần lượt từ hóa đơn cũ nhất. ` : "") + "Ngày gửi bảng kê sửa ở bảng Bảng kê & tiền thu (tab Công nợ)." })}</td></tr>` : "";
      return `<tr class="${k.suaTay ? "r-edited" : ""}"><td class="num">${esc(k.ky)}</td><td class="num">${k.guiBK ? fmtDate(k.guiBK) : k.daGui ? "đã gửi" : "—"}${src}</td><td class="num">${fmtDate(k.den_han)}</td><td class="r num">${tyN(k.so_tien)}</td><td class="r num">${k.da_thu ? tyN(k.da_thu) : "–"}</td><td class="r num ${k.con_lai > 0 && k.tt === "qua_han" ? "c-critical" : ""}">${k.con_lai > 0 ? tyN(k.con_lai) : "–"}</td><td class="num">${fmtDate(k.thu_du || (k.thu_gan_nhat && k.thu_gan_nhat <= C.asOf ? k.thu_gan_nhat : null))}</td><td class="r num ${k.tt === "qua_han" ? "c-critical" : ""}">${k.tt === "qua_han" ? n0(k.late) : "–"}</td><td>${pill(lab, cls)}${k.n > 1 ? ` <span class="small">${k.n} HĐ</span>` : ""}</td><td class="r">${canEdit ? `<button type="button" class="icon-btn cn-toggle" title="Cập nhật công nợ kỳ ${esc(k.ky)}"><i class="ri-edit-line"></i></button>` : ""}</td></tr>${form}`;
    }).join("");
    // Chi tiết từng hóa đơn — chỉ để xem
    // tối đa 25 hóa đơn mỗi khách: còn nợ nhiều nhất trước, rồi mới nhất
    const invShow = linesShow.slice().sort((a, b) => b.con_lai - a.con_lai || String(b.ngay_hd || "").localeCompare(String(a.ngay_hd || ""))).slice(0, 25);
    const inv = invShow.map((l) => {
      const [lab, cls] = TT_AR[l.tt];
      return `<tr class="${l.suaTay ? "r-edited" : ""}"><td class="num">${esc(l.ky)}</td><td class="small">${esc(l.so_ct || "—")}</td><td class="num">${fmtDate(l.guiBK)}</td><td class="num">${fmtDate(l.ngay_hd)}</td><td class="num">${fmtDate(l.den_han)}</td><td class="r num">${tyN(l.so_tien)}</td><td class="r num">${l.da_thu ? tyN(l.da_thu) : "–"}</td><td class="r num ${l.con_lai > 0 && l.tt === "qua_han" ? "c-critical" : ""}">${l.con_lai > 0 ? tyN(l.con_lai) : "–"}</td><td class="num">${fmtDate(l.thu_du)}</td><td>${pill(lab, cls)}</td></tr>`;
    }).join("");
    const invTbl = `<table><thead><tr><th>Kỳ nợ</th><th>Số chứng từ</th><th>Gửi bảng kê</th><th>Hóa đơn</th><th>Đến hạn</th><th class="r">Phải thu (${unit().nhan})</th><th class="r">Đã thu (${unit().nhan})</th><th class="r">Còn lại (${unit().nhan})</th><th>Ngày thu đủ</th><th>Trạng thái</th></tr></thead><tbody>${inv}</tbody></table>`;
    return `<details class="cust-det"><summary><b>${esc(c.ten)}</b> <span class="small">${esc(c.nhom)} · PM ${esc(c.pm)} · còn lại <b class="num">${tr(c.open)}</b>${c.overdue > 0 ? ` · quá hạn <b class="num c-critical">${tr(c.overdue)}</b> (trễ nhất ${n0(c.maxLate)} ngày)` : ""} · đúng hạn ${pc(c.onTimeRate, 0)}</span></summary>
      <div class="tw" style="margin-top:10px"><table><thead><tr><th>Kỳ nợ</th><th>Gửi bảng kê</th><th>Đến hạn</th><th class="r">Phải thu (${unit().nhan})</th><th class="r">Đã thu (${unit().nhan})</th><th class="r">Còn lại (${unit().nhan})</th><th>Ngày thu</th><th class="r">Ngày trễ</th><th>Trạng thái</th><th></th></tr></thead><tbody>${kyRows}
      <tr class="tot"><td>Tổng</td><td></td><td></td><td class="r num">${tyN(c.billed)}</td><td class="r num">${tyN(c.paid)}</td><td class="r num">${tyN(c.open)}</td><td></td><td></td><td></td><td></td></tr></tbody></table></div>
      ${an ? `<div class="small" style="margin-top:6px">${an} kỳ đã thu đủ trước ${kyFromIdx(lim)} không hiện.</div>` : ""}<details class="inv-det"><summary>Xem chi tiết ${invShow.length < linesShow.length ? `${invShow.length}/${linesShow.length}` : linesShow.length} hóa đơn của ${esc(c.ten)} (chỉ để xem — số từ file upload${invShow.length < linesShow.length ? "; còn nợ nhiều nhất trước" : ""})</summary><div class="tw" style="margin-top:10px">${invTbl}</div></details>${canEdit ? `<details class="add-det"><summary>+ Thêm kỳ công nợ cho ${esc(c.ten)}</summary>${edForm("ar", c.ma_kh, "", "", [
        { f: "__ky", l: "Kỳ nợ (T09.2026)", t: "text" },
        { f: "ngay_gui_bk", l: "Ngày gửi bảng kê", t: "date" },
        { f: "ngay_hd", l: "Ngày hóa đơn", t: "date" },
        { f: "ngay_den_han", l: "Ngày đến hạn", t: "date" },
        { f: "so_tien", l: "Phải thu cả kỳ", t: "money" },
        { f: "da_thu", l: "Đã thu cả kỳ", t: "money" },
        { f: "ngay_thu_du", l: "Ngày thu đủ", t: "date" },
        { f: "ghi_chu", l: "Ghi chú", t: "text", w: "wide" },
      ], { them: true })}</details>` : ""}</details>`;
  }).join("");

  return card("Chi tiết từng khách", "Kỳ nào chưa trả, còn bao nhiêu, trễ mấy ngày", `${asOfTxt(C)} · bấm tên khách để mở`, `<div class="det-wrap">${detail}</div>` + (ARC.length > 60 ? `<div class="small" style="margin-top:8px">Hiển thị 60/${ARC.length} khách có dư nợ lớn nhất.</div>` : ""));
}

const TT_AP: Record<string, [string, string]> = {
  da_tra: ["Đã trả", "stable"], qua_han: ["Quá hạn", "critical"], sap_den_han: ["Đến hạn ≤ 15 ngày", "high"], con_han: ["Còn hạn", "neutral"],
};

function apSupplierCards(v: VM): string {
  const { APS, C, canEdit } = v;
  if (!APS.length) return "";
  const detail = APS.map((s2) => {
    const kyRows = s2.kys.map((k) => {
      const [lab, cls] = TT_AP[k.tt];
      const form = canEdit ? `<tr class="ed-row" hidden><td colspan="9">${edForm("ap", s2.ma_ncc, k.ky, "", [
        { f: "ngay_hd", l: "Ngày hóa đơn", t: "date", v: k.ngay_hd },
        { f: "ngay_den_han", l: "Ngày đến hạn", t: "date", v: k.den_han },
        { f: "so_tien", l: "Phải trả cả kỳ", t: "money", v: k.so_tien },
        { f: "da_tra", l: "Đã trả cả kỳ", t: "money", v: k.da_tra },
        { f: "ngay_tra", l: "Ngày trả", t: "date", v: k.ngay_tra },
        { f: "ghi_chu", l: "Ghi chú", t: "text", v: k.ghiChu, w: "wide" },
      ], { suaTay: k.suaTay, note: k.n > 1 ? `Kỳ này có ${k.n} hóa đơn trong file. Số sửa ở đây là của cả kỳ: phải trả rải theo tỷ trọng từng hóa đơn, đã trả rải lần lượt từ hóa đơn cũ nhất.` : "" })}</td></tr>` : "";
      return `<tr class="${k.suaTay ? "r-edited" : ""}"><td class="num">${esc(k.ky || fmtDate(k.den_han))}</td><td class="num">${fmtDate(k.ngay_hd)}</td><td class="num">${fmtDate(k.den_han)}</td><td class="r num">${tyN(k.so_tien)}</td><td class="r num">${k.da_tra ? tyN(k.da_tra) : "–"}</td><td class="r num ${k.tt === "qua_han" ? "c-critical" : ""}">${k.con_lai > 0 ? tyN(k.con_lai) : "–"}</td><td class="num">${fmtDate(k.ngay_tra)}</td><td>${pill(lab, cls)}${k.n > 1 ? ` <span class="small">${k.n} HĐ</span>` : ""}</td><td class="r">${canEdit ? `<button type="button" class="icon-btn cn-toggle" title="Cập nhật công nợ kỳ này"><i class="ri-edit-line"></i></button>` : ""}</td></tr>${form}`;
    }).join("");
    const inv = s2.lines.map((l) => {
      const [lab, cls] = TT_AP[l.tt];
      return `<tr class="${l.suaTay ? "r-edited" : ""}"><td class="num">${esc(l.ky || "—")}</td><td class="small">${esc(l.so_ct || "—")}</td><td class="num">${fmtDate(l.ngay_hd)}</td><td class="num">${fmtDate(l.den_han)}</td><td class="r num">${tyN(l.so_tien)}</td><td class="r num">${l.da_tra ? tyN(l.da_tra) : "–"}</td><td class="r num ${l.tt === "qua_han" ? "c-critical" : ""}">${l.con_lai > 0 ? tyN(l.con_lai) : "–"}</td><td class="num">${fmtDate(l.ngay_tra)}</td><td class="r num">${l.dpo != null ? n0(l.dpo) : l.con_lai > 0 ? (l.dueIn < 0 ? "quá " + n0(-l.dueIn) : "còn " + n0(l.dueIn)) : "–"}</td><td>${pill(lab, cls)}</td></tr>`;
    }).join("");
    const invTbl = `<table><thead><tr><th>Kỳ</th><th>Số chứng từ</th><th>Hóa đơn</th><th>Đến hạn</th><th class="r">Phải trả (${unit().nhan})</th><th class="r">Đã trả (${unit().nhan})</th><th class="r">Còn lại (${unit().nhan})</th><th>Ngày trả</th><th class="r">Số ngày</th><th>Trạng thái</th></tr></thead><tbody>${inv}</tbody></table>`;
    return `<details class="cust-det"><summary><b>${esc(s2.ten)}</b> <span class="small">${esc(s2.nganh)} · term ${s2.term ?? "—"} ngày${s2.dpo != null ? ` · DPO thực tế ${n0(s2.dpo)} ngày` : ""} · còn phải trả <b class="num">${tr(s2.open)}</b>${s2.overdue > 0 ? ` · quá hạn <b class="num c-critical">${tr(s2.overdue)}</b>` : ""}</span></summary>
      <div class="tw" style="margin-top:10px"><table><thead><tr><th>Kỳ</th><th>Hóa đơn</th><th>Đến hạn</th><th class="r">Phải trả (${unit().nhan})</th><th class="r">Đã trả (${unit().nhan})</th><th class="r">Còn lại (${unit().nhan})</th><th>Ngày trả</th><th>Trạng thái</th><th></th></tr></thead><tbody>${kyRows}
      <tr class="tot"><td>Tổng</td><td></td><td></td><td class="r num">${tyN(s2.billed)}</td><td class="r num">${tyN(s2.paid)}</td><td class="r num">${tyN(s2.open)}</td><td></td><td></td><td></td></tr></tbody></table></div>
      <details class="inv-det"><summary>Xem chi tiết ${s2.lines.length} hóa đơn của ${esc(s2.ten)} (chỉ để xem — số từ file upload)</summary><div class="tw" style="margin-top:10px">${invTbl}</div></details>${canEdit ? `<details class="add-det"><summary>+ Thêm kỳ công nợ cho ${esc(s2.ten)}</summary>${edForm("ap", s2.ma_ncc, "", "", [
        { f: "__ky", l: "Kỳ (T09.2026)", t: "text" },
        { f: "ngay_hd", l: "Ngày hóa đơn", t: "date" },
        { f: "ngay_den_han", l: "Ngày đến hạn", t: "date" },
        { f: "so_tien", l: "Phải trả cả kỳ", t: "money" },
        { f: "da_tra", l: "Đã trả cả kỳ", t: "money" },
        { f: "ngay_tra", l: "Ngày trả", t: "date" },
        { f: "ghi_chu", l: "Ghi chú", t: "text", w: "wide" },
      ], { them: true })}</details>` : ""}</details>`;
  }).join("");
  const bars = hStack(APS.filter((x) => x.open > 0).slice(0, 12).map((x) => ({
    l: x.ten, sub: `${x.nganh} · Partnership ${x.partnership}`,
    parts: [[x.overdue, D("red"), "Quá hạn"], [x.due15, D("orange"), "≤ 15 ngày"], [Math.max(0, x.open - x.overdue - x.due15), D("green"), "Còn hạn"]] as [number, string, string][],
    txt: tyN(x.open),
  })), { ft: ty, legend: [["Quá hạn", D("red")], ["≤ 15 ngày", D("orange")], ["Còn hạn", D("green")]] });
  return `<div class="g2">${card("Theo nhà cung cấp", "Số còn phải trả và mức độ gấp", unitLabel(), bars)}${card("Chi tiết từng NCC", "Chứng từ nào chưa trả, đến hạn khi nào", `${asOfTxt(C)} · bấm tên NCC để mở`, `<div class="det-wrap">${detail}</div>`)}</div>`;
}

function bangKeCard(v: VM): string {
  const { ARC, C, canEdit } = v;
  const coKy = (k: string) => ARC.some((c) => c.kys.some((x) => x.ky === k));
  // Kỳ đang chọn có thể chưa có bảng kê nào — khi đó lấy kỳ nợ gần nhất để vẫn cập nhật được
  const kyNo = Array.from(new Set(ARC.flatMap((c) => c.kys.map((x) => x.ky)))).filter((k) => ok(kyIdx(k))).sort((a, b) => kyIdx(b) - kyIdx(a));
  const ky = coKy(v.ky) ? v.ky : kyNo[0] || v.ky;
  const ds = ARC.map((c) => ({ c, k: c.kys.find((x) => x.ky === ky) })).filter((x) => x.k) as { c: ArCust; k: ArCust["kys"][number] }[];
  if (!ds.length && !canEdit) return "";
  ds.sort((a, b) => b.k.con_lai - a.k.con_lai || b.k.so_tien - a.k.so_tien);
  const daGui = ds.filter((x) => x.k.daGui).length, daThuDu = ds.filter((x) => x.k.con_lai <= 0).length;
  const note = `${ds.length} khách có bảng kê kỳ ${esc(ky)} · đã gửi ${daGui} · đã thu đủ ${daThuDu}` + (ky !== v.ky ? ` · kỳ ${esc(v.ky)} chưa có bảng kê nào` : "");
  const dt = (x: string | null) => (x ? esc(x) : "");
  const rows = ds.map(({ c, k }) => {
    const [lab, cls] = TT_AR[k.tt];
    const src = k.nguonBK === "recon" ? ` <span class="src" title="Lấy từ app Reconciliation">↩</span>` : k.nguonBK === "web" ? ` <span class="src web" title="Sửa tay trên web">✎</span>` : "";
    const o = canEdit
      ? `<td><input type="date" class="fld bk-in" data-f="ngay_gui_bk" value="${dt(k.guiBK)}" data-goc="${dt(k.guiBK)}">${!k.guiBK && k.daGui ? `<div class="t2 c-stable">đã gửi · chưa có ngày</div>` : ""}</td>
         <td class="r"><input type="number" step="1000" inputmode="numeric" class="fld bk-in money" data-f="da_thu" value="${k.da_thu ? Math.round(k.da_thu) : ""}" data-goc="${k.da_thu ? Math.round(k.da_thu) : ""}" placeholder="0"></td>
         <td><input type="date" class="fld bk-in" data-f="ngay_thu_gan_nhat" value="${dt(k.thu_gan_nhat)}" data-goc="${dt(k.thu_gan_nhat)}"></td>
         <td><input type="date" class="fld bk-in" data-f="ngay_thu_du" value="${dt(k.thu_du)}" data-goc="${dt(k.thu_du)}"></td>
         <td class="r nowrap"><button type="button" class="btn cn-save" title="Lưu dòng này">Lưu</button>${k.tuTao ? ` <button type="button" class="icon-btn cn-reset" title="Xóa dòng thêm tay này"><i class="ri-delete-bin-line"></i></button>` : ""}</td>`
      : `<td class="num">${k.guiBK ? fmtDate(k.guiBK) : k.daGui ? "đã gửi" : "—"}</td><td class="r num">${tyN(k.da_thu)}</td><td class="num">${fmtDate(k.thu_gan_nhat)}</td><td class="num">${fmtDate(k.thu_du)}</td><td></td>`;
    return `<tr class="cn-form ${k.suaTay ? "r-edited" : ""}" data-loai="ar" data-ma="${esc(c.ma_kh)}" data-ky="${esc(ky)}" data-soct="">
      <td><b>${esc(c.ten)}</b><div class="t2">${esc(c.nhom)} · PM ${esc(c.pm)}${src}</div></td>
      <td class="r num">${tyN(k.so_tien)}</td>
      <td class="r num ${k.con_lai > 0 && k.tt === "qua_han" ? "c-critical" : ""}">${k.con_lai > 0 ? tyN(k.con_lai) : "–"}</td>
      <td class="num">${fmtDate(k.den_han)}</td><td>${pill(lab, cls)}</td>${o}</tr>`;
  }).join("");
  const tbl = `<div class="tw bk-tbl"><table class="bk"><thead><tr>
    <th>Khách hàng</th><th class="r">Phải thu (${unit().nhan})</th><th class="r">Còn lại (${unit().nhan})</th><th>Đến hạn</th><th>Trạng thái</th>
    <th>Ngày gửi bảng kê</th><th class="r">Đã thu (VND)</th><th>Ngày thu gần nhất</th><th>Ngày thu đủ</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const huong = canEdit
    ? `Điền rồi bấm <b>Lưu</b> ở cuối dòng. Ô "Đã thu" nhập số VND nguyên. Bảng này và bảng Chi tiết từng khách ghi chung một chỗ: ô nào sửa sau cùng thì lấy số đó; riêng ngày gửi bảng kê chỉ sửa ở bảng này. Khi upload file sổ phải thu, số trong file sẽ <b>ghi đè</b> số nhập tay của các kỳ có trong file. Dòng có biểu tượng thùng rác là dòng thêm tay.`
    : `Chỉ Quản trị và Kế toán mới sửa được các ô này.`;
  return card("Cập nhật trực tiếp", `Bảng kê & tiền thu — kỳ ${esc(ky)}`, note, (ds.length ? tbl : empty(`Kỳ ${ky} chưa có dòng công nợ nào — thêm ở bên dưới.`)) + `<div class="small" style="margin-top:8px">${huong}</div>` + (canEdit ? addArForm(ky) : ""));
}

const NHOM_OPT = GROUPS.map((g) => `<option value="${g}">${g} — ${GNAME[g]}</option>`).join("");

function addArForm(ky: string): string {
  return `<details class="add-det"><summary>+ Thêm dòng công nợ phải thu (khách mới, hoặc kỳ chưa có trong file)</summary>
  <div class="cn-form" data-loai="ar" data-them="1" data-moi="1">
    <label>Mã khách hàng *<input type="text" class="fld" list="dl-kh" data-f="__ma" placeholder="chọn hoặc gõ mã mới"></label>
    <label>Kỳ nợ *<input type="text" class="fld" data-f="__ky" value="${esc(ky)}"></label>
    <label>Ngày gửi bảng kê<input type="date" class="fld" data-f="ngay_gui_bk"></label>
    <label>Ngày hóa đơn<input type="date" class="fld" data-f="ngay_hd"></label>
    <label>Ngày đến hạn *<input type="date" class="fld" data-f="ngay_den_han"></label>
    <label>Phải thu (VND) *<input type="number" class="fld" data-f="so_tien" step="1000" inputmode="numeric"></label>
    <label>Đã thu (VND)<input type="number" class="fld" data-f="da_thu" step="1000" inputmode="numeric"></label>
    <label>Ngày thu đủ<input type="date" class="fld" data-f="ngay_thu_du"></label>
    <label class="wide">Ghi chú<input type="text" class="fld" data-f="ghi_chu"></label>
    <div class="cn-note">Khách chưa có trong danh mục thì điền thêm các ô dưới — hệ thống tự thêm khách vào danh mục. Khách đã có thì bỏ trống.</div>
    <label>Tên khách hàng<input type="text" class="fld" data-f="__ten"></label>
    <label>Nhóm<select class="fld" data-f="__nhom"><option value="">—</option>${NHOM_OPT}</select></label>
    <label>PM phụ trách<input type="text" class="fld" data-f="__pm"></label>
    <label>Sales<input type="text" class="fld" data-f="__sales"></label>
    <label>Credit term (ngày)<input type="number" class="fld" data-f="__term"></label>
    <div class="cn-act"><button type="button" class="btn primary cn-save">Thêm dòng</button></div>
  </div></details>`;
}

const NGANH = ["Hotel", "Flight", "Mobility", "SaaS", "F&B", "Khác"];

function addApForm(ky: string): string {
  return `<details class="add-det"><summary>+ Thêm dòng công nợ phải trả (nhà cung cấp mới, hoặc kỳ chưa có trong file)</summary>
  <div class="cn-form" data-loai="ap" data-them="1" data-moi="1">
    <label>Mã nhà cung cấp *<input type="text" class="fld" list="dl-ncc" data-f="__ma" placeholder="chọn hoặc gõ mã mới"></label>
    <label>Kỳ<input type="text" class="fld" data-f="__ky" value="${esc(ky)}"></label>
    <label>Ngày hóa đơn *<input type="date" class="fld" data-f="ngay_hd"></label>
    <label>Ngày đến hạn *<input type="date" class="fld" data-f="ngay_den_han"></label>
    <label>Phải trả (VND) *<input type="number" class="fld" data-f="so_tien" step="1000" inputmode="numeric"></label>
    <label>Đã trả (VND)<input type="number" class="fld" data-f="da_tra" step="1000" inputmode="numeric"></label>
    <label>Ngày trả<input type="date" class="fld" data-f="ngay_tra"></label>
    <label class="wide">Ghi chú<input type="text" class="fld" data-f="ghi_chu"></label>
    <div class="cn-note">Nhà cung cấp chưa có trong danh mục thì điền thêm các ô dưới. Đã có thì bỏ trống.</div>
    <label>Tên nhà cung cấp<input type="text" class="fld" data-f="__ten"></label>
    <label>Ngành<select class="fld" data-f="__nganh">${NGANH.map((n) => `<option value="${n}">${n}</option>`).join("")}</select></label>
    <label>Payment term (ngày)<input type="number" class="fld" data-f="__term"></label>
    <label>Partnership phụ trách<input type="text" class="fld" data-f="__part"></label>
    <div class="cn-act"><button type="button" class="btn primary cn-save">Thêm dòng</button></div>
  </div></details>`;
}

/* ==========================================================================
   BÁN HÀNG KHÁCH & TRẢ NHÀ CUNG CẤP — Tổng quan › Điều hành và Travel & SaaS › Tổng hợp
   Số liệu tính ở ops.ts. Xem theo kỳ (so kỳ trước, kỳ đang chạy so cùng số ngày)
   hoặc theo ngày (so hôm qua và trung bình 7 ngày trước).
   ========================================================================== */
const winOf = (v: VM): Win => makeWin(v.Cc, S(v).mode || "ky", v.ky, S(v).ngay);
const dPct = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || !isFinite(a) || !isFinite(b) || !b ? null : (a - b) / Math.abs(b));
/** chênh lệch tỷ lệ, tính bằng điểm % */
const dPt = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
const upDown = (d: number | null, txt: string) => (d == null ? "" : `<span class="c-${d >= 0 ? "stable" : "critical"}">${d >= 0 ? "▲" : "▼"}${txt}</span>`);
const dPctTxt = (d: number | null) => upDown(d, d == null ? "" : pc(Math.abs(d), 0));
const dPtTxt = (d: number | null) => upDown(d, d == null ? "" : N1.format(Math.abs(d) * 100) + " điểm");
/** Chữ thuần cho dải KPI (dải KPI không nhận HTML) */
const dPlain = (d: number | null, pt = false) => (d == null ? "" : `${d >= 0 ? "▲" : "▼"}${pt ? N1.format(Math.abs(d) * 100) + " điểm" : pc(Math.abs(d), 0)}`);
const SEG_GO: Record<Seg, string> = { ts: "ts:main", m: "m:" };
const NO_DAILY = "chưa có số theo ngày";

/* ---------- Dải KPI: GMV · Margin · Net revenue · Nợ quá hạn · Khách active ---------- */
export function opsStrip(v: VM): string {
  const W = winOf(v), seg = v.seg ?? null, B = block(v.Cc, W, seg), A = v.A;
  const go = seg ? "main" : "home";
  const day = W.mode === "ngay";
  const cmpS = day ? B.avg : B.prev, cmpL = day ? "TB 7 ngày" : W.prevL;
  const mg = mgOf(B.cur), mgP = B.plan.gmv ? B.plan.nr / B.plan.gmv : null;
  const money = (l: string, ic: string, cur: number, plan: number, cmp: number | undefined): Tile => {
    if (B.noDaily) return [l, "—", NO_DAILY, 0, "muted", go, ic];
    const x = plan ? cur / plan : null;
    const s = [plan ? `${pc(x, 0)} ${day ? "KH ngày" : "của " + ty(plan) + " KH"}` : "chưa có kế hoạch", cmp != null ? `${dPlain(dPct(cur, cmp))} so ${cmpL}` : ""].filter(Boolean).join(" · ");
    return [l, ty(cur), s, x ?? 0, stCls(x), go, ic];
  };
  const k: Tile[] = [
    money("GMV" + (day ? " ngày" : " kỳ"), "ri-shopping-bag-3-line", B.cur.gmv, B.plan.gmv, cmpS?.gmv),
    B.noDaily ? ["Margin", "—", NO_DAILY, 0, "muted", go, "ri-percent-line"]
      : covTile(["Margin", pc(mg, 2), [mgP ? `KH ${pc(mgP, 2)}` : "", cmpS ? `${dPlain(dPt(mg, mgOf(cmpS)), true)} so ${cmpL}` : ""].filter(Boolean).join(" · "), mg != null && mgP ? mg / mgP : 0, stCls(mg != null && mgP ? mg / mgP : null), go, "ri-percent-line"], B),
    covTile(money("Net revenue", "ri-funds-line", B.cur.nr, B.plan.nr, cmpS?.nr), B),
    ["Nợ phải thu quá hạn", A.tot ? pc(A.od / A.tot) : "—", A.tot ? `${ty(A.od)} / ${ty(A.tot)} · DSO ${ok(A.dso) ? n0(A.dso) + " ngày" : "—"}` : "chưa có sổ công nợ", A.tot ? A.od / A.tot : 0, !A.tot ? "muted" : A.od / A.tot > 0.4 ? "critical" : A.od / A.tot > 0.25 ? "high" : "stable", go, "ri-time-line"],
    B.noDaily ? ["Khách hàng active", "—", NO_DAILY, 0, "muted", go, "ri-group-line"]
      : ["Khách hàng active", n0(B.cur.kh), day ? (B.avg ? `TB 7 ngày ${N1.format(B.avg.kh)} khách/ngày` : "") : [B.plan.kh ? `của ${n0(B.plan.kh)} kế hoạch` : "", `${dPlain(dPct(B.cur.kh, B.prev.kh))} so ${W.prevL}`].filter(Boolean).join(" · "),
        !day && B.plan.kh ? B.cur.kh / B.plan.kh : 0, stCls(!day && B.plan.kh ? B.cur.kh / B.plan.kh : null), go, "ri-group-line"],
  ];
  return kpiTiles(k);
}

/** Net revenue & Margin chỉ tính trên phần GMV đã có giá vốn — ghi rõ khi chưa đủ */
function covTile(t: Tile, B: Block): Tile {
  const c = covOf(B.cur);
  if (B.noDaily || c == null || c >= 0.995) return t;
  return [t[0], t[1], `giá vốn có cho ${pc(c, 0)} GMV · ` + t[2], t[3], t[4], t[5], t[6]];
}
/** Ghi chú cửa sổ thời gian đang xem, đặt ở góc thẻ */
function winNote(W: Win): string {
  if (W.mode === "ngay") return `ngày ${fmtDate(W.ngay)} · so hôm qua & TB 7 ngày (${fmtDate(W.last7[0]).slice(0, 5)}–${fmtDate(W.yday).slice(0, 5)})`;
  return `${W.curL} · so ${W.prevL}`;
}
function carriedNote(B: Block): string {
  return B.carried ? `<div class="small c-high" style="margin-top:6px">Travel & SaaS chưa up số ngày đang xem — đang lấy số ngày ${fmtDate(B.carried)} cho tới khi cập nhật.</div>` : "";
}

/* ---------- Tổng quan › Điều hành ---------- */
function homeOps(v: VM): string {
  const C = v.Cc, W = winOf(v), day = W.mode === "ngay";
  const BS: Record<"ts" | "m" | "all", Block> = { ts: block(C, W, "ts"), m: block(C, W, "m"), all: block(C, W, null) };
  const AS = { ts: calcAR(segCtx(C, "ts")), m: calcAR(segCtx(C, "m")), all: calcAR(C) };
  const OT = { ts: onTimeSeg(C, v.ky, "ts"), m: onTimeSeg(C, v.ky, "m"), all: onTimeSeg(C, v.ky, null) };
  const cols: ("ts" | "m" | "all")[] = ["ts", "m", "all"];
  /** dòng so sánh dưới mỗi ô */
  const cmpLines = (B: Block, f: (s: Sum) => number | null, kind: "money" | "pct" | "n") => {
    const fmt = (x: number | null) => (x == null ? "—" : kind === "money" ? tyN(x) : kind === "pct" ? pc(x, 2) : day ? N1.format(x) : n0(x));
    const d = (a: number | null, b: number | null) => (kind === "pct" ? dPtTxt(dPt(a, b)) : dPctTxt(dPct(a, b)));
    const cur = f(B.cur);
    const one = (l: string, s: Sum | null) => (s ? `<div class="t2">${l} ${fmt(f(s))} ${d(cur, f(s))}</div>` : "");
    return day ? one("hôm qua", B.prev) + one("TB 7 ngày", B.avg) : one(W.prevL, B.prev);
  };
  const cell = (k: "ts" | "m" | "all", f: (s: Sum) => number | null, kind: "money" | "pct" | "n") => {
    const B = BS[k];
    if (B.noDaily) return `<span class="c-muted small">${NO_DAILY}</span>`;
    const x = f(B.cur), cls = kind !== "pct" && x != null && x < 0 ? " c-critical" : "";
    return `<b class="num${cls}">${x == null ? "—" : kind === "money" ? tyN(x) : kind === "pct" ? pc(x, 2) : n0(x)}</b>` + cmpLines(B, f, kind);
  };
  const rows: [string, (k: "ts" | "m" | "all") => string, boolean?][] = [
    ["GMV", (k) => cell(k, (s) => s.gmv, "money"), true],
    [day ? "% đạt kế hoạch ngày" : "% đạt kế hoạch", (k) => { const B = BS[k]; if (B.noDaily) return "—"; const x = B.plan.gmv ? B.cur.gmv / B.plan.gmv : null;
      return B.plan.gmv ? `<span class="num c-${stCls(x)}">${pc(x, 0)}</span><div class="t2">${tyN(B.plan.gmv)} kế hoạch</div>` : `<span class="c-muted small">chưa có kế hoạch</span>`; }],
    ["Giá vốn", (k) => cell(k, (s) => s.gv, "money")],
    ["GMV đã có giá vốn", (k) => { const B = BS[k]; if (B.noDaily) return "—"; const c = covOf(B.cur);
      return `<span class="num c-${c == null ? "muted" : c >= 0.95 ? "stable" : c >= 0.7 ? "high" : "critical"}">${pc(c, 0)}</span><div class="t2">${tyN(B.cur.gmvC)}</div>`; }],
    ["Net revenue", (k) => cell(k, (s) => s.nr, "money"), true],
    ["Margin", (k) => { const B = BS[k]; const h = cell(k, (s) => mgOf(s), "pct"); const p = B.plan.gmv ? B.plan.nr / B.plan.gmv : null; return h + (p != null && !B.noDaily ? `<div class="t2">KH ${pc(p, 2)}</div>` : ""); }],
    ["Khách active", (k) => cell(k, (s) => s.kh, "n")],
    ["Nợ phải thu", (k) => { const a = AS[k]; return `<span class="num">${tyN(a.tot)}</span><div class="t2 ${a.tot && a.od / a.tot > 0.25 ? "c-critical" : ""}">quá hạn ${pc(a.tot ? a.od / a.tot : null, 0)}</div>`; }],
    [`Thu đúng hạn (kỳ nợ ${OT.all.ky})`, (k) => { const o = OT[k].rate; return ok(o) ? `<span class="num c-${o >= num(C.D, "nguong_dung_han") ? "stable" : o >= 0.7 ? "high" : "critical"}">${pc(o, 0)}</span>` : "—"; }],
  ];
  const head = (k: "ts" | "m" | "all") => {
    const n = k === "all" ? "Toàn công ty" : SEG_NAME[k];
    const lk = k === "all" ? esc(n) : `<a href="#" data-go="${SEG_GO[k]}">${esc(n)} <i class="ri-arrow-right-up-line"></i></a>`;
    return `<th class="r">${lk}</th>`;
  };
  const F = facts(C);
  const tbl = `<table class="cmp seg-cmp"><thead><tr><th>${esc(unitLabel())}</th>${cols.map(head).join("")}</tr></thead><tbody>${rows.map(([l, f, hl]) => `<tr${hl ? ' class="hl"' : ""}><td>${esc(l)}</td>${cols.map((k) => `<td class="r">${f(k)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const foot = `<div class="small" style="margin-top:6px">Net revenue = GMV − giá vốn · Margin = Net revenue ÷ GMV, cả hai tính trên phần GMV đã có giá vốn (Travel & SaaS: dòng bảng kê nối được file đối soát NCC). Mobility lấy giao dịch ở tab Mobility${F.mobTab ? "" : " (chưa đọc được — đang dùng số trong file template)"}, giá vốn theo % chiết khấu từng đơn vị cung cấp — sửa ở tab <a href="#" data-go="data">Dữ liệu</a>.${day ? " Travel & SaaS: ngày chưa up số lấy số ngày gần nhất trước đó." : W.cutDom ? ` Kỳ đang chạy: so với ngày 1–${W.cutDom} của kỳ trước (số chỉ có theo tháng thì so cả tháng).` : ""}</div>`;
  const cmpCard = card("Hai mảng kinh doanh", day ? `Ngày ${fmtDate(W.ngay)}` : `Kỳ ${W.curL}`, winNote(W), `<div class="tw">${tbl}</div>${carriedNote(BS.ts)}${foot}`);

  /* Cầu nối GMV, Net revenue theo khách, tuổi nợ — mỗi thứ tách Travel & SaaS / Mobility */
  const bridgeCard = (seg: Seg) => {
    const b = bridgeOf(C, W, seg, brGroup(C, seg));
    const br = (x: string) => `ops-br:${seg}:${encodeURIComponent(x)}`;
    const pl = day ? "Hôm qua" : `GMV ${kyShort(kyAdd(W.ky, -1))}`, cl = day ? "Hôm nay" : `GMV ${kyShort(W.ky)}`;
    const title = `Cầu nối GMV ${day ? "hôm qua → hôm nay" : `${kyAdd(W.ky, -1)} → ${W.ky}`}`;
    if (BS[seg].noDaily) return card(`Vì sao GMV ${SEG_NAME[seg]} thay đổi`, title, "", empty(NO_DAILY));
    if (!b.prev && !b.cur) return card(`Vì sao GMV ${SEG_NAME[seg]} thay đổi`, title, "", empty("Chưa có số liệu để so sánh"));
    const grpL = seg === "ts" ? "PM phụ trách" : "đơn vị cung cấp";
    const bars = b.by.filter((x) => Math.abs(x.d) > 0).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 6).sort((x, y) => x.d - y.d);
    return card(`Vì sao GMV ${SEG_NAME[seg]} thay đổi`, title, unitLabel(), waterfall([
      { l: pl, v: b.prev, kind: "total", dr: br("c:prev") }, { l: `Khách mới (${b.nNew})`, v: b.nw, dr: br("c:new") }, { l: `Khách tăng (${b.nUp})`, v: b.up, dr: br("c:up") },
      { l: `Khách giảm (${b.nDown})`, v: b.down, dr: br("c:down") }, { l: `Khách ngừng (${b.nLost})`, v: b.lost, dr: br("c:lost") }, { l: cl, v: b.cur, kind: "total", dr: br("c:cur") },
    ]) + `<div class="small" style="margin-top:2px">Bấm vào từng cột hoặc từng dòng để xem khách nào.</div>` + (bars.length ? `<div class="small" style="margin:10px 0 2px">Thay đổi GMV theo ${grpL}</div>` + divBars(bars.map((p) => ({ l: seg === "ts" ? "PM " + p.k : p.k, sub: `${tien(p.a)} → ${tien(p.b)} · ${p.n} khách`, v: p.d, c: p.d < 0 ? "critical" : D("green"), txt: (p.d >= 0 ? "+" : "−") + tien(Math.abs(p.d)), dr: br("g:" + p.k) })), Math.max(...bars.map((p) => Math.abs(p.d)), 1)) : ""));
  };
  const nrCard = (seg: Seg) => {
    if (BS[seg].noDaily) return card(`Net revenue theo khách · ${SEG_NAME[seg]}`, "Khách nào mang lại nhiều nhất", "", empty(NO_DAILY));
    const rs = nrByCustomer(C, W, seg);
    const neg = rs.filter((r) => r.nr < 0).slice(-6).reverse(), pos = rs.filter((r) => r.nr >= 0).slice(0, neg.length ? 6 : 10);
    const pick = [...pos, ...neg], rng = Math.max(...pick.map((r) => Math.abs(r.nr)), 1);
    return card(`Net revenue theo khách · ${SEG_NAME[seg]}`, "Khách nào mang lại nhiều nhất", `${unitLabel()} · ${rs.length} khách phát sinh`,
      pick.length ? divBars(pick.map((r) => ({ l: r.ten, sub: `${r.sub ? r.sub + " · " : ""}GMV ${tien(r.gmv)} · margin ${pc(r.gmvC ? r.nr / r.gmvC : null, 1)}${r.gmv && r.gmvC / r.gmv < 0.995 ? ` · có giá vốn ${pc(r.gmvC / r.gmv, 0)}` : ""}`, v: r.nr, c: r.nr < 0 ? "critical" : D("green"), txt: (r.nr < 0 ? "−" : "") + tien(Math.abs(r.nr)), dr: drillKey(seg, "kh", r.k) })), rng) : empty("Chưa có GMV trong khoảng đang xem"));
  };
  const agingCard = (seg: Seg) => {
    const A = AS[seg];
    return card(`Rủi ro thu tiền · ${SEG_NAME[seg]}`, "Công nợ phải thu theo tuổi nợ", asOfTxt(C), !A.tot && !A.neg ? empty("Chưa có công nợ phải thu") :
      `<div class="stat-row">${stat("Quá hạn", pc(A.tot ? A.od / A.tot : null, 0), A.tot && A.od / A.tot > 0.25 ? "critical" : "")}${stat("> 60 ngày", ty(A.o60), A.o60 ? "critical" : "")}${stat("DSO", ok(A.dso) ? n0(A.dso) + " ngày" : "—")}</div>` +
      donut(A.bk.map((x, k): [number, string, string, string] => [x, BCLS[k], AR_BUCKETS[k], `ops-ar:${seg}:${k}`]), ty(A.tot), "tổng phải thu", { ft: ty, size: 140 }));
  };
  return sumHome(v) + cmpCard +
    `<div class="g2">${bridgeCard("ts")}${bridgeCard("m")}</div>` +
    `<div class="g2">${nrCard("ts")}${nrCard("m")}</div>` +
    `<div class="g2">${agingCard("ts")}${agingCard("m")}</div>`;
}

/* ---------- Travel & SaaS › Tổng hợp ---------- */
const DIM_L: [Dim, string][] = [["dv", "Theo mảng"], ["kh", "Theo khách hàng"], ["ncc", "Theo nhà cung cấp"]];
/** NCC thuộc Mobility không tính vào Travel & SaaS */
function apTs(v: VM) {
  const nganh = new Map(v.C.D.suppliers.map((s) => [s.ma_ncc, s.nganh]));
  const C2: Ctx = { ...v.C, D: { ...v.C.D, ap: v.C.D.ap.filter((r) => nganh.get(r.ma_ncc) !== "Mobility") } };
  return { B: calcAP(C2, null), APS: v.APS.filter((s) => s.nganh !== "Mobility") };
}
function tsMain(v: VM): string {
  const C = v.Cc, W = winOf(v), day = W.mode === "ngay", B = block(C, W, "ts");
  const dim: Dim = (S(v).dim as Dim) || "dv";

  /* 1. GMV, Net revenue, Margin theo mảng / khách / NCC */
  const sw = `<div class="seg" style="margin-bottom:10px">${DIM_L.map(([k, l]) => `<button type="button" class="seg-b${k === dim ? " on" : ""}" data-st="dim" data-v="${k}">${l}</button>`).join("")}</div>`;
  let body: string;
  if (B.noDaily) body = empty("Travel & SaaS chưa có số theo ngày — xem theo kỳ, hoặc up số theo ngày ở tab Dữ liệu.");
  else {
    const showAll = S(v).dimAll === "1";
    const all = byDim(C, W, "ts", dim), rows = dim === "dv" || showAll ? all : topRest(all, 10);
    const tg = sum(all, (r) => r.cur.gmv), tn = sum(all, (r) => r.cur.nr);
    const cmpL = day ? "TB 7 ngày" : W.prevL;
    const share = (x: number, t: number) => { const p = t ? x / t : 0; return `<div class="sh"><span class="num">${pc(t ? x / t : null, 1)}</span><i style="width:${Math.max(0, Math.min(100, p * 100))}%"></i></div>`; };
    const line = (r: { k?: string; ten: string; sub: string; cur: Sum; cmp: Sum }, cls = "") => {
      const isRest = r.k === "__rest", dr = r.k && !isRest ? ` data-drill="${esc(drillKey("ts", dim, r.k))}" title="Bấm để xem chi tiết"` : "";
      const name = isRest ? `<button type="button" class="lnk" data-st="dimAll" data-v="1">${esc(r.ten)} <i class="ri-arrow-down-s-line"></i> xem tất cả</button>` : `${esc(r.ten)}${r.sub ? `<div class="t2">${esc(r.sub)}</div>` : ""}`;
      const m = mgOf(r.cur), mc = mgOf(r.cmp);
      return `<tr class="${cls}"${dr}><td>${name}</td>` +
        `<td class="r"><span class="num">${tyN(r.cur.gmv)}</span><div class="t2">${tyN(r.cmp.gmv)} ${dPctTxt(dPct(r.cur.gmv, r.cmp.gmv))}</div></td>` +
        `<td class="r"><span class="num${r.cur.nr < 0 ? " c-critical" : ""}">${tyN(r.cur.nr)}</span><div class="t2">${tyN(r.cmp.nr)} ${dPctTxt(dPct(r.cur.nr, r.cmp.nr))}</div></td>` +
        `<td class="r"><span class="num">${pc(m, 2)}</span><div class="t2">${pc(mc, 2)} ${dPtTxt(dPt(m, mc))}</div></td>` +
        `<td class="r">${share(r.cur.gmv, tg)}</td><td class="r">${share(r.cur.nr, tn)}</td>` +
        `<td class="r num${(covOf(r.cur) ?? 1) < 0.7 ? " c-critical" : ""}">${pc(covOf(r.cur), 0)}</td></tr>`;
    };
    const tot = { ten: "Tổng Travel & SaaS", sub: "", cur: B.cur, cmp: day ? (B.avg as Sum) : B.prev };
    body = rows.length ? `<div class="tw"><table class="cmp dimt"><thead><tr><th>${esc(DIM_L.find((x) => x[0] === dim)?.[1].replace("Theo ", "") || "")}</th><th class="r">GMV</th><th class="r">Net revenue</th><th class="r">Margin</th><th class="r">Đóng góp GMV</th><th class="r">Đóng góp Net revenue</th><th class="r">Có giá vốn</th></tr></thead><tbody>${rows.map((r) => line(r, r.k === "__rest" ? "sub" : "")).join("")}${line(tot, "tot")}</tbody></table></div>` +
      `<div class="small" style="margin-top:6px">Dòng nhỏ dưới mỗi số: ${esc(cmpL)} và mức tăng/giảm. Margin = Net revenue ÷ GMV, chênh lệch tính bằng điểm %.${dim === "kh" || dim === "ncc" ? (showAll ? ` Đang hiện cả ${all.length} dòng — <button type="button" class="lnk" data-st="dimAll" data-v="">thu gọn</button>.` : " Hiển thị 10 dòng lớn nhất, bấm “Còn lại” để xem tất cả.") : ""} Bấm vào một dòng để xem chi tiết.</div>`
      : empty("Chưa có GMV trong khoảng đang xem");
  }
  const sales = card("Kết quả bán hàng", `GMV, Net revenue, Margin ${day ? "hôm nay so với TB 7 ngày" : `kỳ ${W.curL} so với ${W.prevL}`}`, unitLabel() + " · " + winNote(W), sw + body + carriedNote(B));

  /* 2. Công nợ khách hàng */
  const A = v.A;
  const IC = invCol(v.C, day ? W.ky : v.ky, 6, W);
  const cur = IC.months[IC.months.length - 1];
  const statsDay = IC.day ? `${stat("Xuất HĐ hôm nay", ty(IC.day.inv))}${stat("Thu hôm nay", ty(IC.day.col))}${stat("TB 7 ngày xuất / thu", `${tyN(IC.day.avgInv)} / ${tyN(IC.day.avgCol)}`)}` : "";
  const invStats = `<div class="stat-row">${statsDay || `${stat(`Xuất HĐ ${kyShort(cur.ky)}`, ty(cur.inv))}${stat(`Đã thu ${kyShort(cur.ky)}`, ty(cur.col))}${stat("Thu / xuất kỳ", pc(cur.inv ? cur.col / cur.inv : null, 0))}`}</div>` +
    `<div class="stat-row">${stat("Dồn tích đã xuất HĐ", ty(IC.totInv))}${stat("Dồn tích đã thu", ty(IC.totCol))}${stat("Tỷ lệ thu dồn tích", pc(IC.totInv ? IC.totCol / IC.totInv : null, 1), IC.totInv && IC.totCol / IC.totInv < 0.8 ? "high" : "")}${stat("Còn phải thu", ty(IC.totInv - IC.totCol), "")}</div>`;
  const u = unit().chia;
  const invChart = barChart({ labels: IC.months.map((m) => kyShort(m.ky)), series: [
    { name: "Đã xuất hóa đơn", c: D("cyan", "strong"), vals: IC.months.map((m) => m.inv / u) },
    { name: "Đã thu", c: D("blue"), vals: IC.months.map((m) => m.col / u) },
  ], showVal: true, fv: axisNum, ft: (x) => axisNum(x) + " " + unit().nhan, fy: axisNum, h: 240, W: 560, bw: 34 });
  const balLine = `<div class="small" style="margin-top:6px"><b>Dư nợ cuối tháng:</b> ${IC.months.map((m, i) => `<span class="num${i === IC.months.length - 1 ? " c-critical" : ""}">${fmtDate(kyEnd(m.ky)).slice(0, 5)} ${tyN(m.bal)}</span>`).join(" → ")}${IC.noDate ? ` · ${tien(IC.noDate)} đã thu chưa có ngày thu, chỉ tính vào dồn tích` : ""}</div>`;
  const invCard = card("Xuất hóa đơn & thu tiền", "Đã thu so với đã xuất hóa đơn", unitLabel() + " · theo tháng xuất HĐ / tháng thu", invStats + invChart + balLine);
  const agingCard = card("Tổng quan", "Công nợ phải thu theo tuổi nợ", asOfTxt(v.C) + (v.C.D.ar.some((r) => r.theoGmv) ? " · phải thu = GMV bảng kê, đã thu theo sổ phải thu" : ""),
    `<div class="stat-row">${stat("Quá hạn", pc(A.tot ? A.od / A.tot : null), "critical")}${stat("> 60 ngày", ty(A.o60), A.o60 ? "critical" : "")}${stat("DSO", ok(A.dso) ? n0(A.dso) + " ngày" : "—")}${stat("Thu nợ đến hạn", pc(A.collectRate))}</div>` +
    donut(A.bk.map((x, k): [number, string, string, string] => [x, BCLS[k], AR_BUCKETS[k], `ar:${k}`]), ty(A.tot), "tổng phải thu", { ft: ty }) +
    (A.neg ? `<div class="small" style="margin-top:8px">Số dư âm ${tr(A.neg)} (khách trả thừa / chờ cấn trừ) tách riêng, không trừ vào tuổi nợ.</div>` : ""));
  const AG = groupArCustomers(v.Cc, A.customers);
  const top = AG.slice(0, 5), rest = AG.slice(5);
  const restB = [0, 1, 2, 3, 4].map((k) => sum(rest, (c) => c.b[k])), restT = sum(rest, (c) => c.tot), restO = sum(rest, (c) => c.od);
  const custRows = [
    ...top.map((c) => ({ l: c.ten, sub: `${c.g} · PM ${c.pm}`, parts: c.b.map((x, k): [number, string, string] => [x, BCLS[k], AR_BUCKETS[k]]), txt: tyN(c.tot), txt2: `quá hạn ${pc(c.tot ? c.od / c.tot : null, 0)}`, dr: drillKey("ts", "kh", c.ma_kh) })),
    ...(rest.length ? [{ l: `Còn lại (${rest.length} khách)`, sub: `${pc(A.tot ? restT / A.tot : null, 0)} tổng dư nợ`, parts: restB.map((x, k): [number, string, string] => [x, BCLS[k], AR_BUCKETS[k]]), txt: tyN(restT), txt2: `quá hạn ${pc(restT ? restO / restT : null, 0)}`, dr: "ops-arall:ts:5" }] : []),
  ];
  const custCard = card("Tuổi nợ theo ngày đến hạn", "Dư nợ theo từng khách hàng", unitLabel() + " · 5 khách lớn nhất và còn lại",
    custRows.length ? hStack(custRows, { ft: tr, legend: AR_BUCKETS.map((b, k): LegendItem => [b, BCLS[k]]) }) : empty("Không còn dư nợ"));
  const arPart = !A.count && !v.C.D.ar.length ? `<div class="card notice">Chưa có công nợ phải thu. Upload ở tab Dữ liệu (Tổng quan), hoặc thêm ở tab <a href="#" data-go="congno">Công nợ</a>.</div>` :
    `<div class="g57">${agingCard}${invCard}</div>${custCard}<div class="small">Chi tiết từng khách (kỳ nào chưa trả, còn bao nhiêu, trễ mấy ngày) ở tab <a href="#" data-go="congno">Công nợ</a>.</div>`;

  /* 3. Công nợ phải trả */
  const { B: P } = apTs(v);
  const NC: Record<string, string> = { Flight: D("cyan"), Hotel: D("blue"), Mobility: D("purple"), SaaS: D("green"), "F&B": D("orange"), Khác: D("gray") };
  const apSum = `<div class="stat-row">${stat("Quá hạn", ty(P.od), P.od ? "high" : "")}${stat("Đến hạn ≤ 15 ngày", ty(P.d7 + P.d15))}${stat("Term HĐ bq", ok(P.wTerm) ? N1.format(P.wTerm) + " ngày" : "—")}</div>` +
    donut(Object.entries(P.byN).filter((e) => e[1] > 0).map(([k, x]): [number, string, string, string] => [x, NC[k] || "ink-3", k, `apn:${k}`]), ty(P.out), "tổng phải trả", { ft: ty });
  const parts = (r: { od: number; d7: number; d15: number; d30: number; later: number }): [number, string, string][] => [[r.od, D("red", "strong"), "Quá hạn"], [r.d7, D("red"), "≤ 7 ngày"], [r.d15, D("orange"), "8–15 ngày"], [r.d30, D("yellow"), "16–30 ngày"], [r.later, D("green"), "> 30 ngày"]];
  const sched = hStack(P.rows.filter((r) => r.out > 0).slice(0, 15).map((r) => ({ l: r.ten, sub: r.nganh, parts: parts(r), txt: tyN(r.out), dr: `apsup:${r.ma_ncc}` })), { ft: tr, legend: [["Quá hạn", D("red", "strong")], ["≤ 7 ngày", D("red")], ["8–15 ngày", D("orange")], ["16–30 ngày", D("yellow")], ["> 30 ngày", D("green")]] });
  const dpoRows = P.rows.filter((r) => ok(r.dpo));
  const term = dpoRows.length ? hBullet(dpoRows.map((r) => { const d = r.dpo as number, t = r.term; const c = t != null && d < t - 4 ? "watch" : t != null && d > t ? "high" : "stable"; return { l: r.ten, sub: r.nganh, v: d, t, c, txt: n0(d) + " ngày", txt2: t == null ? "chưa có term HĐ" : d < t - 4 ? `trả sớm ${n0(t - d)} ngày` : `HĐ ${t} ngày`, vc: c }; }), { max: Math.max(50, ...P.rows.map((r) => Math.max(r.dpo || 0, r.term || 0))) * 1.05 }) : empty("Chưa có dữ liệu");
  const apPart = !P.rows.length ? `<div class="card notice">Chưa có công nợ phải trả. Thêm ở tab <a href="#" data-go="congno">Công nợ</a>.</div>` :
    `<div class="g57">${card("Tổng quan", "Công nợ phải trả theo ngành", asOfTxt(v.C), apSum)}${card("Lịch trả", "Số tiền đến hạn theo nhà cung cấp", unitLabel(), sched)}</div>` +
    card("Kỳ hạn thực hưởng", "DPO thực tế so với payment term hợp đồng", "vạch = term HĐ", term + legend([["Trả sớm hơn HĐ > 4 ngày", "watch"], ["Đúng lịch", "stable"], ["Trễ hạn", "high"], ["Term hợp đồng", "ink", 1, true]]));

  const sec = (t: string) => `<div class="sec-h">${esc(t)}</div>`;
  return sumTs(v) + sales + sec("Công nợ khách hàng") + arPart + sec("Công nợ phải trả") + apDsCard(v, W) + apPart;
}

/* ---------- Travel & SaaS › Công nợ (nhập trực tiếp) ---------- */
/** Kỳ nợ chưa gửi / chưa đánh dấu gửi bảng kê, tới kỳ `den` (gồm cả kỳ đó) */
export function chuaGuiBK(v: VM, den: string): { ma_kh: string; ky: string }[] {
  const out: { ma_kh: string; ky: string }[] = [];
  v.ARC.forEach((c) => c.kys.forEach((k) => {
    if (k.daGui || k.tuTao || !(kyIdx(k.ky) <= kyIdx(den))) return;
    out.push({ ma_kh: c.ma_kh, ky: k.ky });
  }));
  return out;
}
function guiBkCard(v: VM): string {
  if (!v.canEdit) return "";
  const kys = Array.from(new Set(v.ARC.flatMap((c) => c.kys.filter((k) => !k.daGui && !k.tuTao).map((k) => k.ky)))).sort((a, b) => kyIdx(b) - kyIdx(a));
  if (!kys.length) return "";
  const def = kys.includes("T10.2026") ? "T10.2026" : kys[0];
  const opts = kys.map((k) => `<option value="${k}"${k === def ? " selected" : ""}>${k} — ${n0(chuaGuiBK(v, k).length)} kỳ khách chưa đánh dấu</option>`).join("");
  return card("Cập nhật trực tiếp", "Đánh dấu đã gửi bảng kê", "chỉ đánh dấu, không ghi ngày gửi",
    `<div class="small" style="margin-bottom:8px">Mọi kỳ nợ từ kỳ chọn trở về trước chưa gửi bảng kê sẽ được đánh dấu <b>đã gửi</b>. Không ghi ngày gửi — ngày gửi thực tế nhập tay ở bảng "Bảng kê & tiền thu" bên dưới. Kỳ đã có ngày gửi giữ nguyên.</div>` +
    `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label class="small" for="guibkKy">Đến hết kỳ</label><select id="guibkKy" class="fld">${opts}</select>` +
    `<button type="button" class="btn primary" data-guibk="1">Đánh dấu đã gửi</button></div>`);
}
/** Phải trả & đã trả theo NCC trong một kỳ — kế toán nhập đã trả / ngày trả (giống "Bảng kê & tiền thu" bên phải thu).
 *  Phải trả dựng từ file đối soát NCC (cột Bảng kê) và file chi khách sạn trực tiếp B1; lưu ở mức kỳ (fin_ap_edit). */
function apPayCard(v: VM): string {
  const { C, canEdit } = v;
  const sup = new Map(C.D.suppliers.map((s) => [s.ma_ncc, s]));
  const ap = C.D.ap.filter((r) => sup.get(r.ma_ncc)?.nganh !== "Mobility");
  const kys = Array.from(new Set(ap.map((r) => r.ky || "").filter((k) => ok(kyIdx(k))))).sort((a, b) => kyIdx(b) - kyIdx(a));
  if (!kys.length) return "";
  const ky = kys.includes(v.ky) ? v.ky : kys[0];
  type G = { ma: string; ten: string; nganh: string; term: number | null; tien: number; tra: number; han: string; ngayTra: string | null; sua: boolean; ds: boolean };
  const by = new Map<string, G>();
  ap.filter((r) => r.ky === ky).forEach((r) => {
    const s = sup.get(r.ma_ncc);
    const o = by.get(r.ma_ncc) || { ma: r.ma_ncc, ten: s?.ten_ncc || r.ma_ncc, nganh: s?.nganh || "Khác", term: s?.payment_term ?? null, tien: 0, tra: 0, han: r.ngay_den_han, ngayTra: null, sua: false, ds: false };
    o.tien += r.so_tien; o.tra += r.da_tra || 0;
    if (r.ngay_den_han > o.han) o.han = r.ngay_den_han;
    if (r.ngay_tra && (!o.ngayTra || r.ngay_tra > o.ngayTra)) o.ngayTra = r.ngay_tra;
    if (r.suaTay) o.sua = true;
    if ((r.so_ct || "").startsWith("DS ")) o.ds = true;
    by.set(r.ma_ncc, o);
  });
  const list = Array.from(by.values()).sort((a, b) => (b.tien - b.tra) - (a.tien - a.tra) || b.tien - a.tien);
  const asOf = C.asOf;
  const T = list.reduce((s, x) => ({ tien: s.tien + x.tien, tra: s.tra + x.tra }), { tien: 0, tra: 0 });
  const rows = list.map((x) => {
    const con = x.tien - x.tra;
    const st: [string, string] = con <= 1 ? ["Đã trả đủ", "stable"] : x.han < asOf ? ["Quá hạn", "critical"] : x.han === asOf ? ["Đến hạn", "high"] : ["Chưa đến hạn", "watch"];
    const ip = (f: string, t: string, val: string, cls = "") => `<input type="${t}" class="fld bk-in${cls}" data-f="${f}" value="${esc(val)}" data-goc="${esc(val)}"${t === "number" ? ` step="1000" inputmode="numeric" placeholder="0"` : ""}>`;
    const o = canEdit
      ? `<td class="r">${ip("da_tra", "number", x.tra ? String(Math.round(x.tra)) : "", " money")}</td><td>${ip("ngay_tra", "date", x.ngayTra || "")}</td>` +
        `<td class="r nowrap"><button type="button" class="btn cn-save" title="Lưu dòng này">Lưu</button></td>`
      : `<td class="r num">${tyN(x.tra)}</td><td class="num">${fmtDate(x.ngayTra)}</td><td></td>`;
    return `<tr class="cn-form ${x.sua ? "r-edited" : ""}" data-loai="ap" data-ma="${esc(x.ma)}" data-ky="${esc(ky)}" data-soct="">` +
      `<td><b>${esc(x.ten)}</b><div class="t2">${esc(x.nganh)} · term ${x.term != null ? n0(x.term) + " ngày" : "—"}${x.ds ? " · từ file đối soát" : ""}</div></td>` +
      `<td class="r num">${tyN(x.tien)}</td><td class="r num${con > 1 && x.han < asOf ? " c-critical" : ""}">${con > 1 ? tyN(con) : "–"}</td>` +
      `<td class="num">${fmtDate(x.han)}</td><td>${pill(st[0], st[1])}</td>${o}</tr>`;
  }).join("");
  const note = `${list.length} NCC · phải trả ${tyN(T.tien)} · đã trả ${tyN(T.tra)} · còn ${tyN(T.tien - T.tra)} ${unit().nhan}` + (ky !== v.ky ? ` · kỳ ${esc(v.ky)} chưa có phải trả — đang hiện kỳ ${esc(ky)}` : "");
  const tbl = `<div class="tw bk-tbl"><table class="bk"><thead><tr><th>Nhà cung cấp</th><th class="r">Phải trả (${unit().nhan})</th><th class="r">Còn lại (${unit().nhan})</th><th>Đến hạn</th><th>Trạng thái</th>` +
    `<th class="r">Đã trả (VND)</th><th>Ngày trả</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const huong = canEdit
    ? `Phải trả = tổng cột "Bảng kê" (số NCC tính) trong file đối soát NCC của kỳ dịch vụ; khách sạn trực tiếp lấy theo file B1 (đã chi điền sẵn). Nhập <b>đã trả</b> (VND nguyên, tổng đã trả cho kỳ này) và <b>ngày trả</b> rồi bấm Lưu. Đến hạn = cuối kỳ + payment term trong danh mục NCC (NCC mới thêm có term 0 — cập nhật term ở danh mục NCC). Số nhập tay giữ nguyên khi nạp lại file đối soát. Đổi kỳ bằng ô Kỳ ở thanh trên.`
    : `Chỉ Quản trị và Kế toán mới sửa được các ô này.`;
  return card("Cập nhật trực tiếp", `Phải trả & đã trả — kỳ dịch vụ ${esc(ky)}`, note, tbl + `<div class="small" style="margin-top:8px">${huong}</div>`);
}

function tsCongNo(v: VM): string {
  const { APS } = apTs(v);
  const apAdd = v.canEdit ? card("Cập nhật trực tiếp", "Thêm công nợ phải trả", "upload file sổ phải trả sẽ ghi đè số nhập tay của cùng kỳ", addApForm(v.ky)) : "";
  return sumCongNo(v) + guiBkCard(v) + bangKeCard(v) + arDetailCard(v) + apPayCard(v) + apAdd + apSupplierCards({ ...v, APS });
}

/* ---------- Phải trả NCC phát sinh theo file đối soát ----------
   Có: số NCC ghi trên bảng kê (giá vốn) theo NCC & kỳ dịch vụ, tình trạng khớp với hệ thống.
   Chưa có: ngày hóa đơn NCC, payment term, đã trả — nên chưa tính tuổi nợ / quá hạn từ nguồn này. */
function apDsCard(v: VM, W: Win): string {
  const src = v.Cc.D.src;
  if (!src || !src.ncc.length) return "";
  // giá NCC trên hệ thống (HT:) chỉ để làm giá vốn, không phải số NCC đòi — không đưa vào phải trả
  const ky = W.ky, rows = src.ncc.filter((r) => r.ky === ky && r.nganh !== "Mobility" && !(r.khop || "").startsWith("Trùng") && !(r.khop || "").startsWith("HT:"));
  if (!rows.length) return card("Đối soát NCC", `Phải trả phát sinh kỳ ${ky}`, "", empty(`Chưa có file đối soát NCC cho kỳ ${ky}`));
  // Khách sạn trực tiếp (file B1) gộp thành một nhóm; các NCC đối soát giữ riêng
  type G = { ncc: string; nganh: string; bk: number; led: number; khop: number; lech: number; thieu: number; daChi: number; chuaChi: number; n: number; ks: Set<string> };
  const by = new Map<string, G>();
  rows.forEach((r: SrcNccSum) => {
    const b1 = (r.khop || "").startsWith("B1:");
    const k = nccOfSrc(v.Cc.D.suppliers, r);
    const o = by.get(k) || { ncc: nccTen(k, v.Cc.D.suppliers) || v.Cc.D.suppliers.find((s) => s.ma_ncc === k)?.ten_ncc || k, nganh: r.nganh || "—", bk: 0, led: 0, khop: 0, lech: 0, thieu: 0, daChi: 0, chuaChi: 0, n: 0, ks: new Set<string>() };
    o.bk += r.bang_ke; o.led += r.ledger; o.n += r.n;
    if (b1) { if (r.khop === "B1: Đã chi") o.daChi += r.bang_ke; else o.chuaChi += r.bang_ke; if (r.ncc) o.ks.add(r.ncc); }
    else if (r.khop === "Khớp") o.khop += r.bang_ke; else if (r.khop === "Thiếu trong hệ thống") o.thieu += r.bang_ke; else o.lech += r.bang_ke;
    by.set(k, o);
  });
  const list = Array.from(by.values()).sort((a, b) => b.bk - a.bk);
  const T = list.reduce((s, x) => ({ bk: s.bk + x.bk, led: s.led + x.led, thieu: s.thieu + x.thieu, daChi: s.daChi + x.daChi, chuaChi: s.chuaChi + x.chuaChi }), { bk: 0, led: 0, thieu: 0, daChi: 0, chuaChi: 0 });
  const LG: LegendItem[] = [["Khớp", D("green")], ["Lệch tiền", D("yellow")], ["Thiếu trong hệ thống", D("red")], ["B1 đã chi", D("blue")], ["B1 chờ chi", D("orange")]];
  const stack = hStack(list.map((x) => ({ l: x.ncc, sub: x.ks.size ? `${n0(x.ks.size)} khách sạn · ${n0(x.n)} booking` : `${x.nganh} · ${n0(x.n)} dòng · ledger ${tyN(x.led)}`,
    parts: [[x.khop, D("green"), "Khớp"], [x.lech, D("yellow"), "Lệch tiền"], [x.thieu, D("red"), "Thiếu trong hệ thống"], [x.daChi, D("blue"), "B1 đã chi"], [x.chuaChi, D("orange"), "B1 chờ chi"]] as [number, string, string][], txt: tyN(x.bk) })),
    { ft: tr, legend: LG });
  const stats = `<div class="stat-row">${stat("Phải trả phát sinh", ty(T.bk))}${stat("Thiếu trong hệ thống", ty(T.thieu), T.thieu ? "critical" : "")}${T.daChi + T.chuaChi ? stat("KS trực tiếp đã chi / chờ chi", `${tyN(T.daChi)} / ${tyN(T.chuaChi)}`) : ""}</div>`;
  return card("Đối soát NCC", `Phải trả phát sinh theo NCC — kỳ dịch vụ ${ky}`, unitLabel(), stats + stack +
    `<div class="small" style="margin-top:6px">Từ file đối soát NCC (bỏ dòng trùng), kỳ theo ngày giao dịch trên bảng kê. Phải trả khách sạn lẻ (Xperise_Manual) lấy theo giá NCC trên hệ thống, xem ở bảng công nợ phải trả bên dưới. Đối soát NCC chưa có ngày hóa đơn, payment term và số đã trả nên các bảng tuổi nợ / lịch trả bên dưới vẫn lấy từ sổ phải trả cũ.</div>`);
}

/* ==========================================================================
   Chi tiết khi bấm một dòng ở bảng "Kết quả bán hàng" (mảng / khách / NCC).
   Khóa: ops:<mảng kinh doanh>:<chiều>:<mã>. Bấm tiếp một dòng trong chi tiết để chuyển sang
   đối tượng đó (mảng → khách / NCC, khách → NCC, NCC → khách…).
   ========================================================================== */
export const drillKey = (seg: Seg, dim: Dim, k: string) => `ops:${seg}:${dim}:${encodeURIComponent(k)}`;
const DIM_NAME: Record<Dim, string> = { dv: "Mảng", kh: "Khách hàng", ncc: "Nhà cung cấp" };
const nccBare = (s: string | null | undefined) => String(s || "").replace(/^(hotel|flight):/, "");

export function opsDrill(v: VM, key: string): string {
  if (key.startsWith("ops-br:")) return opsBridgeDrill(v, key);
  // Tổng quan › tuổi nợ phải thu của từng mảng: cùng khung chi tiết như ở Travel & SaaS, chỉ lấy khách của mảng đó
  if (key.startsWith("ops-arall:")) return opsArAll(v, key);
  if (key.startsWith("ops-ar:")) { const [, sg, k] = key.split(":"); const A0 = calcAR(segCtx(v.Cc, sg === "m" ? "m" : "ts")); return drillPanel({ ...v, A: sg === "m" ? A0 : { ...A0, customers: groupArCustomers(v.Cc, A0.customers) } }, `ar:${k}`); }
  const [, segS, dimS, enc] = key.split(":");
  const seg = (segS === "m" ? "m" : "ts") as Seg, dim = (["dv", "kh", "ncc"].includes(dimS) ? dimS : "kh") as Dim;
  const k = decodeURIComponent(enc || "");
  const C = v.Cc, W = winOf(v), day = W.mode === "ngay";
  const flt = (f: { dv: string; kh: string; ncc: string }) => dimKey(f as never, dim) === k;
  const self = byDim(C, W, seg, dim).find((r) => r.k === k);
  const close = `<button class="dp-x" data-dpclose="1" aria-label="Đóng"><i class="ri-close-line"></i></button>`;
  const ten = self?.ten || (dim === "kh" ? facts(C).names.get(k) || k : k === "—" ? "Chưa gán NCC" : k);
  const cmpL = day ? "TB 7 ngày" : W.prevL;

  /* số tổng của đối tượng */
  const cur = self?.cur || { gmv: 0, gv: 0, gmvC: 0, nr: 0, kh: 0 }, cmp = self?.cmp || cur;
  const m = mgOf(cur), mc = mgOf(cmp), cv = covOf(cur);
  const stats = `<div class="stat-row">` +
    stat("GMV", ty(cur.gmv)) + stat(`so ${cmpL}`, `${tyN(cmp.gmv)} ${dPctTxt(dPct(cur.gmv, cmp.gmv))}`) +
    stat("Giá vốn", ty(cur.gv)) + stat("Net revenue", ty(cur.nr), cur.nr < 0 ? "critical" : "") +
    stat("Margin", `${pc(m, 2)} ${dPtTxt(dPt(m, mc))}`) + stat("Có giá vốn", pc(cv, 0), cv != null && cv < 0.7 ? "critical" : "") +
    `</div>`;

  /* chia chéo theo hai chiều còn lại */
  const other = (["dv", "kh", "ncc"] as Dim[]).filter((d) => d !== dim);
  const cross = (d2: Dim) => {
    const rs = byDim(C, W, seg, d2, flt as never);
    const tg = sum(rs, (r) => r.cur.gmv) || 1;
    if (!rs.length) return card(`Theo ${DIM_NAME[d2].toLowerCase()}`, `${DIM_NAME[d2]} của ${esc(ten)}`, "", empty("Không có phát sinh trong khoảng đang xem"));
    const body = rs.map((r) => {
      const mm = mgOf(r.cur);
      return `<tr data-drill="${esc(drillKey(seg, d2, r.k))}" title="Bấm để xem ${esc(r.ten)}"><td>${esc(r.ten)}${r.sub ? `<div class="t2">${esc(r.sub)}</div>` : ""}</td>` +
        `<td class="r num">${tyN(r.cur.gmv)}<div class="t2">${dPctTxt(dPct(r.cur.gmv, r.cmp.gmv))}</div></td>` +
        `<td class="r num${r.cur.nr < 0 ? " c-critical" : ""}">${tyN(r.cur.nr)}</td><td class="r num">${pc(mm, 1)}</td><td class="r num">${pc(r.cur.gmv / tg, 1)}</td></tr>`;
    }).join("");
    return card(`Theo ${DIM_NAME[d2].toLowerCase()}`, `${DIM_NAME[d2]} của ${esc(ten)}`, `${rs.length} dòng · ${unitLabel()}`,
      `<div class="tw dp-tbl"><table class="cmp"><thead><tr><th>${DIM_NAME[d2]}</th><th class="r">GMV</th><th class="r">Net revenue</th><th class="r">Margin</th><th class="r">Tỷ trọng</th></tr></thead><tbody>${body}</tbody></table></div>`);
  };

  /* công nợ liên quan */
  const ARC = v.ARC;
  const arTable = (cs: typeof ARC, gmvOf?: Map<string, number>) => {
    if (!cs.length) return empty("Không có công nợ phải thu");
    const body = cs.map((c) => `<tr data-drill="${esc(drillKey(seg, "kh", c.ma_kh))}"><td>${esc(c.ten)}<div class="t2">${esc(c.nhom)} · PM ${esc(c.pm)}</div></td>` +
      (gmvOf ? `<td class="r num">${tyN(gmvOf.get(c.ma_kh) || 0)}</td>` : "") +
      `<td class="r num">${tyN(c.open)}</td><td class="r num${c.overdue ? " c-critical" : ""}">${tyN(c.overdue)}</td><td class="r num">${c.maxLate > 0 ? n0(c.maxLate) + " ngày" : "—"}</td><td class="r num">${pc(c.onTimeRate, 0)}</td></tr>`).join("");
    return `<div class="tw dp-tbl"><table class="cmp"><thead><tr><th>Khách hàng</th>${gmvOf ? `<th class="r">GMV mảng</th>` : ""}<th class="r">Còn phải thu</th><th class="r">Quá hạn</th><th class="r">Trễ lâu nhất</th><th class="r">Thu đúng hạn</th></tr></thead><tbody>${body}</tbody></table></div>`;
  };
  const apSrc = (pred: (r: SrcNccSum) => boolean) => {
    const rows = (C.D.src?.ncc || []).filter((r) => !(r.khop || "").startsWith("Trùng") && !(r.khop || "").startsWith("HT:") && pred(r));
    if (!rows.length) return empty("Chưa có file đối soát NCC / chi khách sạn trực tiếp cho NCC này");
    const by = new Map<string, { ky: string; ncc: string; bk: number; led: number; khop: number; lech: number; thieu: number; da: number; cho: number; n: number }>();
    rows.forEach((r) => {
      const b1 = (r.khop || "").startsWith("B1:");
      const kk = `${r.ky || "—"}|${b1 ? "B1" : nccBare(r.ncc) || "Chưa rõ NCC"}`;
      const o = by.get(kk) || { ky: r.ky || "—", ncc: b1 ? "File chi khách sạn trực tiếp (B1)" : nccBare(r.ncc) || "Chưa rõ NCC", bk: 0, led: 0, khop: 0, lech: 0, thieu: 0, da: 0, cho: 0, n: 0 };
      o.bk += r.bang_ke; o.led += r.ledger; o.n += r.n;
      if (r.khop === "B1: Đã chi") o.da += r.bang_ke; else if (b1) o.cho += r.bang_ke;
      else if (r.khop === "Khớp") o.khop += r.bang_ke; else if (r.khop === "Thiếu trong hệ thống") o.thieu += r.bang_ke; else o.lech += r.bang_ke;
      by.set(kk, o);
    });
    const list = Array.from(by.values()).sort((a, b) => kyIdx(b.ky) - kyIdx(a.ky) || b.bk - a.bk);
    const body = list.map((o) => `<tr><td class="num">${esc(o.ky)}</td><td>${esc(o.ncc)}</td><td class="r num">${n0(o.n)}</td><td class="r num">${tyN(o.bk)}</td><td class="r num">${o.led ? tyN(o.led) : "—"}</td>` +
      `<td class="r num">${o.khop ? tyN(o.khop) : "—"}</td><td class="r num">${o.lech ? tyN(o.lech) : "—"}</td><td class="r num${o.thieu ? " c-critical" : ""}">${o.thieu ? tyN(o.thieu) : "—"}</td>` +
      `<td class="r num">${o.da || o.cho ? `${tyN(o.da)} / ${tyN(o.cho)}` : "—"}</td></tr>`).join("");
    return `<div class="tw dp-tbl"><table class="cmp"><thead><tr><th>Kỳ dịch vụ</th><th>Nguồn</th><th class="r">Số dòng</th><th class="r">Phải trả phát sinh</th><th class="r">Ledger</th><th class="r">Khớp</th><th class="r">Lệch tiền</th><th class="r">Thiếu trong HT</th><th class="r">B1 đã chi / chờ chi</th></tr></thead><tbody>${body}</tbody></table></div>`;
  };
  let debt = "";
  if (dim === "kh") {
    // khóa có thể là nhóm (G:…) gồm nhiều pháp nhân — gộp công nợ của các pháp nhân trong nhóm
    const ms = facts(C).members.get(k) || [k], css = ARC.filter((x) => ms.includes(x.ma_kh));
    const many = css.length > 1;
    const c = !css.length ? null : {
      billed: sum(css, (x) => x.billed), paid: sum(css, (x) => x.paid), open: sum(css, (x) => x.open), overdue: sum(css, (x) => x.overdue),
      maxLate: Math.max(...css.map((x) => x.maxLate)), term: css[0].term,
      onTimeRate: (() => { const w = css.filter((x) => x.onTimeRate != null); const b = sum(w, (x) => x.billed); return b ? sum(w, (x) => (x.onTimeRate as number) * x.billed) / b : null; })(),
      kys: css.flatMap((x) => x.kys.map((y) => ({ ...y, pn: x.ten }))).sort((a, b) => kyIdx(a.ky) - kyIdx(b.ky) || a.pn.localeCompare(b.pn)),
    };
    if (!c) debt = card("Công nợ phải thu", `${esc(ten)}`, "", empty("Không có công nợ phải thu"));
    else {
      const lim = kyIdx(v.ky) - 5;
      const kys = c.kys.filter((x) => x.con_lai > 0 || kyIdx(x.ky) >= lim);
      const TT: Record<string, string> = { da_thu: "Đã thu đủ", qua_han: "Quá hạn", den_han: "Đến hạn", chua_den_han: "Chưa đến hạn" };
      // Đã thu đủ: trễ = ngày thu đủ − ngày đến hạn; còn nợ: trễ tính tới hôm nay
      const lateTxt = (x: { tt: string; late: number; thu_du: string | null; den_han: string }) => {
        if (x.tt === "da_thu") { const d = x.thu_du ? Math.round((Date.parse(x.thu_du) - Date.parse(x.den_han)) / 864e5) : null; return d != null && d > 0 ? ` · trả trễ ${n0(d)} ngày` : d != null ? " · đúng hạn" : ""; }
        return x.late > 0 ? ` · trễ ${n0(x.late)} ngày` : "";
      };
      const body = kys.map((x) => `<tr><td class="num">${esc(x.ky)}</td>${many ? `<td class="small">${esc(x.pn)}</td>` : ""}<td class="num">${x.guiBK ? fmtDate(x.guiBK) : x.daGui ? "đã gửi" : "—"}</td><td class="num">${fmtDate(x.den_han)}</td>` +
        `<td class="r num">${tyN(x.so_tien)}</td><td class="r num">${tyN(x.da_thu)}</td><td class="r num${x.con_lai > 0 && x.tt === "qua_han" ? " c-critical" : ""}">${tyN(x.con_lai)}</td>` +
        `<td>${esc(TT[x.tt] || x.tt)}${lateTxt(x)}</td><td class="num">${x.thu_du ? fmtDate(x.thu_du) : x.thu_gan_nhat ? "gần nhất " + fmtDate(x.thu_gan_nhat) : "—"}</td></tr>`).join("");
      debt = card("Công nợ phải thu", `${esc(ten)} — kỳ còn nợ và 6 kỳ gần nhất`, asOfTxt(v.C) + (many ? ` · ${css.length} pháp nhân` : ""),
        `<div class="stat-row">${stat("Đã xuất HĐ", ty(c.billed))}${stat("Đã thu", ty(c.paid))}${stat("Còn phải thu", ty(c.open))}${stat("Quá hạn", ty(c.overdue), c.overdue ? "critical" : "")}${stat("Trễ lâu nhất", c.maxLate > 0 ? n0(c.maxLate) + " ngày" : "—")}${stat("Thu đúng hạn", pc(c.onTimeRate, 0))}${stat("Credit term", c.term != null ? n0(c.term) + " ngày" : "—")}</div>` +
        (kys.length ? `<div class="tw dp-tbl"><table class="cmp"><thead><tr><th>Kỳ nợ</th>${many ? "<th>Pháp nhân</th>" : ""}<th>Gửi bảng kê</th><th>Đến hạn</th><th class="r">Phải thu</th><th class="r">Đã thu</th><th class="r">Còn lại</th><th>Tình trạng</th><th>Ngày thu</th></tr></thead><tbody>${body}</tbody></table></div>` : empty("Không còn kỳ nợ")));
    }
  } else if (dim === "ncc") {
    const ap = calcAP(v.C, null).rows.find((r) => r.ma_ncc === k || nccBare(r.ten).toUpperCase() === k.toUpperCase());
    const apStat = ap ? `<div class="stat-row">${stat("Còn phải trả (sổ phải trả)", ty(ap.out))}${stat("Quá hạn", ty(ap.od), ap.od ? "high" : "")}${stat("Term HĐ", ap.term != null ? n0(ap.term) + " ngày" : "—")}${stat("DPO thực tế", ok(ap.dpo) ? n0(ap.dpo as number) + " ngày" : "—")}</div>` : "";
    debt = card("Công nợ phải trả", `${esc(ten)} — phát sinh theo đối soát / chi trực tiếp`, unitLabel(),
      apStat + apSrc((r) => nccOfSrc(C.D.suppliers, r) === canonNcc(C.D.suppliers, k)) +
      `<div class="small" style="margin-top:6px">${ap ? "" : "Chưa có trong sổ phải trả nên chưa có tuổi nợ / quá hạn. "}Đối soát NCC chưa có ngày hóa đơn, payment term và số đã trả.</div>`);
  } else {
    const gm = new Map(byDim(C, W, seg, "kh", flt as never).map((r) => [r.k, r.cur.gmv] as [string, number]));
    // gộp theo nhóm cho khớp khóa ở bảng GMV
    const byG = new Map<string, (typeof ARC)[number]>();
    ARC.forEach((c) => {
      const gk = seg === "ts" ? grpKey(C.D, c.ma_kh) : c.ma_kh;
      if (!gm.has(gk)) return;
      const o = byG.get(gk);
      if (!o) { const info = gk === c.ma_kh ? null : custInfo(C, gk); byG.set(gk, { ...c, ma_kh: gk, ten: info?.ten || c.ten, pm: info?.pm || c.pm }); return; }
      o.open += c.open; o.overdue += c.overdue; o.maxLate = Math.max(o.maxLate, c.maxLate);
    });
    const cs = Array.from(byG.values()).filter((c) => c.open !== 0).sort((a, b) => b.open - a.open);
    debt = card("Công nợ phải thu", `Khách có phát sinh ${esc(ten)}`, `${asOfTxt(v.C)} · dư nợ của cả khách, không tách theo mảng`, arTable(cs, gm)) +
      card("Công nợ phải trả", `NCC ${esc(ten)} — phát sinh theo đối soát / chi trực tiếp`, unitLabel(), apSrc((r) => (r.nganh || "") === k));
  }

  return `<div class="dp-wrap"><div class="dp-box">${close}<div class="dp-h"><div class="eyebrow">${DIM_NAME[dim]} · ${seg === "ts" ? "Travel & SaaS" : "Mobility"}</div><div class="card-title">${esc(ten)}</div><div class="small">${esc(self?.sub || "")}${self?.sub ? " · " : ""}${winNote(W)} · ${unitLabel()}</div></div>` +
    stats + `<div class="g2">${other.map(cross).join("")}</div>` + debt +
    `<div class="small" style="margin-top:8px">Bấm một dòng trong các bảng để chuyển sang chi tiết của khách / NCC / mảng đó.</div></div></div>`;
}

/* ---------- Bấm cầu nối GMV: danh sách khách của từng cột / nhóm ---------- */
/** Nhóm của cầu nối: Travel & SaaS theo PM phụ trách, Mobility theo đơn vị cung cấp */
const brGroup = (C: Ctx, seg: Seg) => (seg === "ts" ? (f: { kh: string }) => custInfo(C, f.kh).pm || "—" : (f: { ncc: string }) => f.ncc || "—");
const BR_L: Record<string, string> = { prev: "GMV kỳ trước", cur: "GMV kỳ này", new: "Khách mới", up: "Khách tăng", down: "Khách giảm", lost: "Khách ngừng" };
export function opsBridgeDrill(v: VM, key: string): string {
  const [, segS, enc] = key.split(":");
  const seg = (segS === "m" ? "m" : "ts") as Seg, sel = decodeURIComponent(enc || "");
  const C = v.Cc, W = winOf(v), day = W.mode === "ngay", F = facts(C);
  const b = bridgeOf(C, W, seg, brGroup(C, seg) as never);
  const [kind, val] = [sel.slice(0, 1), sel.slice(2)];
  const pick = b.list.filter((x) => (kind === "g" ? x.grp === val : val === "prev" ? x.a !== 0 : val === "cur" ? x.b !== 0 : x.cat === val));
  pick.sort((x, y) => (val === "prev" ? y.a - x.a : val === "cur" ? y.b - x.b : Math.abs(y.d) - Math.abs(x.d)));
  const pl = day ? "Hôm qua" : `Kỳ ${kyAdd(W.ky, -1)}`, cl = day ? "Hôm nay" : `Kỳ ${W.ky}`;
  const grpL = seg === "ts" ? "PM" : "Đơn vị cung cấp";
  const title = kind === "g" ? `${seg === "ts" ? "PM " : ""}${val}` : BR_L[val] || val;
  const CAT: Record<string, string> = { new: "Mới", up: "Tăng", down: "Giảm", lost: "Ngừng", same: "Không đổi" };
  const close = `<button class="dp-x" data-dpclose="1" aria-label="Đóng"><i class="ri-close-line"></i></button>`;
  const A = sum(pick, (x) => x.a), B = sum(pick, (x) => x.b);
  const body = pick.map((x) => {
    const c = seg === "ts" ? custInfo(C, x.k) : { ten: F.names.get(x.k) || x.k, nhom: C.cust.get(x.k)?.nhom || "", pm: "" };
    return `<tr data-drill="${esc(drillKey(seg, "kh", x.k))}" title="Bấm để xem chi tiết khách"><td>${esc(c.ten)}<div class="t2">${esc([c.nhom, seg === "ts" ? (c.pm ? "PM " + c.pm : "") : x.grp].filter(Boolean).join(" · "))}</div></td>` +
      `<td class="r num">${tyN(x.a)}</td><td class="r num">${tyN(x.b)}</td><td class="r num c-${x.d < 0 ? "critical" : x.d > 0 ? "stable" : "muted"}">${x.d >= 0 ? "+" : "−"}${tyN(Math.abs(x.d))}</td>` +
      `<td class="r num">${x.a ? dPctTxt(dPct(x.b, x.a)) : "—"}</td><td>${CAT[x.cat]}</td></tr>`;
  }).join("");
  const stats = `<div class="stat-row">${stat("Số khách", n0(pick.length))}${stat(pl, ty(A))}${stat(cl, ty(B))}${stat("Thay đổi", `${B - A >= 0 ? "+" : "−"}${tyN(Math.abs(B - A))} ${unit().nhan}`, B - A < 0 ? "critical" : "")}</div>`;
  const tbl = pick.length ? `<div class="tw dp-tbl"><table class="cmp"><thead><tr><th>Khách hàng</th><th class="r">${esc(pl)}</th><th class="r">${esc(cl)}</th><th class="r">Thay đổi</th><th class="r">%</th><th>Loại</th></tr></thead><tbody>${body}</tbody></table></div>` : empty("Không có khách nào");
  return `<div class="dp-wrap"><div class="dp-box">${close}<div class="dp-h"><div class="eyebrow">Cầu nối GMV · ${SEG_NAME[seg]}${kind === "g" ? ` · theo ${grpL.toLowerCase()}` : ""}</div><div class="card-title">${esc(title)}</div><div class="small">${winNote(W)} · ${unitLabel()}</div></div>` +
    stats + tbl + `<div class="small" style="margin-top:8px">Bấm một khách để xem GMV theo mảng / NCC và công nợ của khách đó.</div></div></div>`;
}

/* ---------- Dư nợ theo từng khách: bấm "Còn lại" ra toàn bộ khách (bỏ n khách đầu đã hiện) ---------- */
function opsArAll(v: VM, key: string): string {
  const [, sg, skipS] = key.split(":");
  const seg = (sg === "m" ? "m" : "ts") as Seg, skip = Number(skipS) || 0;
  const A = seg === "ts" && v.seg === "ts" ? v.A : calcAR(segCtx(v.Cc, seg));
  const list = (seg === "ts" ? groupArCustomers(v.Cc, A.customers) : A.customers).slice(skip);
  const close = `<button class="dp-x" data-dpclose="1" aria-label="Đóng"><i class="ri-close-line"></i></button>`;
  const T = [0, 1, 2, 3, 4].map((k) => sum(list, (c) => c.b[k])), tot = sum(list, (c) => c.tot), od = sum(list, (c) => c.od);
  const body = list.map((c, i) => `<tr data-drill="${esc(drillKey(seg, "kh", c.ma_kh))}" title="Bấm để xem chi tiết khách"><td class="num">${i + 1 + skip}</td><td>${esc(c.ten)}<div class="t2">${esc(c.g)} · PM ${esc(c.pm)}</div></td>` +
    c.b.map((x) => `<td class="r num">${x ? tyN(x) : "–"}</td>`).join("") +
    `<td class="r num"><b>${tyN(c.tot)}</b></td><td class="r num${c.tot && c.od / c.tot > 0.5 ? " c-critical" : ""}">${pc(c.tot ? c.od / c.tot : null, 0)}</td></tr>`).join("");
  const tbl = `<div class="tw dp-tbl"><table class="cmp"><thead><tr><th>#</th><th>Khách hàng</th>${AR_BUCKETS.map((b) => `<th class="r">${esc(b)}</th>`).join("")}<th class="r">Tổng dư nợ</th><th class="r">Quá hạn</th></tr></thead><tbody>${body}` +
    `<tr class="tot"><td></td><td>Tổng ${list.length} khách</td>${T.map((x) => `<td class="r num">${tyN(x)}</td>`).join("")}<td class="r num">${tyN(tot)}</td><td class="r num">${pc(tot ? od / tot : null, 0)}</td></tr></tbody></table></div>`;
  return `<div class="dp-wrap"><div class="dp-box">${close}<div class="dp-h"><div class="eyebrow">Dư nợ theo từng khách · ${SEG_NAME[seg]}</div><div class="card-title">${skip ? `Các khách còn lại (ngoài ${skip} khách lớn nhất)` : "Tất cả khách"}</div><div class="small">${asOfTxt(v.C)} · ${unitLabel()}</div></div>` +
    `<div class="stat-row">${stat("Số khách", n0(list.length))}${stat("Tổng dư nợ", ty(tot))}${stat("Quá hạn", ty(od), od ? "critical" : "")}</div>` + tbl +
    `<div class="small" style="margin-top:8px">Bấm một khách để xem chi tiết GMV, kỳ nợ còn lại và ngày thu.</div></div></div>`;
}

/* ==========================================================================
   TÓM TẮT ĐIỀU HÀNH — đầu mỗi tab. Câu chữ sinh từ số liệu: chỉ số chính, và rủi ro công nợ
   nằm ở đâu (nhóm khách, PM, nhà cung cấp).
   ========================================================================== */
type Pt = [string, string];
function band(eyebrow: string, lead: string, pts: Pt[]): string {
  if (!lead && !pts.length) return "";
  return `<div class="card banner sub"><div class="eyebrow">${esc(eyebrow)}</div>` + (lead ? `<p>${esc(lead)}</p>` : "") +
    (pts.length ? `<ul class="band-list">${pts.map(([t, c]) => `<li class="bl-${c}">${esc(t)}</li>`).join("")}</ul>` : "") + `</div>`;
}
const tt = (x: number) => `${tyN(x)} ${unit().nhan}`;
const sevPlan = (x: number | null) => (x == null ? "neutral" : x >= 1 ? "stable" : x >= 0.9 ? "watch" : x >= 0.7 ? "high" : "critical");
const dWord = (a: number, b: number) => (b ? `${a >= b ? "tăng" : "giảm"} ${pc(Math.abs(a - b) / Math.abs(b), 0)}` : "");

/** Câu GMV / Net revenue / margin của một khối số liệu */
function leadOf(name: string, B: Block, W: Win): string {
  if (B.noDaily) return `${name}: chưa có số theo ngày.`;
  const cmp = W.mode === "ngay" ? B.avg : B.prev, cmpL = W.mode === "ngay" ? "TB 7 ngày" : W.prevL;
  const parts = [`GMV ${tt(B.cur.gmv)}`];
  if (B.plan.gmv) parts.push(`đạt ${pc(B.cur.gmv / B.plan.gmv, 0)} kế hoạch`);
  if (cmp && cmp.gmv) parts.push(`${dWord(B.cur.gmv, cmp.gmv)} so ${cmpL}`);
  const m = mgOf(B.cur);
  return `${name}: ${parts.join(", ")}; Net revenue ${tt(B.cur.nr)}, margin ${pc(m, 2)}.`;
}

/** Rủi ro phải thu: quá hạn tập trung ở nhóm khách nào, PM nào */
function arRisk(C: Ctx, A: ReturnType<typeof calcAR>, label: string, byGroup: boolean): Pt[] {
  const out: Pt[] = [];
  if (!A.tot) return out;
  const odPct = A.od / A.tot;
  out.push([`${label}: còn phải thu ${tt(A.tot)}, quá hạn ${tt(A.od)} (${pc(odPct, 0)})${A.o60 ? `, trong đó trên 60 ngày ${tt(A.o60)}` : ""}${ok(A.dso) ? ` · DSO ${n0(A.dso)} ngày` : ""}.`, odPct > 0.4 ? "critical" : odPct > 0.25 ? "high" : "watch"]);
  const cs = (byGroup ? groupArCustomers(C, A.customers) : A.customers).filter((c) => c.od > 0).sort((a, b) => b.od - a.od);
  if (cs.length && A.od) {
    const top = cs.slice(0, 3), share = sum(top, (c) => c.od) / A.od;
    out.push([`Quá hạn tập trung ở ${top.map((c) => `${c.ten} ${tt(c.od)}${c.pm && c.pm !== "—" ? ` (PM ${c.pm})` : ""}`).join(", ")} — ${pc(share, 0)} số quá hạn.`, share > 0.6 ? "critical" : "high"]);
    // PM theo nhóm (Master Data) khi hiển thị theo nhóm
    const byPm = new Map<string, number>();
    cs.forEach((c) => { const k = c.pm && c.pm !== "—" ? c.pm : "Chưa có PM"; byPm.set(k, (byPm.get(k) || 0) + c.od); });
    const pms = Array.from(byPm.entries()).sort((a, b) => b[1] - a[1]);
    if (pms.length) out.push([`Theo PM: ${pms.slice(0, 4).map(([k, x]) => `${k} ${tt(x)} (${pc(x / A.od, 0)})`).join(" · ")}.`, "neutral"]);
  }
  return out;
}
/** Rủi ro phải trả: còn phải trả, quá hạn, NCC nào */
function apRisk(v: VM): Pt[] {
  const { B } = apTs(v);
  if (!B.out) return [];
  const top = B.rows.filter((r) => r.od > 0).sort((a, b) => b.od - a.od).slice(0, 3);
  const out: Pt[] = [[`Phải trả NCC: còn ${tt(B.out)}, quá hạn ${tt(B.od)}${B.d7 + B.d15 ? `, đến hạn trong 15 ngày ${tt(B.d7 + B.d15)}` : ""}.`, B.od > B.out * 0.3 ? "high" : "watch"]];
  if (top.length) out.push([`Quá hạn trả nhiều nhất: ${top.map((r) => `${r.ten} ${tt(r.od)}`).join(", ")}${B.rows.some((r) => !r.term) ? " (một số NCC chưa có payment term nên đến hạn tính ngay cuối kỳ)" : ""}.`, "high"]);
  return out;
}

function sumHome(v: VM): string {
  const C = v.Cc, W = winOf(v);
  const BA = block(C, W, null), BT = block(C, W, "ts"), BM = block(C, W, "m");
  const pts: Pt[] = [];
  const pTs = BT.plan.gmv ? BT.cur.gmv / BT.plan.gmv : null, pM = BM.plan.gmv ? BM.cur.gmv / BM.plan.gmv : null;
  if (!BT.noDaily) pts.push([`Travel & SaaS: GMV ${tt(BT.cur.gmv)}${pTs != null ? ` (${pc(pTs, 0)} kế hoạch)` : ""}, margin ${pc(mgOf(BT.cur), 2)}, ${n0(BT.cur.kh)} khách.`, sevPlan(pTs)]);
  if (!BM.noDaily && (BM.cur.gmv || BM.plan.gmv)) pts.push([`Mobility: GMV ${tt(BM.cur.gmv)}${pM != null ? ` (${pc(pM, 0)} kế hoạch)` : ""}, margin ${pc(mgOf(BM.cur), 2)}, ${n0(BM.cur.kh)} khách.`, sevPlan(pM)]);
  // biến động lớn nhất theo khách
  if (W.mode === "ky") {
    const b = bridgeOf(C, W, "ts", (f) => custInfo(C, f.kh).pm || "—");
    const down = b.list.filter((x) => x.d < 0).sort((a, b2) => a.d - b2.d).slice(0, 2);
    if (down.length && b.cur < b.prev) pts.push([`GMV Travel & SaaS giảm ${tt(b.prev - b.cur)} so ${W.prevL}, giảm nhiều nhất ở ${down.map((x) => `${custInfo(C, x.k).ten} (−${tt(-x.d)})`).join(", ")}.`, "high"]);
  }
  const cv = covOf(BT.cur);
  if (!BT.noDaily && cv != null && cv < 0.95) pts.push([`Giá vốn Travel & SaaS mới có cho ${pc(cv, 0)} GMV — Net revenue / margin còn thiếu phần chưa có giá vốn.`, "watch"]);
  pts.push(...arRisk(C, calcAR(segCtx(C, "ts")), "Phải thu Travel & SaaS", true));
  const AM = calcAR(segCtx(C, "m"));
  if (AM.tot) pts.push(...arRisk(C, AM, "Phải thu Mobility", false).slice(0, 2));
  pts.push(...apRisk(v));
  return band("Tóm tắt điều hành", leadOf(W.mode === "ngay" ? `Ngày ${fmtDate(W.ngay)}` : `Kỳ ${W.curL}`, BA, W), pts);
}

function sumTs(v: VM): string {
  const C = v.Cc, W = winOf(v), B = block(C, W, "ts");
  const pts: Pt[] = [];
  if (!B.noDaily) {
    // theo mảng: đạt kế hoạch, thay đổi
    const T = C.D.targets.find((t) => t.ky === W.ky);
    const planDv: Record<string, number> = T ? { Hotel: Number(T.gmv_hotel || 0), Flight: Number(T.gmv_flight || 0), SaaS: Number(T.gmv_saas_t || 0), "F&B": Number(T.gmv_fnb || 0) } : {};
    const dvs = byDim(C, W, "ts", "dv");
    if (dvs.length) pts.push([`Theo mảng: ${dvs.map((r) => { const p = W.mode === "ky" ? planDv[r.k] : 0; return `${r.ten} ${tt(r.cur.gmv)}${p ? ` (${pc(r.cur.gmv / p, 0)} KH)` : ""}, margin ${pc(mgOf(r.cur), 1)}`; }).join(" · ")}.`, "neutral"]);
    const ks = byDim(C, W, "ts", "kh"), tot = sum(ks, (r) => r.cur.gmv);
    if (ks.length && tot) {
      const t3 = sum(ks.slice(0, 3), (r) => r.cur.gmv) / tot;
      pts.push([`${n0(ks.filter((r) => r.cur.gmv > 0).length)} khách phát sinh; 3 khách lớn nhất (${ks.slice(0, 3).map((r) => r.ten).join(", ")}) chiếm ${pc(t3, 0)} GMV.`, t3 > 0.6 ? "high" : "neutral"]);
      const neg = ks.filter((r) => r.cur.nr < 0).sort((a, b) => a.cur.nr - b.cur.nr).slice(0, 3);
      if (neg.length) pts.push([`Net revenue âm: ${neg.map((r) => `${r.ten} (${tt(r.cur.nr)})`).join(", ")}.`, "high"]);
    }
    const cv = covOf(B.cur);
    if (cv != null && cv < 0.95) pts.push([`Giá vốn mới có cho ${pc(cv, 0)} GMV — nạp thêm đối soát NCC / giá NCC hệ thống ở tab Dữ liệu.`, "watch"]);
  }
  pts.push(...arRisk(C, v.A, "Phải thu", true));
  const IC = invCol(v.C, W.ky, 6, W);
  if (IC.totInv) pts.push([`Dồn tích đã thu ${pc(IC.totCol / IC.totInv, 0)} số đã xuất hóa đơn; còn ${tt(IC.totInv - IC.totCol)}.`, IC.totCol / IC.totInv < 0.8 ? "high" : "neutral"]);
  pts.push(...apRisk(v));
  return band("Tóm tắt điều hành", leadOf(W.mode === "ngay" ? `Travel & SaaS ngày ${fmtDate(W.ngay)}` : `Travel & SaaS kỳ ${W.curL}`, B, W), pts);
}

function sumCongNo(v: VM): string {
  const A = v.A, pts: Pt[] = [];
  // bảng kê chưa gửi / chưa thu theo pháp nhân
  const prev = kyAdd(kyOf(v.C.asOf), -1);
  const chuaGui = v.ARC.flatMap((c) => c.kys.filter((k) => !k.daGui && !k.tuTao && kyIdx(k.ky) <= kyIdx(prev) && k.con_lai > 0).map((k) => ({ c, k })));
  if (chuaGui.length) pts.push([`${n0(chuaGui.length)} kỳ nợ tới ${prev} còn dư nợ nhưng chưa ghi nhận gửi bảng kê (${tt(sum(chuaGui, (x) => x.k.con_lai))}) — đánh dấu hoặc nhập ngày gửi ở bên dưới.`, "watch"]);
  const qh = v.ARC.filter((c) => c.overdue > 0).sort((a, b) => b.overdue - a.overdue);
  if (qh.length) pts.push([`Pháp nhân quá hạn nhiều nhất: ${qh.slice(0, 4).map((c) => `${c.ten} ${tt(c.overdue)} (trễ ${n0(c.maxLate)} ngày)`).join(", ")}.`, "critical"]);
  const { B } = apTs(v);
  const chuaTra = B.rows.filter((r) => r.od > 0 && r.out > 0).sort((a, b) => b.od - a.od);
  if (chuaTra.length) pts.push([`NCC quá hạn chưa ghi nhận đã trả: ${chuaTra.slice(0, 4).map((r) => `${r.ten} ${tt(r.od)}`).join(", ")} — nhập đã trả ở bảng "Phải trả & đã trả".`, "high"]);
  const lead = A.tot ? `Phải thu còn ${tt(A.tot)}, quá hạn ${pc(A.od / A.tot, 0)} (${tt(A.od)}); phải trả còn ${tt(B.out)}, quá hạn ${tt(B.od)}. Công nợ ở tab này cập nhật theo pháp nhân.` : "";
  return band("Tóm tắt công nợ", lead, pts);
}
const kyOf = (d: string) => `T${d.slice(5, 7)}.${d.slice(0, 4)}`;
