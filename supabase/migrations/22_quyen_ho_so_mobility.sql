-- =====================================================================
-- 22_quyen_ho_so_mobility.sql — Quyền xem 3 mục trong "Hồ sơ doanh nghiệp" (Dashboard Mobility)
-- Chạy SAU 21_dashboard_the_xpay.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không mất dữ liệu.
--
--   xem_mob_dn  : Thông tin doanh nghiệp (MST, địa chỉ, email)
--   xem_mob_pl  : Phân loại & phụ trách
--   xem_mob_the : Thẻ XPAY (dạng che). Hiện đầy đủ / xuất / import thẻ còn cần vai trò Quản trị hoặc Kế toán.
-- Quản trị luôn xem được cả 3. Admin cấp quyền ở trang Người dùng.
-- =====================================================================

alter table public.profiles
  add column if not exists xem_mob_dn  boolean not null default false,
  add column if not exists xem_mob_pl  boolean not null default true,
  add column if not exists xem_mob_the boolean not null default false;

-- Kế toán đang dùng thông tin doanh nghiệp và thẻ: giữ nguyên quyền khi chạy lần đầu
do $$ begin
  if not exists (select 1 from public.audit_log where action = 'migration.22_quyen_ho_so_mobility') then
    update public.profiles set xem_mob_dn = true, xem_mob_the = true where role = 'ke_toan';
    insert into public.audit_log (action, note) values ('migration.22_quyen_ho_so_mobility', 'Cấp sẵn quyền thông tin DN + thẻ cho Kế toán');
  end if;
end $$;

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
    or new.xem_mob_dn    is distinct from old.xem_mob_dn
    or new.xem_mob_pl    is distinct from old.xem_mob_pl
    or new.xem_mob_the   is distinct from old.xem_mob_the
  ) then
    raise exception 'Chỉ admin được đổi vai trò, trạng thái hoặc quyền xem.';
  end if;
  return new;
end $$;
