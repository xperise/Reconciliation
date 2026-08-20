-- =====================================================================
-- xperise — Hệ thống đối soát bảng kê
-- 01_schema.sql — chạy đầu tiên trong Supabase SQL Editor
--
-- GHI CHÚ MÔ HÌNH DỮ LIỆU
-- Sheet Master Data hiện trộn hai khái niệm vào cùng một dòng:
--   • pháp nhân     — ROX có hơn 40 công ty con, mỗi công ty một dòng
--   • nhóm đối soát — cả 40 công ty đó nhận CHUNG một bảng kê, một
--     thread email, một đồng hồ SLA
-- Vì mọi cột SLA và email của 40 dòng ROX đều giống hệt nhau, giữ cấu
-- trúc phẳng sẽ nhân bản dữ liệu và khiến workflow gửi trùng 40 lần.
-- Ở đây tách hai bảng: billing_groups (đơn vị đối soát) và customers
-- (pháp nhân trực thuộc, phục vụ tra cứu và báo cáo).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Người dùng nội bộ & phân quyền
-- ---------------------------------------------------------------------
create type user_role as enum ('admin', 'ke_toan', 'pm', 'high_level');

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text not null default '',
  role        user_role not null default 'ke_toan',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table profiles is 'Hồ sơ người dùng nội bộ. Admin cấp tài khoản, không cho tự đăng ký.';

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'ke_toan')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- Nhóm đối soát — đơn vị nhận bảng kê. 1 nhóm = 1 file = 1 thread email
-- ---------------------------------------------------------------------
create table billing_groups (
  id                    uuid primary key default gen_random_uuid(),

  -- Dùng đặt tên file và tên thư mục Drive. Phân biệt hoa/thường.
  -- Tương ứng cột "Tên viết tắt trên System" trong sheet cũ.
  ma_he_thong           text not null unique,
  ten_nhom              text not null,          -- cột "Nhóm KH": ROX, CENTRAL RETAIL...

  ngung_hop_tac         boolean not null default false,

  -- Chấm điểm phân nhóm escalate (sheet "3. Quy định chung SLA")
  diem_gmv              smallint check (diem_gmv between 1 and 3),
  diem_company_size     smallint check (diem_company_size between 1 and 3),
  diem_tranh_chap       smallint check (diem_tranh_chap between 1 and 3),
  diem_phuc_tap         smallint check (diem_phuc_tap between 1 and 3),
  tong_diem             smallint generated always as (
                          coalesce(diem_gmv,0) + coalesce(diem_company_size,0)
                          + coalesce(diem_tranh_chap,0) + coalesce(diem_phuc_tap,0)
                        ) stored,
  nhom_escalate         smallint not null default 2 check (nhom_escalate between 1 and 3),

  -- Lịch gửi & SLA. Cột "_hd" theo hợp đồng, "_thuc_te" áp dụng thực tế.
  -- Workflow ưu tiên _thuc_te, rơi về _hd khi _thuc_te để trống.
  ngay_gui_bang_ke_hd       smallint,
  ngay_gui_bang_ke_thuc_te  smallint,
  sla_chap_nhan_hd          smallint,
  sla_chap_nhan_thuc_te     smallint,
  sla_phan_hoi_dieu_chinh   smallint,
  sla_ky_bien_ban           smallint,
  sla_hstt                  smallint,
  payment_term              smallint,

  -- Liên hệ. Nhiều địa chỉ ngăn bằng dấu phẩy.
  email_l1              text,
  email_l2              text,
  email_l3              text,
  email_ke_toan         text,
  email_pm              text,
  email_high_level      text,
  email_cc              text,

  ho_so_thanh_toan      text,   -- để trống = không cần HSTT
  ghi_chu               text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index billing_groups_ngay_gui_idx
  on billing_groups (ngay_gui_bang_ke_thuc_te) where ngung_hop_tac = false;

comment on column billing_groups.ma_he_thong is
  'Phải khớp 100% với tên thư mục Drive và tiền tố tên file. Phân biệt hoa/thường.';

-- ---------------------------------------------------------------------
-- Pháp nhân trực thuộc — phục vụ tra cứu, xuất hóa đơn, báo cáo
-- ---------------------------------------------------------------------
create table customers (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references billing_groups(id) on delete cascade,
  code              text,
  ten_khach_hang    text not null,
  ten_viet_tat      text,
  ngung_hop_tac     boolean not null default false,
  ghi_chu           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index customers_group_idx on customers (group_id);
create index customers_ten_idx on customers (ten_khach_hang);

-- ---------------------------------------------------------------------
-- Tracking — thay thế sheet "Tracking_DoiSoat"
-- ---------------------------------------------------------------------
create type tracking_status as enum (
  'chua_gui',
  'cho_file_da_nhac_noi_bo',
  'da_gui_bang_ke',
  'da_nhan_phan_hoi',
  'cho_duyet_phan_loai',
  'can_chinh_sua',
  'da_chot',
  'cho_ho_so_thanh_toan',
  'da_gui_ho_so_thanh_toan',
  'hoan_tat_cho_thanh_toan',
  'mac_dinh_chap_thuan',
  'can_xu_ly_tay'
);

create table tracking (
  id                   uuid primary key default gen_random_uuid(),
  group_id             uuid not null references billing_groups(id) on delete restrict,
  ma_he_thong          text not null,
  ten_nhom             text not null,
  ky_doi_soat          text not null,          -- 'T07.2026'

  status               tracking_status not null default 'chua_gui',
  ngay_gui_gan_nhat    date,
  link_file_bang_ke    text,
  ten_file_da_gui      text,                   -- chặn WF3 gửi lại đúng file cũ
  link_file_hstt       text,
  ten_file_hstt_da_gui text,

  thread_id            text,                   -- neo mọi email sau này của kỳ
  message_id           text,
  internal_thread_id   text,

  han_chap_nhan        date,
  escalate_level       smallint not null default 0 check (escalate_level between 0 and 3),
  so_vong_remind       smallint not null default 0,
  ngay_remind_cuoi     date,                   -- chặn nhắc 2 lần trong ngày
  ngay_bat_dau_cho_file date,                  -- mốc tính SLA nội bộ D+1, D+2

  ai_de_xuat           text,
  ai_pham_vi           text,
  ai_do_tin_cay        numeric(3,2),
  email_khach_goc      text,                   -- nguyên văn để kế toán đọc khi duyệt
  ghi_chu              text,
  ket_qua_duyet        text,
  nguoi_duyet          uuid references profiles(id),
  ngay_chot            date,
  version_bang_ke      smallint not null default 1,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Nguyên tắc bất khả xâm phạm của SOP: mỗi nhóm mỗi kỳ chỉ một dòng.
-- Trên Google Sheets đây là quy ước dễ vỡ; ở đây cơ sở dữ liệu tự chặn.
create unique index tracking_ky_key on tracking (group_id, ky_doi_soat);
create index tracking_status_idx on tracking (status);
create index tracking_thread_idx on tracking (thread_id);
create index tracking_han_idx on tracking (han_chap_nhan);

-- ---------------------------------------------------------------------
-- Tệp bảng kê & hồ sơ thanh toán — kế toán tải lên ngay trên website
--
-- Trước đây file nằm trên Google Drive và hệ thống phải suy ra nhóm, kỳ,
-- phiên bản bằng cách tách chuỗi tên file, nên sai một ký tự là hỏng.
-- Giờ những thông tin đó là cột trong bảng, người dùng chọn từ danh sách;
-- tên file gốc chỉ còn để hiển thị và đính kèm vào email.
-- ---------------------------------------------------------------------
create type file_kind as enum ('bang_ke', 'hstt');

create table statement_files (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references billing_groups(id) on delete cascade,
  ma_he_thong   text not null,
  ky_doi_soat   text not null,
  kind          file_kind not null,

  -- Bảng kê lần đầu là 1, mỗi lần chỉnh sửa tăng lên. HSTT luôn là 1.
  version       smallint not null default 1,

  storage_path  text not null unique,   -- đường dẫn trong bucket 'bang-ke'
  file_name     text not null,          -- tên gốc lúc tải lên
  mime_type     text,
  size_bytes    bigint,

  uploaded_by   uuid references profiles(id),
  uploaded_at   timestamptz not null default now(),

  -- Rỗng nghĩa là chưa gửi cho khách. Workflow quét đúng cột này.
  sent_at       timestamptz,
  ghi_chu       text
);

-- Mỗi nhóm, mỗi kỳ, mỗi loại chỉ có một bản ở mỗi phiên bản
create unique index statement_files_ban_key
  on statement_files (group_id, ky_doi_soat, kind, version);
create index statement_files_cho_gui_idx
  on statement_files (sent_at) where sent_at is null;

comment on table statement_files is
  'Tệp do kế toán tải lên qua website, lưu trong Supabase Storage bucket bang-ke.';

-- ---------------------------------------------------------------------
-- Nhật ký chuyển trạng thái — thay thế sheet "Log lịch sử"
-- ---------------------------------------------------------------------
create table status_log (
  id              bigserial primary key,
  tracking_id     uuid not null references tracking(id) on delete cascade,
  ten_nhom        text not null,
  ky_doi_soat     text not null,
  status_cu       tracking_status,
  status_moi      tracking_status not null,
  gio_o_status_cu numeric(10,2),
  nguyen_nhan_tre text check (nguyen_nhan_tre in ('internal', 'customer')),
  ghi_chu         text,
  created_at      timestamptz not null default now()
);

create index status_log_tracking_idx on status_log (tracking_id, created_at desc);

create or replace function log_status_change() returns trigger
language plpgsql as $$
declare last_at timestamptz;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select created_at into last_at from status_log
  where tracking_id = new.id order by created_at desc limit 1;

  insert into status_log (tracking_id, ten_nhom, ky_doi_soat, status_cu, status_moi, gio_o_status_cu)
  values (
    new.id, new.ten_nhom, new.ky_doi_soat,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    case when last_at is null then null
         else round(extract(epoch from (now() - last_at)) / 3600.0, 2) end
  );
  return new;
end $$;

create trigger tracking_status_logged
  after insert or update of status on tracking
  for each row execute function log_status_change();

-- ---------------------------------------------------------------------
-- Cấu hình workflow — bật/tắt và đổi lịch ngay trên web
-- ---------------------------------------------------------------------
create table workflow_schedules (
  key              text primary key,          -- wf1 | wf2 | wf3 | wf4
  ten              text not null,
  mo_ta            text,
  enabled          boolean not null default false,
  schedule_kind    text not null default 'daily' check (schedule_kind in ('daily', 'interval')),
  run_at_hhmm      text,                      -- '08:00' khi kind = daily
  interval_minutes integer,                   -- khi kind = interval
  timezone         text not null default 'Asia/Ho_Chi_Minh',
  last_run_at      timestamptz,
  last_status      text,
  last_summary     text,
  updated_at       timestamptz not null default now()
);

create table workflow_runs (
  id            bigserial primary key,
  workflow_key  text not null references workflow_schedules(key) on delete cascade,
  trigger_by    text not null default 'cron' check (trigger_by in ('cron', 'manual')),
  trigger_user  uuid references profiles(id),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running' check (status in ('running','success','partial','error')),
  items_ok      integer not null default 0,
  items_failed  integer not null default 0,
  summary       text,
  detail        jsonb
);

create index workflow_runs_key_idx on workflow_runs (workflow_key, started_at desc);

-- ---------------------------------------------------------------------
-- Audit log — mọi thao tác của con người
-- ---------------------------------------------------------------------
create table audit_log (
  id           bigserial primary key,
  actor_id     uuid references profiles(id),
  actor_email  text,
  action       text not null,
  entity       text,
  entity_id    text,
  before_data  jsonb,
  after_data   jsonb,
  note         text,
  created_at   timestamptz not null default now()
);

create index audit_log_created_idx on audit_log (created_at desc);
create index audit_log_entity_idx on audit_log (entity, entity_id);

-- ---------------------------------------------------------------------
-- Cài đặt hệ thống & token Google (chỉ admin đọc được)
-- ---------------------------------------------------------------------
create table app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- updated_at tự động
-- ---------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger billing_groups_touch before update on billing_groups
  for each row execute function touch_updated_at();
create trigger customers_touch before update on customers
  for each row execute function touch_updated_at();
create trigger tracking_touch before update on tracking
  for each row execute function touch_updated_at();
create trigger workflow_schedules_touch before update on workflow_schedules
  for each row execute function touch_updated_at();
