import { supabaseAdmin } from './supabase/admin';

type AuditInput = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  note?: string;
};

/** Ghi một dòng audit. Không bao giờ ném lỗi ra ngoài để khỏi chặn nghiệp vụ chính. */
export async function writeAudit(input: AuditInput) {
  try {
    await supabaseAdmin().from('audit_log').insert({
      actor_id: input.actorId ?? null,
      actor_email: input.actorEmail ?? null,
      action: input.action,
      entity: input.entity ?? null,
      entity_id: input.entityId ?? null,
      before_data: input.before ?? null,
      after_data: input.after ?? null,
      note: input.note ?? null,
    });
  } catch (err) {
    console.error('[audit] không ghi được:', err);
  }
}
