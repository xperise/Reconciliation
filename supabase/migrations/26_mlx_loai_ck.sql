-- =====================================================================
-- 26_mlx_loai_ck.sql — Bảng phân loại chiết khấu cho tab MLX
-- Nạp từ file THOP_AR02 (sheet "C NGUYET"): SO_HD_CU | SO_HD CMS | TEN_KH | MA_SO_THUE | loại CK.
-- Khi lập bảng kê, khách được tra loại CK theo: mã hợp đồng = SO_HD CMS → mã khách hàng = SO_HD_CU → MST (chỉ khi MST có đúng 1 hợp đồng).
-- Chạy sau 11_mlx_customers.sql. An toàn khi chạy lại nhiều lần.
-- =====================================================================
create table if not exists public.mlx_loai_ck (
  so_hd_cms   text primary key,
  so_hd_cu    text not null default '',
  ten_kh      text not null default '',
  mst         text not null default '',
  loai_ck     text not null default '',
  updated_at  timestamptz not null default now()
);
create index if not exists mlx_loai_ck_cu_idx  on public.mlx_loai_ck (so_hd_cu);
create index if not exists mlx_loai_ck_mst_idx on public.mlx_loai_ck (mst);

alter table public.mlx_loai_ck enable row level security;
drop policy if exists "mlx_loai_ck_authenticated_all" on public.mlx_loai_ck;
create policy "mlx_loai_ck_authenticated_all"
  on public.mlx_loai_ck for all to authenticated
  using (true) with check (true);
