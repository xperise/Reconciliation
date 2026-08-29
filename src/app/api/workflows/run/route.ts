import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase/server';
import { executeWorkflow } from '@/workflows/runner';
import { writeAudit } from '@/lib/audit';
import { WorkflowKey } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const VALID: WorkflowKey[] = ['wf1', 'wf2', 'wf3', 'wf4'];

/** Chạy tay một workflow từ giao diện. Chỉ admin. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Chỉ admin được chạy workflow thủ công.' }, { status: 403 });
  }

  const { key } = await req.json();
  if (!VALID.includes(key)) {
    return NextResponse.json({ error: 'Workflow không hợp lệ.' }, { status: 400 });
  }

  const result = await executeWorkflow(key, 'manual', user.id);
  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'workflow.run_manual', entity: 'workflow', entityId: key,
    note: result.summary,
  });

  return NextResponse.json(result);
}
