-- =====================================================================
-- 16_dashboard_sua_tay.sql — Sửa công nợ trực tiếp trên web + nối bảng kê
-- Chạy SAU 15_dashboard_bo_sung.sql. Supabase → SQL Editor → Run.
-- Chạy lại nhiều lần không mất dữ liệu.
-- =====================================================================

-- 1) Ánh xạ khách hàng của dashboard sang nhóm đối soát của app Reconciliation,
--    để lấy ngày gửi bảng kê từ bảng tracking thay vì nhập tay.
--    Để trống thì web tự dò theo customers.code rồi billing_groups.ma_he_thong.
alter table fin_customers add column if not exists ma_he_thong text;

-- 2) Sổ sửa tay công nợ phải thu.
--    Tách riêng khỏi fin_ar vì mỗi lần upload file template là fin_ar bị thay
--    toàn bộ; bảng này không bị đụng tới nên số sửa trên web không bao giờ mất.
--    Khi hiển thị, web lấy fin_ar làm nền rồi đắp các ô có giá trị ở đây lên.
create table if not exists fin_ar_edit (
  ma_kh             text not null,
  ky                text not null,
  so_ct             text not null default '',
  ngay_gui_bk       date,
  ngay_hd           date,
  ngay_den_han      date,
  so_tien           bigint,
  da_thu            bigint,
  ngay_thu_du       date,
  ngay_thu_gan_nhat date,
  ghi_chu           text,
  -- true: dòng do người dùng tạo trên web, không có trong file template
  tu_tao            boolean not null default false,
  -- true: ẩn dòng này đi (dùng khi file có dòng sai, chưa kịp sửa file)
  xoa               boolean not null default false,
  updated_by        text,
  updated_at        timestamptz not null default now(),
  primary key (ma_kh, ky, so_ct)
);

-- 3) Sổ sửa tay công nợ phải trả
create table if not exists fin_ap_edit (
  ma_ncc       text not null,
  ky           text not null default '',
  so_ct        text not null default '',
  ngay_hd      date,
  ngay_den_han date,
  so_tien      bigint,
  da_tra       bigint,
  ngay_tra     date,
  ghi_chu      text,
  tu_tao       boolean not null default false,
  xoa          boolean not null default false,
  updated_by   text,
  updated_at   timestamptz not null default now(),
  primary key (ma_ncc, ky, so_ct)
);

alter table fin_ar_edit enable row level security;
alter table fin_ap_edit enable row level security;
