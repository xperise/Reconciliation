-- =====================================================================
-- 07_lich_gui_va_lo_tep.sql
-- Chạy sau 06_bo_sung.sql. Chạy lại nhiều lần vẫn an toàn.
--
-- Ba thay đổi:
--   1. Lịch gửi tách khỏi nhóm khách, cho phép nhiều đợt trong một tháng
--   2. Kỳ đối soát ghi theo tháng dữ liệu, không suy ra từ tháng gửi
--   3. Một kỳ có thể gồm nhiều tệp, gửi chung một email
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lịch gửi
-- ---------------------------------------------------------------------

-- Kỳ đối soát luôn mang tên tháng của dữ liệu bên trong nó. Khách gửi cuối
-- tháng 8 cho dữ liệu tháng 8 thì kỳ là T08.2026; khách gửi đầu tháng 9 cho
-- dữ liệu tháng 8 cũng là T08.2026. Cột này cho biết lấy tháng nào.
do $$ begin
  create type ky_thuoc as enum ('thang_nay', 'thang_truoc');
exception when duplicate_object then null; end $$;

create table if not exists billing_schedules (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references billing_groups(id) on delete cascade,

  -- Số thứ tự đợt trong tháng. Khách gửi một lần thì chỉ có đợt 1.
  dot             smallint not null default 1 check (dot between 1 and 6),

  -- Nhãn phạm vi hiện trong email và trên giao diện, ví dụ "Nửa đầu tháng",
  -- "01–15", "Cả tháng". Để trống nghĩa là cả tháng.
  pham_vi_nhan    text,

  ngay_gui        smallint not null check (ngay_gui between 1 and 31),
  ky_thuoc_thang  ky_thuoc not null default 'thang_truoc',

  -- Cho phép hai đợt của cùng một khách có SLA khác nhau. Để trống thì dùng
  -- SLA khai ở cấp nhóm.
  sla_chap_nhan   smallint,

  enabled         boolean not null default true,
  ghi_chu         text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists billing_schedules_dot_key
  on billing_schedules (group_id, dot);
create index if not exists billing_schedules_ngay_idx
  on billing_schedules (ngay_gui) where enabled;

drop trigger if exists billing_schedules_touch on billing_schedules;
create trigger billing_schedules_touch before update on billing_schedules
  for each row execute function touch_updated_at();

-- Sinh lịch đợt 1 cho mọi nhóm đã có, lấy từ các cột lịch cũ.
-- Các cột cũ trên billing_groups giữ nguyên để còn đường lùi.
insert into billing_schedules (group_id, dot, ngay_gui, ky_thuoc_thang, sla_chap_nhan, enabled)
select
  g.id, 1,
  coalesce(g.ngay_gui_bang_ke_thuc_te, g.ngay_gui_bang_ke_hd, 30),
  'thang_truoc'::ky_thuoc,
  coalesce(g.sla_chap_nhan_thuc_te, g.sla_chap_nhan_hd),
  not g.ngung_hop_tac
from billing_groups g
on conflict (group_id, dot) do nothing;

-- ---------------------------------------------------------------------
-- 2. Tracking mang theo đợt
-- ---------------------------------------------------------------------

alter table tracking add column if not exists dot smallint not null default 1;
alter table tracking add column if not exists pham_vi_nhan text;

-- Khóa duy nhất đổi từ (nhóm, kỳ) sang (nhóm, kỳ, đợt): một tháng có thể có
-- hai bảng kê của cùng một khách, mỗi bảng kê một dòng theo dõi riêng.
drop index if exists tracking_ky_key;
create unique index if not exists tracking_ky_dot_key
  on tracking (group_id, ky_doi_soat, dot);

alter table statement_files add column if not exists dot smallint not null default 1;

-- ---------------------------------------------------------------------
-- 3. Lô tệp
-- ---------------------------------------------------------------------

-- Các tệp tải lên trong cùng một lượt, cùng nhóm–kỳ–đợt–loại thì chung lô và
-- chung số bản. Khi gửi, toàn bộ lô đính kèm vào một email.
alter table statement_files add column if not exists batch_id uuid;

update statement_files set batch_id = id where batch_id is null;
alter table statement_files alter column batch_id set not null;

create index if not exists statement_files_batch_idx on statement_files (batch_id);

-- Ràng buộc cũ chặn hai tệp cùng số bản, giờ nhiều tệp cùng lô phải dùng
-- chung số bản nên phải bỏ. Đường dẫn trong kho vẫn là duy nhất.
drop index if exists statement_files_ban_key;
create index if not exists statement_files_ban_idx
  on statement_files (group_id, ky_doi_soat, dot, kind, version);

alter table send_log add column if not exists dot smallint not null default 1;
alter table send_log add column if not exists batch_id uuid;
alter table send_log add column if not exists so_tep smallint;

-- ---------------------------------------------------------------------
-- Phân quyền cho bảng mới
-- ---------------------------------------------------------------------

alter table billing_schedules enable row level security;

drop policy if exists "moi nguoi doc lich gui" on billing_schedules;
create policy "moi nguoi doc lich gui"
  on billing_schedules for select using (auth.uid() is not null);

drop policy if exists "ke toan sua lich gui" on billing_schedules;
create policy "ke toan sua lich gui"
  on billing_schedules for all
  using (current_role_name() in ('admin', 'ke_toan'))
  with check (current_role_name() in ('admin', 'ke_toan'));
