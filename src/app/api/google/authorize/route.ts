import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase/server';
import { consentUrl } from '@/lib/google/auth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/** Bắt đầu luồng cấp quyền Google. Chỉ admin bấm được. */
export async function GET() {
  const user = await currentUser();
  if (user?.role !== 'admin') {
    return NextResponse.json({ error: 'Chỉ admin được kết nối Google.' }, { status: 403 });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const res = NextResponse.redirect(consentUrl(state));
  res.cookies.set('g_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/',
  });
  return res;
}
