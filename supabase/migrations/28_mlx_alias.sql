-- =====================================================================
-- 28_mlx_alias.sql — Ghi nhớ tên khách trên file → khách trong master data MLX
-- Khi tên trên file upload không khớp master data, người dùng chọn lại khách (hoặc tạo khách mới):
-- tên đó được ghi vào đây, lần sau gặp đúng tên này hệ thống tự khớp.
-- alias_key = tên đã chuẩn hoá (bỏ dấu, chữ thường, bỏ ký tự đặc biệt) — cùng cách chuẩn hoá với app.
-- Chạy sau 11_mlx_customers.sql. An toàn khi chạy lại.
-- =====================================================================
create table if not exists public.mlx_alias (
  alias_key    text primary key,
  alias_text   text not null default '',
  customer_id  uuid not null references public.mlx_customers(id) on delete cascade,
  created_at   timestamptz not null default now(),
  created_by   text
);
create index if not exists mlx_alias_customer_idx on public.mlx_alias (customer_id);

alter table public.mlx_alias enable row level security;
drop policy if exists "mlx_alias_authenticated_all" on public.mlx_alias;
create policy "mlx_alias_authenticated_all"
  on public.mlx_alias for all to authenticated
  using (true) with check (true);
