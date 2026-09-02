import { NextResponse } from 'next/server';
import { google } from 'googleapis';
// Import client Supabase từ dự án của bạn (ví dụ: '@/lib/supabase' hoặc '@/utils/supabase/server')
import { createClient } from '@/lib/supabase'; // Điều chỉnh theo file cấu hình supabase của bạn

const client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');

    if (!code) {
      return NextResponse.redirect(new URL('/settings?loi=thieu_code', req.url));
    }

    // 1. Đổi code lấy tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // 2. Lấy email của tài khoản Google vừa đăng nhập
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    // 3. Cập nhật vào Database (Ví dụ lưu vào bảng settings/config của Supabase)
    const supabase = createClient();
    await supabase
      .from('he_thong_cai_dat') // Thay bằng tên bảng lưu thông tin tài khoản Google của bạn
      .upsert({
        id: 1,
        email: email,
        refresh_token: tokens.refresh_token,
        updated_at: new Date().toISOString(),
        note: `Kết nối hộp thư ${email || '(không xác định)'}`,
      });

    return NextResponse.redirect(new URL('/settings?ok=da_ket_noi', req.url));
  } catch (err) {
    console.error('[google callback]', err);
    return NextResponse.redirect(new URL('/settings?loi=doi_token_that_bai', req.url));
  }
}
