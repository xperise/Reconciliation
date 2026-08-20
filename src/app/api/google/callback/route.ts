import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { oauthClient, saveRefreshToken } from '@/lib/google/auth';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const expected = req.cookies.get('g_state')?.value;

  if (!code || !state || state !== expected) {
    return NextResponse.redirect(new URL('/settings?loi=state_khong_khop', req.url));
  }

  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/settings?loi=thieu_refresh_token', req.url));
    }

    client.setCredentials(tokens);

    // Lấy email từ Gmail API thay vì endpoint userinfo.
    // userinfo cần scope riêng mà hệ thống không xin; gmail.readonly đã đủ
    // để đọc địa chỉ của chính hộp thư vừa cấp quyền.
    const gmail = google.gmail({ version: 'v1', auth: client });
    const { data: profile } = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.emailAddress ?? '';

    await saveRefreshToken(tokens.refresh_token, email);

    await writeAudit({
      actorId: null,
      actorEmail: email || 'admin',
      action: 'google.connect',
      entity: 'app_settings',
      entityId: 'google_oauth',
      note: `Kết nối hộp thư ${email}`,
    });

    return NextResponse.redirect(new URL('/settings?ok=da_ket_noi', req.url));
  } catch (err) {
    console.error('[google callback]', err);
    return NextResponse.redirect(new URL('/settings?loi=doi_token_that_bai', req.url));
  }
}
