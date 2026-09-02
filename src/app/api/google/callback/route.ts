import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js'; // Gọi trực tiếp từ thư viện

// 1. Khởi tạo Google Client
const client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// 2. Khởi tạo Supabase Client ngay tại đây (không cần gọi từ @/lib/supabase nữa)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');

    if (!code) {
      return NextResponse.redirect(new URL('/settings?loi=thieu_code', req.url));
    }

    // Đổi code lấy tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Lấy email của tài khoản Google vừa đăng nhập
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    // Lưu vào Supabase
    // LƯU Ý: Đổi 'he_thong_cai_dat' thành đúng tên bảng trong database của bạn
    await supabase
      .from('he_thong_cai_dat') 
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
