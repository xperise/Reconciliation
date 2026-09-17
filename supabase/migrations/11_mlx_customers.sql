-- Master data khách hàng cho tab MLX (chuyển đổi bảng kê taxi)
create table if not exists public.mlx_customers (
  id           uuid primary key default gen_random_uuid(),
  ten_cong_ty  text not null,
  ten_viet_tat text not null default '',
  dia_chi      text not null default '',
  mst          text not null default '',
  -- % chiết khấu nhập dạng 0–100 (5 = 5%). Không dùng numeric(3,2) để tránh lỗi tràn giá trị.
  chiet_khau   numeric(6,3) not null default 0 check (chiet_khau >= 0 and chiet_khau <= 100),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists mlx_customers_ten_cong_ty_uq
  on public.mlx_customers (lower(btrim(ten_cong_ty)));

create or replace function public.mlx_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_mlx_customers_updated on public.mlx_customers;
create trigger trg_mlx_customers_updated
  before update on public.mlx_customers
  for each row execute function public.mlx_set_updated_at();

alter table public.mlx_customers enable row level security;

drop policy if exists "mlx_customers_authenticated_all" on public.mlx_customers;
create policy "mlx_customers_authenticated_all"
  on public.mlx_customers for all
  to authenticated
  using (true) with check (true);
