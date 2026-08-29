-- =====================================================================
-- 06_bo_sung.sql — bổ sung cho bản cập nhật tháng 8
-- Chạy sau 05_seed_master_data.sql. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

-- Thời điểm kế toán bấm duyệt, để màn hình Chờ duyệt sắp xếp và lưu lịch sử
alter table tracking add column if not exists ngay_duyet timestamptz;

-- Bảng thông báo hiện trên chuông ở góc phải màn hình
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  -- Rỗng nghĩa là thông báo chung, mọi người nội bộ đều thấy
  user_id     uuid references profiles(id) on delete cascade,
  -- Chỉ những vai trò này nhìn thấy. Rỗng là tất cả.
  roles       user_role[],
  muc         text not null default 'info' check (muc in ('info', 'canh_bao', 'khan')),
  tieu_de     text not null,
  noi_dung    text,
  lien_ket    text,
  entity      text,
  entity_id   text,
  da_doc_boi  uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists notifications_created_idx on notifications (created_at desc);

alter table notifications enable row level security;

drop policy if exists "nguoi dung doc thong bao cua minh" on notifications;
create policy "nguoi dung doc thong bao cua minh"
  on notifications for select
  using (
    auth.uid() is not null
    and (user_id is null or user_id = auth.uid())
    and (roles is null or current_role_name() = any(roles))
  );

drop policy if exists "nguoi dung danh dau da doc" on notifications;
create policy "nguoi dung danh dau da doc"
  on notifications for update
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- Nhật ký gửi tệp: mỗi lần gửi cho khách là một dòng, kể cả gửi lại
create table if not exists send_log (
  id            uuid primary key default gen_random_uuid(),
  file_id       uuid references statement_files(id) on delete set null,
  tracking_id   uuid references tracking(id) on delete cascade,
  ma_he_thong   text not null,
  ky_doi_soat   text not null,
  kind          text not null,
  version       smallint,
  file_name     text,
  den           text,
  cc            text,
  la_gui_lai    boolean not null default false,
  ly_do_gui_lai text,
  nguoi_gui     uuid references profiles(id),
  nguon         text not null default 'workflow' check (nguon in ('workflow', 'thu_cong')),
  created_at    timestamptz not null default now()
);

create index if not exists send_log_tracking_idx on send_log (tracking_id, created_at desc);

alter table send_log enable row level security;

drop policy if exists "moi nguoi doc nhat ky gui" on send_log;
create policy "moi nguoi doc nhat ky gui"
  on send_log for select using (auth.uid() is not null);
