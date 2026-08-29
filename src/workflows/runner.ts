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
      // Gộp cả diễn biến từng nhóm lẫn danh sách thư đã gửi, để màn hình
      // Lịch sử chạy trả lời được câu "lượt này đã gửi thư gì cho ai".
      detail: { buoc: result.detail, mails: result.mails ?? [] } as any,
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

/**
 * Vì sao một workflow không được chạy ở nhịp này.
 * Trả về chuỗi rỗng nghĩa là tới hạn, phải chạy.
 */
export function lyDoBoQua(wf: WorkflowSchedule, at = new Date()): string {
  if (!wf.enabled) return 'đang tắt';

  const { isoDate, hhmm } = nowInVN(at);

  if (wf.schedule_kind === 'daily') {
    if (!wf.run_at_hhmm) return 'chưa đặt giờ chạy';
    if (hhmm < wf.run_at_hhmm) return `chưa tới giờ hẹn ${wf.run_at_hhmm}, hiện ${hhmm}`;
    if (!wf.last_run_at) return '';
    return nowInVN(new Date(wf.last_run_at)).isoDate === isoDate
      ? 'hôm nay đã chạy rồi' : '';
  }

  const every = wf.interval_minutes ?? 0;
  if (every <= 0) return 'chưa đặt số phút lặp';
  if (!wf.last_run_at) return '';

  const daQua = Math.floor((at.getTime() - new Date(wf.last_run_at).getTime()) / 60_000);
  return daQua >= every ? '' : `mới chạy ${daQua} phút trước, chu kỳ ${every} phút`;
}

/**
 * Một nhịp đồng hồ: quét toàn bộ workflow, chạy những cái tới hạn.
 *
 * Trả về cả những workflow bị bỏ qua kèm lý do. Khi cron gọi đều mà không có
 * gì chạy, đây là chỗ duy nhất cho biết vì sao — thay vì phải đoán giữa "cờ
 * chưa bật", "chưa tới giờ" và "đã chạy hôm nay rồi".
 */
export async function tick() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('workflow_schedules').select('*');

  if (error) {
    return { loi: `Không đọc được bảng lịch: ${error.message}`, ran: {}, boQua: {} };
  }

  const schedules = (data ?? []) as WorkflowSchedule[];
  const ran: Record<string, string> = {};
  const boQua: Record<string, string> = {};

  for (const wf of schedules) {
    const lyDo = lyDoBoQua(wf);
    if (lyDo) { boQua[wf.key] = lyDo; continue; }
    const result = await executeWorkflow(wf.key, 'cron');
    ran[wf.key] = result.summary;
  }

  return {
    gioVN: nowInVN().hhmm,
    soWorkflow: schedules.length,
    soDangBat: schedules.filter((w) => w.enabled).length,
    ran,
    boQua,
  };
}
