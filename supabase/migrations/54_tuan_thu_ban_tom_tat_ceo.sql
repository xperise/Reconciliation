-- =====================================================================
-- 54_tuan_thu_ban_tom_tat_ceo.sql — Tóm tắt định kỳ cho CEO (ngày, tuần)
--   • tt_ban_tom_tat: mỗi tổ chức, mỗi loại (ngay | tuan), mỗi ngày kết thúc một bản.
--   • Job định kỳ ghi bản tóm tắt; trang Tổng quan CEO đọc lại.
--   • Additive. RLS theo tổ chức như các bảng khác.
-- Chạy SAU 53_tuan_thu_quyen_va_bao_cao_ceo.sql.
-- =====================================================================

create table if not exists tt_ban_tom_tat (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references tt_to_chuc(id),
  loai       text not null check (loai in ('ngay','tuan')),
  tu         date not null,
  den        date not null,
  noi_dung   text not null,
  so_lieu    jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (org_id, loai, den)
);

create index if not exists tt_ban_tom_tat_org_idx on tt_ban_tom_tat (org_id, loai, den desc);
alter table tt_ban_tom_tat enable row level security;

drop policy if exists tt_ban_tom_tat_org on tt_ban_tom_tat;
create policy tt_ban_tom_tat_org on tt_ban_tom_tat
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));
