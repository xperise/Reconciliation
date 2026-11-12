-- =====================================================================
-- 29_workstream.sql — Tab "Workstream" (chuyển từ repo xperise/Workstream-Dashboard)
-- Chạy SAU 28_mlx_alias.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không mất dữ liệu.
--
--   profiles.xem_workstream : quyền xem tab Workstream (admin luôn xem được).
--   Mặc định false: sau khi chạy, vào Quản lý → Người dùng tick "Workstream" cho từng người.
-- Dữ liệu Workstream (projects, subtasks, meeting_minutes, documents, monthly_actual...) vẫn nằm ở
-- project Supabase riêng của Workstream, không đổi gì ở đây.
-- =====================================================================

alter table public.profiles
  add column if not exists xem_workstream boolean not null default false;

-- Cho phép tài khoản chỉ được cấp mỗi Workstream (hoặc mỗi Hướng dẫn)
alter table public.profiles drop constraint if exists profiles_it_nhat_mot_tab;
alter table public.profiles
  add constraint profiles_it_nhat_mot_tab
  check (xem_xperise or xem_mlx or xem_dashboard or xem_huongdan or xem_workstream);

-- Chỉ admin được đổi quyền (bổ sung cột mới vào trigger đã có)
create or replace function public.profiles_chan_tu_nang_quyen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.role           is distinct from old.role
    or new.is_active      is distinct from old.is_active
    or new.xem_xperise    is distinct from old.xem_xperise
    or new.xem_mlx        is distinct from old.xem_mlx
    or new.xem_dashboard  is distinct from old.xem_dashboard
    or new.xem_db_all     is distinct from old.xem_db_all
    or new.xem_db_ts      is distinct from old.xem_db_ts
    or new.xem_db_m       is distinct from old.xem_db_m
    or new.xem_huongdan   is distinct from old.xem_huongdan
    or new.sua_huongdan   is distinct from old.sua_huongdan
    or new.xem_workstream is distinct from old.xem_workstream
  ) then
    raise exception 'Chỉ admin được đổi vai trò, trạng thái hoặc quyền xem.';
  end if;
  return new;
end $$;
