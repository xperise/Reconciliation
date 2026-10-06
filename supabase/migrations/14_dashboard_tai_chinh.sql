-- ============================================================
-- 14_dashboard_tai_chinh.sql
-- Dashboard quản trị tài chính & KPI — bảng dữ liệu.
-- Chạy SAU 13_phan_quyen_tab.sql. Supabase → SQL Editor → Run. Chạy lại không mất dữ liệu.
--
-- Quy ước:
--   * Tiền lưu VND nguyên (bigint). Tỷ lệ lưu dạng thập phân (0.05 = 5%).
--   * Kỳ tháng dạng 'T09.2026', kỳ nửa tháng dạng 'T09.2026-H1'.
--   * Bật RLS và KHÔNG tạo policy: trình duyệt không đọc/ghi trực tiếp được.
--     Web đọc/ghi qua API route bằng SUPABASE_SERVICE_ROLE_KEY (bỏ qua RLS).
--   * Mọi chỉ số (margin, %đạt, hoa hồng, tuổi nợ…) được tính trên web từ dữ liệu gốc,
--     không lưu vào DB — trừ bản chốt hoa hồng (fin_snapshots).
-- ============================================================

create table if not exists fin_params (
  key        text primary key,
  value      text,
  note       text,
  updated_at timestamptz not null default now()
);

create table if not exists fin_customers (
  ma_kh        text primary key,
  ten_kh       text not null,
  ten_viet_tat text,
  nhom         text not null check (nhom in ('N1','N2','N3','N4','N5')),
  pm           text,
  sales        text,
  credit_term  int,
  ghi_chu      text,
  updated_at   timestamptz not null default now()
);

create table if not exists fin_suppliers (
  ma_ncc       text primary key,
  ten_ncc      text not null,
  nganh        text not null,
  payment_term int  not null,
  partnership  text,
  updated_at   timestamptz not null default now()
);

create table if not exists fin_staff (
  ho_ten         text primary key,
  team           text not null check (team in ('PM','Sales','Partnership')),
  truc           text,
  tl_pool_gmv    numeric,
  tl_pool_hd     numeric,
  tl_partnership numeric,
  updated_at     timestamptz not null default now()
);

create table if not exists fin_pm_alloc (
  nhom     text not null,
  pm       text not null,
  so_khach numeric not null,
  primary key (nhom, pm)
);

create table if not exists fin_targets (
  ky          text primary key,
  gmv_hotel   bigint, gmv_flight bigint,
  gmv_n2      bigint, gmv_n3 bigint, gmv_n4 bigint, gmv_n5 bigint,
  gmv_saas_t  bigint, gmv_saas_m bigint, gmv_fnb bigint,
  kh_n1 int, kh_n2 int, kh_n3 int, kh_n4 int, kh_n5 int,
  opex_budget bigint,
  updated_at  timestamptz not null default now()
);

create table if not exists fin_gmv (
  id         bigserial primary key,
  ky         text   not null,
  ma_kh      text   not null,
  ma_ncc     text,
  dich_vu    text   not null,
  gmv        bigint not null default 0,
  gia_von    bigint not null default 0,
  chiet_khau bigint
);
create index if not exists fin_gmv_ky_idx on fin_gmv (ky);
create index if not exists fin_gmv_kh_idx on fin_gmv (ma_kh);

create table if not exists fin_ar (
  id           bigserial primary key,
  ma_kh        text   not null,
  ky           text   not null,
  so_ct        text,
  ngay_hd      date,
  ngay_den_han date   not null,
  so_tien      bigint not null,
  da_thu       bigint,
  ngay_thu_du  date
);
create index if not exists fin_ar_kh_idx on fin_ar (ma_kh);

create table if not exists fin_ap (
  id           bigserial primary key,
  ma_ncc       text   not null,
  ky           text,
  so_ct        text,
  ngay_hd      date   not null,
  ngay_den_han date   not null,
  so_tien      bigint not null,
  da_tra       bigint,
  ngay_tra     date
);

create table if not exists fin_cash (
  ky_nua_thang text not null,
  khoan_muc    text not null,
  ke_hoach     bigint,
  thuc_hien    bigint,
  primary key (ky_nua_thang, khoan_muc)
);

create table if not exists fin_opex (
  ky        text   not null,
  khoan_muc text   not null,
  so_tien   bigint not null,
  primary key (ky, khoan_muc)
);

create table if not exists fin_contracts (
  ma_kh   text primary key,
  nhom    text not null check (nhom in ('N1','N3','N5')),
  sales   text not null,
  ngay_ky date not null,
  so_user int
);

create table if not exists fin_uploads (
  id          bigserial primary key,
  file_name   text,
  uploaded_at timestamptz not null default now(),
  summary     jsonb
);

create table if not exists fin_snapshots (
  ky        text primary key,
  data      jsonb not null,
  locked_at timestamptz not null default now(),
  note      text
);

alter table fin_params    enable row level security;
alter table fin_customers enable row level security;
alter table fin_suppliers enable row level security;
alter table fin_staff     enable row level security;
alter table fin_pm_alloc  enable row level security;
alter table fin_targets   enable row level security;
alter table fin_gmv       enable row level security;
alter table fin_ar        enable row level security;
alter table fin_ap        enable row level security;
alter table fin_cash      enable row level security;
alter table fin_opex      enable row level security;
alter table fin_contracts enable row level security;
alter table fin_uploads   enable row level security;
alter table fin_snapshots enable row level security;

-- ------------------------------------------------------------
-- Quyền xem tab Dashboard (cùng cơ chế với xem_xperise / xem_mlx)
-- Mặc định KHÔNG ai xem được (số hoa hồng từng người là thông tin nhạy cảm).
-- Admin luôn xem được. Admin tick quyền cho từng người trong trang Người dùng.
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists xem_dashboard boolean not null default false;

create or replace function public.profiles_chan_tu_nang_quyen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.role          is distinct from old.role
    or new.is_active     is distinct from old.is_active
    or new.xem_xperise   is distinct from old.xem_xperise
    or new.xem_mlx       is distinct from old.xem_mlx
    or new.xem_dashboard is distinct from old.xem_dashboard
  ) then
    raise exception 'Chỉ admin được đổi vai trò, trạng thái hoặc quyền xem.';
  end if;
  return new;
end $$;
