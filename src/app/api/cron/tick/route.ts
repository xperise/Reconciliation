import { NextRequest, NextResponse } from 'next/server';
import { tick } from '@/workflows/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Nhịp đồng hồ, Vercel Cron gọi mỗi phút.
 * Bản thân route không quyết định chạy gì — nó hỏi bảng workflow_schedules.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Không có quyền.' }, { status: 401 });
    }
  }

  try {
    const kq = await tick();
    return NextResponse.json({ at: new Date().toISOString(), ...kq });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tick]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
