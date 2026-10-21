// Thẻ XPAY (Dashboard Mobility) — mã hoá số thẻ / pantoken, chuẩn hoá dữ liệu nhập. Chỉ dùng phía server.
import crypto from "crypto";

/** Khoá AES-256 từ biến môi trường MOB_CARD_KEY (32 byte, base64). */
function key(): Buffer {
  const k = process.env.MOB_CARD_KEY;
  if (!k) throw new Error("Chưa cấu hình MOB_CARD_KEY trên Vercel");
  const b = Buffer.from(k, "base64");
  if (b.length !== 32) throw new Error("MOB_CARD_KEY phải là 32 byte dạng base64");
  return b;
}
export const hasKey = () => { try { key(); return true; } catch { return false; } };

/** Mã hoá: v1.<iv>.<tag>.<dữ liệu> (base64) */
export function enc(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const d = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), d.toString("base64")].join(".");
}
export function dec(v: string | null | undefined): string | null {
  if (!v) return null;
  const [ver, iv, tag, d] = v.split(".");
  if (ver !== "v1") throw new Error("Dữ liệu mã hoá không hợp lệ");
  const x = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  x.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([x.update(Buffer.from(d, "base64")), x.final()]).toString("utf8");
}

export const txt = (v: unknown, max = 300) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };
export const digits = (v: unknown) => String(v ?? "").replace(/[\s-]/g, "");
export const intOrNull = (v: unknown) => { if (v == null || v === "") return null; const n = Math.round(Number(v)); return isFinite(n) ? n : null; };

export type CardRow = {
  uid: string; key: string; company_on_card: string | null; holder: string | null; pan_enc: string | null; pan_last4: string | null;
  pantoken_enc: string | null; expiry: string | null; monthly_limit: number | null; balance: number | null; balance_date: string | null;
  updated_at?: string; updated_by?: string | null;
};
/** Thẻ dạng che (mọi người xem Dashboard) */
export const masked = (r: CardRow) => ({
  uid: r.uid, key: r.key, company_on_card: r.company_on_card, holder: r.holder, pan: r.pan_last4 ? "•••• " + r.pan_last4 : null,
  pantoken: r.pantoken_enc ? "••••••" : null, expiry: r.expiry, monthly_limit: r.monthly_limit, balance: r.balance, balance_date: r.balance_date, updated_at: r.updated_at,
});
/** Thẻ đầy đủ (Quản trị / Kế toán) */
export const full = (r: CardRow) => Object.assign(masked(r), { pan: dec(r.pan_enc), pantoken: dec(r.pantoken_enc) });
