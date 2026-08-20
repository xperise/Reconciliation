import { supabaseAdmin } from '@/lib/supabase/admin';
import { nowInVN } from '@/lib/period';
import { RunResult, WorkflowKey, WorkflowSchedule } from '@/lib/types';
import { runWf1 } from './wf1-gui-bang-ke';
import { runWf2 } from './wf2-nhan-phan-hoi';
import { runWf3 } from './wf3-gui-tep';
import { runWf4 } from './wf4-theo-doi-han';

const HANDLERS: Record<WorkflowKey, () => Promise<RunResult>> = {
  wf1: runWf1,
  wf2: runWf2,
  wf3: runWf3,
  wf4: runWf4,
};

/**
 * Một workflow tới hạn chạy chưa?
 *
 * daily    — đã qua giờ hẹn hôm nay và hôm nay chưa chạy lần nào.
 * interval — lần chạy gần nhất cách đây đủ số phút đã đặt.
 *
 * Nhờ đọc lịch từ cơ sở dữ liệu thay vì cấu hình cứng, bạn đổi giờ chạy
 * trên trang Workflow là có hiệu lực ngay, không cần deploy lại.
 */
export function isDue(wf: WorkflowSchedule, at = new Date()): boolean {
  if (!wf.enabled) return false;

  const { isoDate, hhmm } = nowInVN(at);

  if (wf.schedule_kind === 'daily') {
    if (!wf.run_at_hhmm) return false;
    if (hhmm < wf.run_at_hhmm) return false;
    if (!wf.last_run_at) return true;
    return nowInVN(new Date(wf.last_run_at)).isoDate !== isoDate;
  }

  const every = wf.interval_minutes ?? 0;
  if (every <= 0) return false;
  if (!wf.last_run_at) return true;
  return at.getTime() - new Date(wf.last_run_at).getTime() >= every * 60_000;
}

/** Chạy một workflow và ghi toàn bộ kết quả vào workflow_runs. */
export async function executeWorkflow(
  key: WorkflowKey,
  triggerBy: 'cron' | 'manual' = 'cron',
  triggerUser?: string,
): Promise<RunResult & { runId: number }> {
  const sb = supabaseAdmin();

  const { data: run } = await sb.from('workflow_runs')
    .insert({ workflow_key: key, trigger_by: triggerBy, trigger_user: triggerUser ?? null })
    .select('id').single();
  const runId = run!.id as number;

  // Đánh dấu đã chạy ngay từ đầu để lượt tick kế tiếp không chạy chồng
  await sb.from('workflow_schedules')
    .update({ last_run_at: new Date().toISOString(), last_status: 'running' })
    .eq('key', key);

  try {
    const result = await HANDLERS[key]();
    const status = result.failed > 0 ? (result.ok > 0 ? 'partial' : 'error') : 'success';

    await sb.from('workflow_runs').update({
      finished_at: new Date().toISOString(),
      status,
      items_ok: result.ok,
      items_failed: result.failed,
      summary: result.summary,
      detail: result.detail as any,
    }).eq('id', runId);

    await sb.from('workflow_schedules')
      .update({ last_status: status, last_summary: result.summary })
      .eq('key', key);

    return { ...result, runId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await sb.from('workflow_runs').update({
      finished_at: new Date().toISOString(),
      status: 'error',
      items_failed: 1,
      summary: message,
    }).eq('id', runId);

    await sb.from('workflow_schedules')
      .update({ last_status: 'error', last_summary: message })
      .eq('key', key);

    return { ok: 0, failed: 1, summary: message, detail: [], runId };
  }
}

/** Một nhịp đồng hồ: quét toàn bộ workflow, chạy những cái tới hạn. */
export async function tick() {
  const sb = supabaseAdmin();
  const { data } = await sb.from('workflow_schedules').select('*').eq('enabled', true);
  const schedules = (data ?? []) as WorkflowSchedule[];

  const ran: Record<string, string> = {};
  for (const wf of schedules) {
    if (!isDue(wf)) continue;
    const result = await executeWorkflow(wf.key, 'cron');
    ran[wf.key] = result.summary;
  }
  return ran;
}
