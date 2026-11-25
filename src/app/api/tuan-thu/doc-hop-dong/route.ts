import { NextRequest, NextResponse } from 'next/server';
import { nguoiTT } from '@/lib/tuan-thu/db';
import { docHopDong } from '@/lib/tuan-thu/doc-hop-dong';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // đọc PDF dài với 5 lượt agent chạy song song

export async function POST(req: NextRequest) {
  const n = await nguoiTT();
  if (!n) return NextResponse.json({ error: 'Không có quyền.' }, { status: 403 });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'Thiếu id hợp đồng.' }, { status: 400 });
  try {
    const kq = await docHopDong(id);
    await writeAudit({ actorId: n.id, actorEmail: n.email, action: 'tuan_thu.doc_hop_dong', entity: 'tt_hop_dong', entityId: id, after: kq });
    return NextResponse.json({ ok: true, ...kq });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
