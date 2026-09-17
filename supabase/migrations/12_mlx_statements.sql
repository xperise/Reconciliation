-- Lịch sử bảng kê MLX: lưu file đã xuất theo kỳ để thống kê, tải lại, xoá
-- Chạy SAU file 11_mlx_customers.sql

-- 1) Bảng lịch sử
create table if not exists public.mlx_statements (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid references public.mlx_customers(id) on delete set null,
  ten_cong_ty      text not null,
  ten_viet_tat     text not null default '',
  ky               text not null check (ky ~ '^\d{4}-(0[1-9]|1[0-2])$'),  -- vd 2026-09
  file_name        text not null,                                         -- tên file xuất
  storage_path     text not null unique,                                  -- đường dẫn trong bucket
  source_file_name text not null,                                         -- tên file raw
  source_hash      text not null,                                         -- SHA-256 nội dung file raw
  row_count        integer not null default 0,
  total_amount     numeric(18,0) not null default 0,                      -- tổng cước (đã gồm VAT)
  payable_amount   numeric(18,0) not null default 0,                      -- tổng thanh toán sau chiết khấu
  created_by       uuid default auth.uid(),
  created_by_email text,
  created_at       timestamptz not null default now()
);

create index if not exists mlx_statements_ky_idx on public.mlx_statements (ky);
create index if not exists mlx_statements_hash_idx on public.mlx_statements (source_hash);
create index if not exists mlx_statements_customer_ky_idx on public.mlx_statements (customer_id, ky);

alter table public.mlx_statements enable row level security;
drop policy if exists "mlx_statements_authenticated_all" on public.mlx_statements;
create policy "mlx_statements_authenticated_all"
  on public.mlx_statements for all to authenticated
  using (true) with check (true);

-- 2) View tổng hợp theo kỳ (tôn trọng RLS của người xem)
create or replace view public.mlx_statement_periods
with (security_invoker = true) as
select
  ky,
  count(*)::int                    as file_count,
  count(distinct coalesce(customer_id::text, ten_cong_ty))::int as customer_count,
  coalesce(sum(row_count), 0)::bigint      as row_count,
  coalesce(sum(total_amount), 0)::numeric  as total_amount,
  coalesce(sum(payable_amount), 0)::numeric as payable_amount,
  max(created_at)                  as last_created_at
from public.mlx_statements
group by ky;

grant select on public.mlx_statement_periods to authenticated;

-- 3) Bucket lưu file (private)
insert into storage.buckets (id, name, public)
values ('mlx-bang-ke', 'mlx-bang-ke', false)
on conflict (id) do nothing;

drop policy if exists "mlx_bang_ke_read"   on storage.objects;
drop policy if exists "mlx_bang_ke_insert" on storage.objects;
drop policy if exists "mlx_bang_ke_update" on storage.objects;
drop policy if exists "mlx_bang_ke_delete" on storage.objects;

create policy "mlx_bang_ke_read"   on storage.objects for select to authenticated using (bucket_id = 'mlx-bang-ke');
create policy "mlx_bang_ke_insert" on storage.objects for insert to authenticated with check (bucket_id = 'mlx-bang-ke');
create policy "mlx_bang_ke_update" on storage.objects for update to authenticated using (bucket_id = 'mlx-bang-ke');
create policy "mlx_bang_ke_delete" on storage.objects for delete to authenticated using (bucket_id = 'mlx-bang-ke');
