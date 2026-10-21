import { NextResponse } from "next/server";
import { adminClient, guard } from "@/lib/dashboard/server";
import { canEditRole, errMsg, fail } from "@/lib/dashboard/mobility";
import { CardRow, dec, digits, enc, full, hasKey, intOrNull, masked, txt } from "@/lib/dashboard/cards";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const H = { headers: { "Cache-Control": "no-store" } };

async function all<T>(table: string, cols: string, key?: string): Promise<T[]> {
  const sb = adminClient(), out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols).order(table === "mob_card" ? "uid" : "key").range(from, from + 999);
    if (key) q = q.eq("key", key);
    const { data, error } = await q;
    if (error) throw new Error(error.code === "42P01" ? "Chưa tạo bảng thẻ XPAY — chạy supabase/migrations/21_dashboard_the_xpay.sql" : error.message);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}
type Company = { key: string; mst: string | null; address: string | null; email: string | null; updated_at?: string };

/** GET
 *  ?summary=1        → mọi người xem Dashboard: thông tin DN + tổng thẻ theo từng số hợp đồng (không có số thẻ)
 *  ?key=<HĐ>         → thẻ của 1 khách, dạng che; thêm &full=1 (Quản trị/Kế toán) để hiện đầy đủ, có ghi nhật ký
 *  ?export=1         → toàn bộ thẻ đầy đủ (Quản trị/Kế toán), có ghi nhật ký */
export async function GET(req: Request) {
  try {
    const g = await guard();
    if ("error" in g) return fail(g.error, g.status);
    const q = new URL(req.url).searchParams, edit = canEditRole(g.user.role);
    const CC = "uid,key,company_on_card,holder,pan_enc,pan_last4,pantoken_enc,expiry,monthly_limit,balance,balance_date,updated_at";
    if (q.has("summary")) {
      const [co, cards] = await Promise.all([all<Company>("mob_company", "key,mst,address,email"), all<CardRow>("mob_card", "key,monthly_limit,balance,balance_date,expiry")]);
      const S: Record<string, { mst?: string | null; address?: string | null; email?: string | null; n: number; limit: number; bal: number; balDate: string | null; exp: string | null }> = {};
      const get = (k: string) => (S[k] = S[k] || { n: 0, limit: 0, bal: 0, balDate: null, exp: null });
      co.forEach((c) => Object.assign(get(c.key), { mst: c.mst, address: c.address, email: c.email }));
      cards.forEach((c) => { const s = get(c.key); s.n++; s.limit += c.monthly_limit || 0; s.bal += c.balance || 0;
        if (c.balance_date && (!s.balDate || c.balance_date > s.balDate)) s.balDate = c.balance_date;
        const e = c.expiry && /^\d{2}\/\d{2}$/.test(c.expiry) ? c.expiry.slice(3) + c.expiry.slice(0, 2) : null; if (e && (!s.exp || e < s.exp)) s.exp = e; });
      return NextResponse.json({ ok: true, canEdit: edit, keyOk: hasKey(), sum: S }, H);
    }
    if (q.has("export")) {
      if (!edit) return fail("Chỉ Quản trị và Kế toán được xuất dữ liệu thẻ", 403);
      const [co, cards] = await Promise.all([all<Company>("mob_company", "key,mst,address,email"), all<CardRow>("mob_card", CC)]);
      await writeAudit({ actorId: g.user.id, actorEmail: g.user.email, action: "mobility.cards.export", entity: "mob_card", note: `Xuất ${cards.length} thẻ đầy đủ` });
      return NextResponse.json({ companies: co, cards: cards.map(full) }, H);
    }
    const k = txt(q.get("key"), 100);
    if (!k) return fail("Thiếu số hợp đồng", 400);
    const wantFull = q.get("full") === "1";
    if (wantFull && !edit) return fail("Chỉ Quản trị và Kế toán được xem đầy đủ số thẻ", 403);
    const [co, cards] = await Promise.all([all<Company>("mob_company", "key,mst,address,email,updated_at", k), all<CardRow>("mob_card", CC, k)]);
    if (wantFull) await writeAudit({ actorId: g.user.id, actorEmail: g.user.email, action: "mobility.cards.view_full", entity: "mob_card", entityId: k, note: `Xem đầy đủ ${cards.length} thẻ` });
    return NextResponse.json({ company: co[0] || null, cards: cards.map(wantFull ? full : masked), canEdit: edit, full: wantFull }, H);
  } catch (e) { return fail(errMsg(e), 500); }
}

