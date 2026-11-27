import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendMail } from '@/lib/google/gmail';
import { baoCaoDinhKy, moTaBaoCaoDinhKy } from '@/lib/tuan-thu/bao-cao-ceo';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Tóm tắt định kỳ cho CEO. Vercel Cron gọi:
 *   /api/cron/tuan-thu-tom-tat?loai=ngay   (mỗi ngày)
 *   /api/cron/tuan-thu-tom-tat?loai=tuan   (mỗi thứ Hai)
 * Ghi bản tóm tắt cho từng tổ chức và gửi email cho CEO (chức vụ) của tổ chức.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Không có quyền.' }, { status: 401 });
  }
  const loai = req.nextUrl.searchParams.get('loai') === 'tuan' ? 'tuan' : 'ngay';
  const sb = supabaseAdmin();
  const { data: orgs, error } = await sb.from('tt_to_chuc').select('id, ten');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ketQua: { org: string; ok: boolean; loi?: string }[] = [];
  for (const o of (orgs ?? []) as any[]) {
    try {
      const bc = await baoCaoDinhKy(o.id, loai, new Date());
      const noiDung = moTaBaoCaoDinhKy(bc);
      const { error: eIns } = await sb.from('tt_ban_tom_tat').upsert(
        { org_id: o.id, loai, tu: bc.tu, den: bc.den, noi_dung: noiDung, so_lieu: bc },
        { onConflict: 'org_id,loai,den' });
      if (eIns) throw new Error(eIns.message);

      const { data: ceo } = await sb.from('tt_thanh_vien').select('user_id, profiles(email)').eq('org_id', o.id).eq('phong_ban', 'ceo');
      for (const r of (ceo ?? []) as any[]) {
        const email = r.profiles?.email;
        if (!email) continue;
        await sendMail({ to: email, subject: `[Tuân thủ bảng kê] Tóm tắt ${loai === 'ngay' ? 'ngày' : 'tuần'} ${bc.den}`,
          html: `<pre style="font-family:Arial;white-space:pre-wrap">${noiDung.replace(/</g, '&lt;')}</pre>` }).catch(() => {});
      }
      ketQua.push({ org: o.ten, ok: true });
    } catch (e) {
      ketQua.push({ org: o.ten, ok: false, loi: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ loai, ketQua });
}
