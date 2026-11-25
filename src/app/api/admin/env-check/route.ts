// Kiểm tra cấu hình biến môi trường (chỉ Quản trị). KHÔNG hiện giá trị khoá — chỉ báo đã đặt / đúng định dạng / chạy thử được.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guard, adminClient } from "@/lib/dashboard/server";
import { dec, hasKey } from "@/lib/dashboard/cards";
import { aiProvider } from "@/lib/ai-provider";

export const dynamic = "force-dynamic";
type Row = { key: string; ok: boolean | null; note: string };

export async function GET(req: Request) {
  const g = await guard(false, "m");
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (g.user.role !== "admin") return NextResponse.json({ error: "Chỉ Quản trị xem được." }, { status: 403 });
  const E = process.env, out: Row[] = [], host = new URL(req.url).origin;
  const add = (key: string, ok: boolean | null, note: string) => out.push({ key, ok, note });
  const url = E.NEXT_PUBLIC_SUPABASE_URL || "", anon = E.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", svc = E.SUPABASE_SERVICE_ROLE_KEY || "";
  const ref = (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/) || [])[1];
  add("NEXT_PUBLIC_SUPABASE_URL", !!ref, ref ? `Project ${ref}` : url ? "Sai định dạng (cần https://<id>.supabase.co)" : "Chưa đặt");
  // anon / publishable: gọi thử API công khai
  if (!anon) add("NEXT_PUBLIC_SUPABASE_ANON_KEY", false, "Chưa đặt");
  else { try { const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon } }); add("NEXT_PUBLIC_SUPABASE_ANON_KEY", r.ok, r.ok ? `Hợp lệ với project ${ref}${anon.startsWith("sb_secret_") ? " — CẢNH BÁO: đang dùng secret key cho biến công khai!" : ""}` : `Supabase từ chối khoá (HTTP ${r.status}) — khoá không thuộc project ${ref}?`); } catch (e) { add("NEXT_PUBLIC_SUPABASE_ANON_KEY", false, "Không gọi được Supabase: " + (e as Error).message); } }
  // service role / secret: đọc thử bảng hồ sơ (bỏ qua RLS)
  if (!svc) add("SUPABASE_SERVICE_ROLE_KEY", false, "Chưa đặt");
  else { try { const sb = createClient(url, svc, { auth: { persistSession: false } }); const { count, error } = await sb.from("profiles").select("id", { count: "exact", head: true });
      add("SUPABASE_SERVICE_ROLE_KEY", !error, error ? `Lỗi: ${error.message}` : `Đọc được bảng profiles (${count} tài khoản)`); } catch (e) { add("SUPABASE_SERVICE_ROLE_KEY", false, (e as Error).message); } }
  // MOB_CARD_KEY: giải mã thử 1 thẻ đã lưu — được = đúng khoá đã mã hoá dữ liệu
  if (!E.MOB_CARD_KEY) add("MOB_CARD_KEY", false, "Chưa đặt — chưa lưu / đọc được số thẻ");
  else if (!hasKey()) add("MOB_CARD_KEY", false, "Sai định dạng (cần 32 byte base64)");
  else { try { const { data, error } = await adminClient().from("mob_card").select("pan_enc").not("pan_enc", "is", null).limit(5);
      if (error) add("MOB_CARD_KEY", null, "Đúng định dạng; chưa kiểm tra được với dữ liệu: " + error.message);
      else if (!data || !data.length) add("MOB_CARD_KEY", null, "Đúng định dạng; chưa có thẻ nào có số thẻ để thử giải mã");
      else { let okN = 0; for (const r of data) { try { if (dec((r as { pan_enc: string }).pan_enc)) okN++; } catch { /* sai khoá */ } }
        add("MOB_CARD_KEY", okN === data.length, okN === data.length ? `ĐÚNG khoá: giải mã được ${okN}/${data.length} thẻ mẫu` : `SAI khoá: chỉ giải mã được ${okN}/${data.length} thẻ — số thẻ đã lưu được mã hoá bằng khoá khác`); } }
    catch (e) { add("MOB_CARD_KEY", false, (e as Error).message); } }
  const app = (E.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  add("NEXT_PUBLIC_APP_URL", app ? app === host : false, !app ? "Chưa đặt" : app === host ? `Khớp domain đang chạy (${host})` : `Khác domain đang mở (${app} ≠ ${host}) — link trong email sẽ trỏ sang ${app}`);
  add("GOOGLE_CLIENT_ID", E.GOOGLE_CLIENT_ID ? /\.apps\.googleusercontent\.com$/.test(E.GOOGLE_CLIENT_ID) : false, !E.GOOGLE_CLIENT_ID ? "Chưa đặt (chỉ cần nếu dùng Gmail / Drive)" : /\.apps\.googleusercontent\.com$/.test(E.GOOGLE_CLIENT_ID) ? "Đúng định dạng" : "Sai định dạng (phải kết thúc .apps.googleusercontent.com)");
  add("GOOGLE_CLIENT_SECRET", !!E.GOOGLE_CLIENT_SECRET, E.GOOGLE_CLIENT_SECRET ? "Đã đặt (đúng hay sai chỉ biết khi bấm kết nối Google)" : "Chưa đặt (chỉ cần nếu dùng Gmail / Drive)");
  const gr = E.GOOGLE_REDIRECT_URI || "";
  add("GOOGLE_REDIRECT_URI", gr ? gr === `${host}/api/google/callback` : false, !gr ? "Chưa đặt" : gr === `${host}/api/google/callback` ? "Khớp domain đang chạy" : `Nên là ${host}/api/google/callback (đang là ${gr})`);
  add("OPENAI_API_KEY", E.OPENAI_API_KEY ? true : null, E.OPENAI_API_KEY ? "Đã đặt" : "Chưa đặt (tuỳ chọn — nút Hỏi trợ lý ở Hướng dẫn sẽ tắt)");
  add("OPENAI_MODEL", null, E.OPENAI_MODEL ? `= ${E.OPENAI_MODEL}` : "Chưa đặt (tuỳ chọn — mặc định gpt-4o-mini)");
  const ap = aiProvider();
  add("AI_PROVIDER", null, E.AI_PROVIDER ? `= ${E.AI_PROVIDER} → đang dùng ${ap === "anthropic" ? "Claude" : "GPT (OpenAI)"}` : "Chưa đặt → mặc định dùng GPT (OpenAI)");
  add("OPENAI_AGENT_MODEL", null, E.OPENAI_AGENT_MODEL ? `= ${E.OPENAI_AGENT_MODEL}` : "Chưa đặt (fallback OPENAI_MODEL, rồi gpt-4o-mini)");
  add("ANTHROPIC_API_KEY", E.ANTHROPIC_API_KEY ? true : null, E.ANTHROPIC_API_KEY ? "Đã đặt" : "Chưa đặt (chỉ cần khi AI_PROVIDER=anthropic)");
  add("ANTHROPIC_MODEL", E.ANTHROPIC_MODEL ? true : null, E.ANTHROPIC_MODEL ? `= ${E.ANTHROPIC_MODEL}` : "Chưa đặt (chỉ cần khi AI_PROVIDER=anthropic)");
  add("CRON_SECRET", E.CRON_SECRET ? true : null, E.CRON_SECRET ? "Đã đặt" : "Chưa đặt (tuỳ chọn — cần nếu chạy lịch tự động /api/cron/tick)");
  const ic = (v: boolean | null) => v === true ? "✅" : v === false ? "❌" : "⚪";
  const html = `<!doctype html><meta charset="utf-8"><title>Kiểm tra cấu hình</title><body style="font:14px system-ui;max-width:900px;margin:32px auto;padding:0 16px">
<h2>Kiểm tra biến môi trường · ${host}</h2><p style="color:#666">Chỉ báo trạng thái, không hiện giá trị khoá. ✅ chạy đúng · ❌ cần sửa · ⚪ tuỳ chọn / chưa kiểm tra được.</p>
<table style="border-collapse:collapse;width:100%">${out.map(r => `<tr style="border-bottom:1px solid #eee"><td style="padding:8px">${ic(r.ok)}</td><td style="padding:8px;font-family:ui-monospace,Consolas,monospace">${r.key}</td><td style="padding:8px">${r.note.replace(/[<&]/g, "")}</td></tr>`).join("")}</table>
<p style="color:#666;font-size:13px">Sửa biến trên Vercel xong phải Redeploy rồi mở lại trang này.</p></body>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
