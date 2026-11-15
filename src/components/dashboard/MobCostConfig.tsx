"use client";
// Cấu hình giá vốn Mobility theo đơn vị cung cấp — dùng cho số Mobility ở Tổng quan.
// Giá vốn = GMV × (1 − % chiết khấu đơn vị cung cấp trả lại). Lưu ở fin_manual (nhom 'cfg', ky 'CFG').
import { useMemo, useState } from "react";
import type { DataSet } from "@/lib/dashboard/types";
import { CFG_KY, MOB_DEFAULT_UNIT, mobCfg } from "@/lib/dashboard/ops";
import { kyIdx, kyOfDate, todayIso, ty, N1 } from "@/lib/dashboard/util";

const pctTxt = (x: number | undefined) => (x == null ? "" : String(Math.round(x * 10000) / 100).replace(".", ","));

export default function MobCostConfig({ data, canEdit, onDone, toast }: { data: DataSet; canEdit: boolean; onDone: () => Promise<void>; toast: (m: string, err?: boolean) => void }) {
  const cfg = useMemo(() => mobCfg(data), [data]);
  const mob = data.mob;
  // GMV từng đơn vị trong tháng gần nhất có giao dịch — để biết đơn vị nào quan trọng
  const { ky, gmv } = useMemo(() => {
    const rows = mob?.rows || [];
    const now = kyIdx(kyOfDate(todayIso()));
    const k = Array.from(new Set(rows.map((r) => kyOfDate(r[0])))).filter((x) => kyIdx(x) <= now).sort((a, b) => kyIdx(b) - kyIdx(a))[0] || "";
    const g = new Map<string, number>();
    rows.forEach((r) => { if (kyOfDate(r[0]) === k) g.set(r[2], (g.get(r[2]) || 0) + r[3]); });
    return { ky: k, gmv: g };
  }, [mob]);
  const units = useMemo(() => (mob?.units || []).slice().sort((a, b) => (gmv.get(b) || 0) - (gmv.get(a) || 0)), [mob, gmv]);
  const [val, setVal] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const cur = (u: string) => (u in val ? val[u] : pctTxt(cfg.unit.get(u)));
  const goc = (u: string) => pctTxt(cfg.unit.get(u));

  async function save() {
    const rows: { nhom: string; ky: string; khoa: string; gia_tri: number | null }[] = [];
    for (const u of [MOB_DEFAULT_UNIT, ...units]) {
      const raw = cur(u).trim();
      if (raw === goc(u)) continue;
      const n = raw === "" ? null : Number(raw.replace(",", "."));
      if (n != null && (!isFinite(n) || n < 0 || n >= 100)) return toast(`Tỷ lệ của ${u === MOB_DEFAULT_UNIT ? "mặc định" : u} phải từ 0 tới dưới 100`, true);
      rows.push({ nhom: "cfg", ky: CFG_KY, khoa: `mob_ck|${u}`, gia_tri: n == null ? null : n / 100 });
    }
    if (!rows.length) return toast("Chưa có ô nào thay đổi");
    setBusy(true);
    try {
      const r = await fetch("/api/dashboard/nhap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Không lưu được");
      toast("Đã lưu cấu hình giá vốn Mobility");
      setVal({});
      await onDone();
    } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
    finally { setBusy(false); }
  }

  const input = (u: string, ph?: string) => canEdit
    ? <input className="fld cfg-in" inputMode="decimal" value={cur(u)} placeholder={ph} onChange={(e) => setVal((v) => ({ ...v, [u]: e.target.value }))} />
    : <span className="num">{cur(u) ? cur(u) + "%" : ph ? ph + "% (mặc định)" : "—"}</span>;

  return (
    <div className="card">
      <div className="card-h"><div><div className="eyebrow">Cấu hình</div><div className="card-title">Giá vốn Mobility theo đơn vị cung cấp</div></div>
        <div className="card-note">{mob?.updated_at ? `giao dịch tab Mobility cập nhật ${new Date(mob.updated_at).toLocaleString("vi-VN")}` : "chưa đọc được giao dịch tab Mobility"}</div></div>
      <div className="small" style={{ marginBottom: 10 }}>
        Nhập % chiết khấu đơn vị cung cấp trả lại cho Xperise. Giá vốn = GMV × (1 − %), Net revenue = GMV − giá vốn. Đơn vị để trống dùng tỷ lệ mặc định.
      </div>
      <div className="tw"><table>
        <thead><tr><th>Đơn vị cung cấp</th><th className="r">GMV {ky}</th><th className="r">% chiết khấu NCC</th><th className="r">Giá vốn / GMV</th></tr></thead>
        <tbody>
          <tr className="tot"><td>Mặc định (đơn vị chưa cấu hình)</td><td></td><td className="r">{input(MOB_DEFAULT_UNIT, pctTxt(cfg.def))}</td><td className="r num">{N1.format((1 - cfg.def) * 100)}%</td></tr>
          {units.map((u) => { const r = cfg.rate(u); return (
            <tr key={u}><td>{u}</td><td className="r num">{gmv.get(u) ? ty(gmv.get(u)) : "–"}</td><td className="r">{input(u, pctTxt(cfg.def))}</td><td className="r num">{N1.format((1 - r) * 100)}%</td></tr>); })}
          {!units.length && <tr><td colSpan={4} className="c-muted">Chưa có giao dịch nào ở tab Mobility.</td></tr>}
        </tbody>
      </table></div>
      {canEdit && <div style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} onClick={save}>{busy ? "Đang lưu…" : "Lưu cấu hình"}</button></div>}
    </div>
  );
}
