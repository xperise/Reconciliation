-- =====================================================================
-- 51_tuan_thu_nguoi_to_chuc.sql — Nền tảng nhiều tổ chức (bước 2)
--   • Bảng tt_nguoi_to_chuc: người dùng thuộc tổ chức nào.
--   • Gán mọi người đang có trong tt_thanh_vien vào tổ chức mặc định (dữ liệu hiện có).
--   • Additive. Người chưa có dòng nào được coi là thuộc tổ chức mặc định (xem toChucHienTai).
-- Chạy SAU 50_tuan_thu_nen_to_chuc.sql.
-- =====================================================================

create table if not exists tt_nguoi_to_chuc (
  user_id    uuid not null,
  org_id     uuid not null references tt_to_chuc(id),
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

alter table tt_nguoi_to_chuc enable row level security;

insert into tt_nguoi_to_chuc (user_id, org_id)
select distinct tv.user_id, '00000000-0000-0000-0000-000000000001'::uuid
from tt_thanh_vien tv
where tv.user_id is not null
on conflict (user_id, org_id) do nothing;
