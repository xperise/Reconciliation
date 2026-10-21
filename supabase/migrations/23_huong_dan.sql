-- =====================================================================
-- 23_huong_dan.sql — Tab "Hướng dẫn": hướng dẫn sử dụng theo mảng dịch vụ × đối tượng
-- Chạy SAU 22_quyen_dashboard_tung_phan.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không mất dữ liệu.
--
--   guides          : mỗi hướng dẫn 1 dòng; nội dung = danh sách mục [{id, title, md}] (Markdown)
--   guide_versions  : mỗi lần lưu giữ lại 1 bản để xem lại / khôi phục
--   guide_images    : ảnh chèn trong hướng dẫn (lưu trong database, chỉ người đăng nhập xem được)
--   profiles.xem_huongdan / sua_huongdan : quyền xem / sửa tab Hướng dẫn (admin luôn có cả hai)
-- Chỉ API phía server (service role) đọc/ghi; trình duyệt không truy cập trực tiếp.
-- =====================================================================

create table if not exists guides (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  service     text not null,                 -- mobility | travel | fnb | saas | noi-bo
  audience    text not null,                 -- internal | khach-hang | don-vi
  summary     text,
  version     text not null default '1.0',
  owner       text,                          -- người phụ trách nội dung
  status      text not null default 'nhap',  -- nhap | phat-hanh
  sections    jsonb not null default '[]',   -- [{ id, title, md }]
  sort        int  not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists guides_service_idx on guides (service, audience, sort);

create table if not exists guide_versions (
  id         bigserial primary key,
  guide_id   uuid not null references guides(id) on delete cascade,
  version    text,
  title      text,
  sections   jsonb not null,
  meta       jsonb,
  saved_at   timestamptz not null default now(),
  saved_by   text,
  note       text
);
create index if not exists guide_versions_guide_idx on guide_versions (guide_id, saved_at desc);

create table if not exists guide_images (
  id          uuid primary key default gen_random_uuid(),
  guide_id    uuid references guides(id) on delete set null,
  mime        text not null,
  data        text not null,                 -- base64
  bytes       int,
  created_at  timestamptz not null default now(),
  created_by  text
);

alter table guides         enable row level security;
alter table guide_versions enable row level security;
alter table guide_images   enable row level security;

-- Quyền tab Hướng dẫn
alter table public.profiles
  add column if not exists xem_huongdan boolean not null default true,
  add column if not exists sua_huongdan boolean not null default false;

-- Chỉ admin được đổi quyền (bổ sung 2 cột mới vào trigger đã có)
create or replace function public.profiles_chan_tu_nang_quyen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.role          is distinct from old.role
    or new.is_active     is distinct from old.is_active
    or new.xem_xperise   is distinct from old.xem_xperise
    or new.xem_mlx       is distinct from old.xem_mlx
    or new.xem_dashboard is distinct from old.xem_dashboard
    or new.xem_db_all    is distinct from old.xem_db_all
    or new.xem_db_ts     is distinct from old.xem_db_ts
    or new.xem_db_m      is distinct from old.xem_db_m
    or new.xem_huongdan  is distinct from old.xem_huongdan
    or new.sua_huongdan  is distinct from old.sua_huongdan
  ) then
    raise exception 'Chỉ admin được đổi vai trò, trạng thái hoặc quyền xem.';
  end if;
  return new;
end $$;
