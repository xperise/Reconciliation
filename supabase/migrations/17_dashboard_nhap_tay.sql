-- =====================================================================
-- 17_dashboard_nhap_tay.sql — Nhập số tổng thẳng trên dashboard
-- Chạy SAU 16_dashboard_sua_tay.sql. Supabase → SQL Editor → Run.
-- Chạy lại nhiều lần không mất dữ liệu.
-- =====================================================================

-- Số nhập tay trên web, thay cho việc phải sửa file template rồi upload lại.
-- Mỗi dòng là MỘT Ô SỐ TỔNG. Khi hiển thị, web lấy số từ file làm nền rồi
-- đắp các ô ở bảng này lên trên, nên upload file mới không làm mất số nhập tay.
--
--   nhom   = nhóm số liệu:
--            'target'  kế hoạch kỳ          khoa = gmv_hotel | gmv_n2 | kh_n2 | opex_budget …
--            'gmv'     GMV & giá vốn        khoa = <mã dòng dịch vụ>|gmv  hoặc  …|gia_von
--            'opex'    chi phí vận hành     khoa = tên khoản mục
--            'cash'    dòng tiền nửa tháng  khoa = <tên khoản mục>|ke_hoach  hoặc  …|thuc_hien
--   ky     = 'T09.2026', riêng nhom='cash' là 'T09.2026-H1'
create table if not exists fin_manual (
  nhom       text not null,
  ky         text not null,
  khoa       text not null,
  gia_tri    numeric,
  ghi_chu    text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (nhom, ky, khoa)
);

comment on table fin_manual is 'Số tổng nhập thẳng trên dashboard, đắp lên số đọc từ file template';

-- Trình duyệt không được đọc/ghi thẳng: mọi truy cập đi qua API route của web
-- bằng service role key. Bật RLS và cố tình KHÔNG tạo policy nào.
alter table fin_manual enable row level security;
