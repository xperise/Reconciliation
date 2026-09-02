import { NextResponse } from 'next/server';
import { google } from 'googleapis'; // Chú ý dòng này

// Khởi tạo client trực tiếp tại đây
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

    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/settings?loi=thieu_refresh_token', req.url));
    }

    client.setCredentials(tokens);
    
    return NextResponse.redirect(new URL('/settings?ok=da_ket_noi', req.url));
    
  } catch (err) {
    console.error('[google callback]', err);
    return NextResponse.redirect(new URL('/settings?loi=doi_token_that_bai', req.url));
  }
}
