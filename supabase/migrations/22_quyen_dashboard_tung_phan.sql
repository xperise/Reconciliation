-- =====================================================================
-- 22_quyen_dashboard_tung_phan.sql — Quyền xem từng phần của tab Dashboard theo người dùng
-- Chạy SAU 20_xoa_tai_khoan.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không mất dữ liệu.
--
--   xem_db_all : Dashboard → Tổng quan
--   xem_db_ts  : Dashboard → Travel & SaaS
--   xem_db_m   : Dashboard → Mobility
--   xem_dashboard (đã có) = có ít nhất 1 phần trên, app tự cập nhật khi admin đổi quyền.
-- Quản trị luôn xem được cả 3. Admin cấp quyền ở trang Người dùng.
-- =====================================================================

alter table public.profiles
  add column if not exists xem_db_all boolean not null default false,
  add column if not exists xem_db_ts  boolean not null default false,
  add column if not exists xem_db_m   boolean not null default false;

-- Lần đầu: ai đang có quyền Dashboard thì giữ nguyên quyền xem cả 3 phần
update public.profiles
   set xem_db_all = true, xem_db_ts = true, xem_db_m = true
 where xem_dashboard and not (xem_db_all or xem_db_ts or xem_db_m);

-- Chỉ admin được đổi quyền (bổ sung 3 cột mới vào trigger đã có)
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
  ) then
    raise exception 'Chỉ admin được đổi vai trò, trạng thái hoặc quyền xem.';
  end if;
  return new;
end $$;
