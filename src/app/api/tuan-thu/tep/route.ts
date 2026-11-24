import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BUCKET_TT, nguoiTT } from '@/lib/tuan-thu/db';

export const dynamic = 'force-dynamic';

/** Tải tệp của phần Tuân thủ (raw, bảng kê, báo cáo). Chỉ thành viên mới tải được, chỉ trong thư mục tuan-thu/. */
export async function GET(req: NextRequest) {
  const n = await nguoiTT();
  if (!n) return NextResponse.json({ error: 'Không có quyền.' }, { status: 403 });
  const path = req.nextUrl.searchParams.get('path') ?? '';
  if (!path.startsWith('tuan-thu/') || path.includes('..')) return NextResponse.json({ error: 'Đường dẫn không hợp lệ.' }, { status: 400 });
  const { data, error } = await supabaseAdmin().storage.from(BUCKET_TT)
    .createSignedUrl(path, 60 * 5, { download: path.split('/').pop() });
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Không tạo được liên kết.' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
