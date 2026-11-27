-- =====================================================================
-- 55_tuan_thu_loi_moi.sql — Mời thành viên qua email
--   • tt_loi_moi: lời mời gửi tới một email, gắn role và quyền bổ sung, hết hạn sau 7 ngày.
--   • Chỉ lưu băm của mã mời (không lưu mã gốc).
--   • Additive. RLS theo tổ chức.
-- Chạy SAU 54_tuan_thu_ban_tom_tat_ceo.sql.
-- =====================================================================

create table if not exists tt_loi_moi (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references tt_to_chuc(id),
  email        text not null,
  phong_ban    text not null references tt_role(key),
  quyen        text[] not null default '{}',
  ma_bam       text not null unique,
  het_han      timestamptz not null,
  trang_thai   text not null default 'dang_cho' check (trang_thai in ('dang_cho','da_nhan','thu_hoi','het_han')),
  moi_boi      uuid not null,
  created_at   timestamptz not null default now()
);

create index if not exists tt_loi_moi_org_idx on tt_loi_moi (org_id, trang_thai);
alter table tt_loi_moi enable row level security;

drop policy if exists tt_loi_moi_org on tt_loi_moi;
create policy tt_loi_moi_org on tt_loi_moi
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));
