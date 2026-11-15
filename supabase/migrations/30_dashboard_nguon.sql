-- =====================================================================
-- 30_dashboard_nguon.sql — Nạp thẳng file nguồn vào Dashboard (11/2026)
-- Chạy SAU 29_workstream.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không mất dữ liệu.
--
-- Thay cho việc chép số vào file template, tab Dữ liệu nhận thẳng 4 loại file:
--   · Bảng kê khách hàng hotel / flight (xperise_*_statement_*.xlsx)  → fin_src_kh
--   · File đối soát NCC (Doi_soat_*.xlsx)                              → fin_src_ncc
--   · Sổ công nợ phải thu (GOC_CONG_NO_PHAI_THU*.xlsx)                → fin_ar + fin_customers
-- Sau mỗi lần nạp, web dựng lại GMV & giá vốn theo ngày vào fin_gmv (nguon = 'bk'):
--   giá vốn của từng giao dịch lấy từ file đối soát NCC, nối bằng mã booking / số vé.
-- =====================================================================

-- GMV theo ngày và phần GMV đã có giá vốn
alter table fin_gmv add column if not exists ngay date;
alter table fin_gmv add column if not exists gmv_co_gv bigint;   -- phần GMV đã có giá vốn; null = toàn bộ GMV đã có giá vốn
alter table fin_gmv add column if not exists nguon text;         -- 'bk' = dựng từ bảng kê khách hàng; null = file template / nhập tay
create index if not exists fin_gmv_ngay_idx on fin_gmv (ngay);

-- Từng dòng bảng kê khách hàng (hotel / flight)
create table if not exists fin_src_kh (
  id           bigserial primary key,
  loai         text   not null check (loai in ('hotel', 'flight')),
  ky           text   not null,             -- 'T10.2026', theo ngày giao dịch
  ngay         date   not null,             -- ngày giao dịch
  ten_cong_ty  text,
  trang_thai   text,
  ma_gd        text,                        -- hotel: mã giao dịch · flight: mã giao dịch chiều đi
  ma_gd2       text,                        -- flight: mã giao dịch chiều về
  so_ve        text,
  so_hd        text,                        -- số hóa đơn (nối với sổ phải thu)
  gmv          bigint not null default 0,   -- Thành tiền (đã VAT)
  tong_tt      bigint,                      -- Tổng thành tiền (sau chiết khấu, có phí dịch vụ)
  chiet_khau   bigint,
  phi_dv       bigint,
  khach        text,
  mo_ta        text,
  file_name    text,
  uploaded_at  timestamptz not null default now()
);
create index if not exists fin_src_kh_ky_idx on fin_src_kh (loai, ky);

-- Từng dòng file đối soát NCC
create table if not exists fin_src_ncc (
  id           bigserial primary key,
  file_key     text   not null,             -- tên file bỏ phần ngày xuất: nạp lại cùng kỳ đối soát thì thay
  ncc          text,                        -- 'flight:DATACOM', 'hotel:AGODA', 'hotel:XPERISE:4273'…
  nganh        text,                        -- Hotel / Flight
  ma_booking   text,
  so_ve        text,
  khach        text,
  ngay_dv      date,
  ky           text,
  bang_ke      bigint,                      -- số trên bảng kê NCC = giá vốn
  ledger       bigint,                      -- số trên bảng kê khách hàng (hệ thống)
  khop         text,                        -- Khớp / Lệch tiền / Thiếu trong hệ thống / Trùng (đã đối soát)
  xu_ly        text,
  mo_ta        text,
  dong         text,                        -- dòng trên bảng kê NCC
  file_name    text,
  uploaded_at  timestamptz not null default now()
);
create index if not exists fin_src_ncc_file_idx on fin_src_ncc (file_key);

alter table fin_src_kh  enable row level security;
alter table fin_src_ncc enable row level security;