type CompanyIn = { key: string; mst?: string | null; address?: string | null; email?: string | null; line?: number };
type CardIn = { uid: string; key?: string; company_on_card?: string | null; holder?: string | null; pan?: string | null; pantoken?: string | null; expiry?: string | null; monthly_limit?: number | null; balance?: number | null; balance_date?: string | null; line?: number };
type Diff = { f: string; from: string | number | null; to: string | number | null };
const L4 = (v: string | null | undefined) => (v ? "•••• " + v : null);
const CF: [keyof CardIn & keyof CardRow, string][] = [["key", "Số hợp đồng"], ["company_on_card", "Tên công ty trên thẻ"], ["holder", "Tên chủ thẻ"], ["expiry", "Hạn sử dụng"], ["monthly_limit", "Hạn mức tháng"], ["balance", "Số dư"], ["balance_date", "Ngày số dư"]];

/** POST { companies, cards, deletes, dry } — Quản trị / Kế toán.
 *  Trường không có trong object = giữ nguyên; null = xoá giá trị. dry: true → chỉ so sánh, trả danh sách thay đổi, không ghi.
 *  Dòng lỗi bị bỏ qua (trả về trong errors), các dòng hợp lệ vẫn được ghi. */
export async function POST(req: Request) {
  try {
    const g = await guard(true);
    if ("error" in g) return fail(g.error, g.status);
    const b = (await req.json()) as { companies?: CompanyIn[]; cards?: CardIn[]; deletes?: { uid: string; line?: number }[]; dry?: boolean };
    const companies = Array.isArray(b.companies) ? b.companies : [], cards = Array.isArray(b.cards) ? b.cards : [], deletes = Array.isArray(b.deletes) ? b.deletes : [];
    if (companies.length + cards.length + deletes.length > 20000) return fail("File quá lớn (tối đa 20.000 dòng mỗi lần)", 413);
    const sb = adminClient(), now = new Date().toISOString(), by = g.user.email, errors: string[] = [];
    const at = (x: { line?: number }, sh = "The_XPAY") => (x.line ? `${sh} dòng ${x.line}: ` : "");
    if (cards.some((c) => c.pan || c.pantoken) && !hasKey()) return fail("Chưa cấu hình MOB_CARD_KEY trên Vercel nên chưa lưu được số thẻ / pantoken", 500);

    /* ---- doanh nghiệp ---- */
    const coKeys = [...new Set(companies.map((c) => txt(c.key, 100)).filter(Boolean) as string[])];
    const curCo: Record<string, Company> = {};
    for (let i = 0; i < coKeys.length; i += 300) { const { data, error } = await sb.from("mob_company").select("key,mst,address,email").in("key", coKeys.slice(i, i + 300)); if (error) throw new Error(error.message); (data || []).forEach((r: Company) => (curCo[r.key] = r)); }
    const coRows: (Company & { updated_at: string; updated_by: string })[] = [], coDiff: { key: string; diffs: Diff[] }[] = [];
    for (const c of companies) {
      const k = txt(c.key, 100); if (!k) continue;
      const o = curCo[k] || { key: k, mst: null, address: null, email: null };
      const n = { key: k, mst: "mst" in c ? txt(c.mst, 30) : o.mst, address: "address" in c ? txt(c.address, 500) : o.address, email: "email" in c ? txt(c.email, 200) : o.email };
      if (n.mst && !/^\d{10}(-\d{3})?$/.test(n.mst)) { errors.push(`${at(c, "Thong_tin_DN")}MST "${n.mst}" không hợp lệ (10 số hoặc 10 số-3 số)`); continue; }
      if (n.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n.email)) { errors.push(`${at(c, "Thong_tin_DN")}email "${n.email}" không hợp lệ`); continue; }
      const diffs = ([["mst", "MST"], ["address", "Địa chỉ"], ["email", "Email"]] as const).filter(([f]) => (n[f] || null) !== (o[f] || null)).map(([f, l]) => ({ f: l, from: o[f] || null, to: n[f] || null }));
      if (diffs.length) { coDiff.push({ key: k, diffs }); coRows.push({ ...n, updated_at: now, updated_by: by }); curCo[k] = n; }
    }

    /* ---- thẻ ---- */
    const uids = [...new Set([...cards.map((c) => txt(c.uid, 100)), ...deletes.map((d) => txt(d.uid, 100))].filter(Boolean) as string[])];
    const cur: Record<string, CardRow> = {};
    for (let i = 0; i < uids.length; i += 300) { const { data, error } = await sb.from("mob_card").select("*").in("uid", uids.slice(i, i + 300)); if (error) throw new Error(error.message); (data || []).forEach((r: CardRow) => (cur[r.uid] = r)); }
    const rows: CardRow[] = [], added: { uid: string; key: string; holder: string | null; pan: string | null }[] = [], changed: { uid: string; key: string; holder: string | null; diffs: Diff[] }[] = [];
    let same = 0;
    for (const c of cards) {
      const uid = txt(c.uid, 100); if (!uid) continue;
      const o = cur[uid], k = txt(c.key, 100) || o?.key;
      if (!k) { errors.push(`${at(c)}thẻ ${uid} chưa có trong hệ thống, cần điền số hợp đồng`); continue; }
      const pan = "pan" in c ? (c.pan ? digits(c.pan) : null) : undefined;
      if (pan && !/^\d{12,19}$/.test(pan)) { errors.push(`${at(c)}thẻ ${uid}: số thẻ phải gồm 12–19 chữ số`); continue; }
      if (c.expiry && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(c.expiry)) { errors.push(`${at(c)}thẻ ${uid}: hạn sử dụng phải dạng MM/YY`); continue; }
      if (c.balance_date && !/^\d{4}-\d{2}-\d{2}$/.test(c.balance_date)) { errors.push(`${at(c)}thẻ ${uid}: ngày số dư không hợp lệ`); continue; }
      const curPan = o ? dec(o.pan_enc) : null, curTok = o ? dec(o.pantoken_enc) : null, tok = "pantoken" in c ? txt(c.pantoken, 2000) : undefined;
      const n: CardRow = {
        uid, key: k,
        company_on_card: "company_on_card" in c ? txt(c.company_on_card) : o?.company_on_card ?? null,
        holder: "holder" in c ? txt(c.holder) : o?.holder ?? null,
        pan_enc: pan === undefined || pan === curPan ? o?.pan_enc ?? null : enc(pan), pan_last4: pan === undefined ? o?.pan_last4 ?? null : pan ? pan.slice(-4) : null,
        pantoken_enc: tok === undefined || tok === curTok ? o?.pantoken_enc ?? null : enc(tok),
        expiry: "expiry" in c ? txt(c.expiry, 5) : o?.expiry ?? null,
        monthly_limit: "monthly_limit" in c ? intOrNull(c.monthly_limit) : o?.monthly_limit ?? null,
        balance: "balance" in c ? intOrNull(c.balance) : o?.balance ?? null,
        balance_date: "balance_date" in c ? txt(c.balance_date, 10) : o?.balance_date ?? null,
        updated_at: now, updated_by: by,
      };
      if (!o) { added.push({ uid, key: k, holder: n.holder, pan: L4(n.pan_last4) }); rows.push(n); cur[uid] = n; continue; }
      const diffs: Diff[] = CF.filter(([f]) => (n[f] ?? null) !== (o[f] ?? null)).map(([f, l]) => ({ f: l, from: (o[f] as string | number | null) ?? null, to: (n[f] as string | number | null) ?? null }));
      if (pan !== undefined && pan !== curPan) diffs.push({ f: "Số thẻ", from: L4(o.pan_last4), to: L4(n.pan_last4) });
      if (tok !== undefined && tok !== curTok) diffs.push({ f: "Pantoken (mã QR)", from: curTok ? "có" : null, to: tok ? "mã mới" : null });
      if (diffs.length) { changed.push({ uid, key: k, holder: n.holder, diffs }); rows.push(n); cur[uid] = n; } else same++;
    }
    const del: { uid: string; key: string; holder: string | null }[] = [];
    for (const d of deletes) { const uid = txt(d.uid, 100); if (!uid) continue; const o = cur[uid];
      if (!o) { errors.push(`${at(d)}không có thẻ UID ${uid} để xoá`); continue; } del.push({ uid, key: o.key, holder: o.holder }); }

    const result = { ok: true, dry: !!b.dry, companies: coDiff, added, changed, deleted: del, same, errors };
    if (b.dry) return NextResponse.json(result, H);
    for (let i = 0; i < coRows.length; i += 500) { const { error } = await sb.from("mob_company").upsert(coRows.slice(i, i + 500), { onConflict: "key" }); if (error) throw new Error(error.message); }
    for (let i = 0; i < rows.length; i += 500) { const { error } = await sb.from("mob_card").upsert(rows.slice(i, i + 500), { onConflict: "uid" }); if (error) throw new Error(error.message); }
    const du = del.map((d) => d.uid);
    for (let i = 0; i < du.length; i += 300) { const { error } = await sb.from("mob_card").delete().in("uid", du.slice(i, i + 300)); if (error) throw new Error(error.message); }
    // Nhật ký: chỉ ghi số hợp đồng và UID, không ghi số thẻ / pantoken
    await writeAudit({ actorId: g.user.id, actorEmail: g.user.email, action: "mobility.cards.import", entity: "mob_card",
      after: { companies: coDiff.map((c) => c.key), added: added.map((x) => x.uid), changed: changed.map((x) => x.uid), deleted: du },
      note: `DN ${coDiff.length} · thẻ mới ${added.length} · thẻ sửa ${changed.length} · thẻ xoá ${du.length}` });
    return NextResponse.json(result, H);
  } catch (e) { return fail(errMsg(e), 500); }
}
