-- =====================================================================
-- 13_phan_quyen_tab.sql — Quyền xem tab Xperise / MLX theo từng người dùng
-- Chạy SAU 11_mlx_customers.sql và 12_mlx_statements.sql
-- =====================================================================

-- 1) Hai cột quyền. Tài khoản đang có mặc định xem được cả 2 tab.
alter table public.profiles
  add column if not exists xem_xperise boolean not null default true,
  add column if not exists xem_mlx     boolean not null default true;

alter table public.profiles drop constraint if exists profiles_it_nhat_mot_tab;
alter table public.profiles
  add constraint profiles_it_nhat_mot_tab check (xem_xperise or xem_mlx);

-- 2) Chặn người không phải admin tự đổi vai trò / trạng thái / quyền của mình.
--    (Chính sách "tu sua ten cua minh" cho phép sửa cả dòng hồ sơ của mình.)
--    Service role và SQL Editor không có auth.uid() nên không bị chặn.
create or replace function public.profiles_chan_tu_nang_quyen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.role        is distinct from old.role
    or new.is_active   is distinct from old.is_active
    or new.xem_xperise is distinct from old.xem_xperise
    or new.xem_mlx     is distinct from old.xem_mlx
  ) then
    raise exception 'Chỉ admin được đổi vai trò, trạng thái hoặc quyền xem.';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_chan_tu_nang_quyen on public.profiles;
create trigger trg_profiles_chan_tu_nang_quyen
  before update on public.profiles
  for each row execute function public.profiles_chan_tu_nang_quyen();

-- 3) Helper: người đang đăng nhập có được xem MLX không (admin luôn được)
create or replace function public.can_view_mlx() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'admin' or xem_mlx from profiles where id = auth.uid() and is_active),
    false)
$$;

grant execute on function public.can_view_mlx() to authenticated;

-- 4) Khoá dữ liệu MLX theo quyền (thay chính sách "mọi người đăng nhập")
drop policy if exists "mlx_customers_authenticated_all" on public.mlx_customers;
drop policy if exists "mlx_customers_theo_quyen" on public.mlx_customers;
create policy "mlx_customers_theo_quyen"
  on public.mlx_customers for all to authenticated
  using (public.can_view_mlx()) with check (public.can_view_mlx());

drop policy if exists "mlx_statements_authenticated_all" on public.mlx_statements;
drop policy if exists "mlx_statements_theo_quyen" on public.mlx_statements;
create policy "mlx_statements_theo_quyen"
  on public.mlx_statements for all to authenticated
  using (public.can_view_mlx()) with check (public.can_view_mlx());

drop policy if exists "mlx_bang_ke_read"   on storage.objects;
drop policy if exists "mlx_bang_ke_insert" on storage.objects;
drop policy if exists "mlx_bang_ke_update" on storage.objects;
drop policy if exists "mlx_bang_ke_delete" on storage.objects;

create policy "mlx_bang_ke_read"   on storage.objects for select to authenticated
  using (bucket_id = 'mlx-bang-ke' and public.can_view_mlx());
create policy "mlx_bang_ke_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'mlx-bang-ke' and public.can_view_mlx());
create policy "mlx_bang_ke_update" on storage.objects for update to authenticated
  using (bucket_id = 'mlx-bang-ke' and public.can_view_mlx());
create policy "mlx_bang_ke_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'mlx-bang-ke' and public.can_view_mlx());
