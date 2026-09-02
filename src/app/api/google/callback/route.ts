import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// Import từ đường dẫn chính xác của bạn
import { oauthClient, saveRefreshToken } from '@/lib/google/auth'; 

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');

    if (!code) {
      return NextResponse.redirect(new URL('/settings?loi=thieu_code', req.url));
    }

    // 1. Dùng oauthClient() đã cấu hình sẵn để đổi code lấy token
    const client = oauthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/settings?loi=thieu_refresh_token', req.url));
    }

    client.setCredentials(tokens);

    // 2. Lấy email của tài khoản vừa đăng nhập để lưu kèm
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email || '';

    // 3. Gọi hàm saveRefreshToken để lưu đúng vào bảng 'app_settings'
    await saveRefreshToken(tokens.refresh_token, email);

    return NextResponse.redirect(new URL('/settings?ok=da_ket_noi', req.url));
  } catch (err) {
    console.error('[google callback]', err);
    return NextResponse.redirect(new URL('/settings?loi=doi_token_that_bai', req.url));
  }
}
