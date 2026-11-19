// TẠM THỜI — trang lấy bản sao MOB_CARD_KEY cho Quản trị (khoá Sensitive trên Vercel không xem được).
// Chỉ role admin; mỗi lần mở đều ghi nhật ký. XOÁ FILE NÀY ngay sau khi đã lưu khoá vào trình quản lý mật khẩu.
import { NextResponse } from "next/server";
import { guard } from "@/lib/dashboard/server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
const H = { "Cache-Control": "no-store, no-cache, must-revalidate", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" };

export async function GET() {
  const g = await guard(false, "m");
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status, headers: H });
  if (g.user.role !== "admin") return NextResponse.json({ error: "Chỉ Quản trị xem được." }, { status: 403, headers: H });
  const k = process.env.MOB_CARD_KEY || "";
  await writeAudit({ actorId: g.user.id, actorEmail: g.user.email, action: "mobility.cards.reveal_key", entity: "env", note: k ? "Xem MOB_CARD_KEY (trang tạm)" : "Mở trang tạm, MOB_CARD_KEY chưa đặt" });
  if (!k) return NextResponse.json({ error: "MOB_CARD_KEY chưa được đặt trên Vercel." }, { status: 404, headers: H });
  const ok = Buffer.from(k, "base64").length === 32;
  const html = `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>MOB_CARD_KEY</title>
<body style="font:15px system-ui;max-width:720px;margin:40px auto;padding:0 16px">
<h2>MOB_CARD_KEY (khoá mã hoá số thẻ XPAY)</h2>
<p>Copy khoá dưới đây vào trình quản lý mật khẩu của công ty. <b>Không gửi qua chat / email.</b> Đóng trang ngay sau khi lưu.</p>
<pre id="k" style="font:16px ui-monospace,Consolas,monospace;background:#f4f4f6;padding:14px;border-radius:10px;word-break:break-all">${k.replace(/[<&]/g, "")}</pre>
<button onclick="navigator.clipboard.writeText(document.getElementById('k').textContent.trim()).then(()=>this.textContent='Đã copy')" style="padding:8px 16px;border-radius:8px;border:0;background:#0d6e63;color:#fff;font-weight:600;cursor:pointer">Copy khoá</button>
<p style="color:${ok ? "#0d6e63" : "#c81e1e"}">${ok ? "Định dạng hợp lệ: 32 byte base64." : "Cảnh báo: khoá không phải 32 byte base64."}</p>
<p style="color:#666;font-size:13px">Lần mở trang này đã được ghi vào nhật ký. Báo Claude xoá trang sau khi đã lưu xong.</p></body>`;
  return new NextResponse(html, { headers: { ...H, "Content-Type": "text/html; charset=utf-8" } });
}
