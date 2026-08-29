import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { currentUser } from '@/lib/supabase/server';
import { oauthClient, saveRefreshToken } from '@/lib/google/auth';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (user?.role !== 'admin') {
    return NextResponse.redirect(new URL('/settings?loi=khong_co_quyen', req.url));
  }

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
      // Google chỉ trả refresh_token ở lần cấp quyền đầu. Gỡ quyền cũ rồi thử lại.
      return NextResponse.redirect(new URL('/settings?loi=thieu_refresh_token', req.url));
    }

    client.setCredentials(tokens);
    const { data } = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();

    await saveRefreshToken(tokens.refresh_token, data.email ?? '');
    await writeAudit({
      actorId: user.id, actorEmail: user.email,
      action: 'google.connect', entity: 'app_settings', entityId: 'google_oauth',
      note: `Kết nối hộp thư ${data.email}`,
    });

    return NextResponse.redirect(new URL('/settings?ok=da_ket_noi', req.url));
  } catch (err) {
    console.error('[google callback]', err);
    return NextResponse.redirect(new URL('/settings?loi=doi_token_that_bai', req.url));
  }
}
