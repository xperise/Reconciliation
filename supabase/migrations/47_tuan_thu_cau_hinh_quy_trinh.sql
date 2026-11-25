-- =====================================================================
-- 47_tuan_thu_cau_hinh_quy_trinh.sql — Pha 1 (khai báo dữ liệu, chưa đổi hành vi)
--   Thêm bảng role và bước quy trình, seed đúng cấu hình VCB hiện tại.
--   Thêm cột phiên bản quy trình trên lần chạy (mặc định 1 = cấu hình seed).
--   Additive: không xoá, không đổi kiểu cột cũ. Runtime chưa đọc các bảng này.
-- Chạy SAU 46_tuan_thu_mau_bang_ke.sql.
-- =====================================================================

create table if not exists tt_role (
  key        text primary key,
  ten        text not null,
  thu_tu     int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists tt_buoc_quy_trinh (
  key        text primary key,
  thu_tu     int  not null,
  role_key   text not null references tt_role(key),
  mode       text not null default 'any' check (mode in ('any','all','quorum')),
  ket_qua    text[] not null check (array_length(ket_qua, 1) >= 1),
  created_at timestamptz not null default now()
);

alter table tt_role enable row level security;
alter table tt_buoc_quy_trinh enable row level security;

insert into tt_role (key, ten, thu_tu) values
  ('ke_toan', 'Kế toán', 1),
  ('demand',  'Demand',  2),
  ('supply',  'Supply',  2),
  ('ceo',     'CEO',     3)
on conflict (key) do nothing;

insert into tt_buoc_quy_trinh (key, thu_tu, role_key, mode, ket_qua) values
  ('ke_toan_duyet',    1, 'ke_toan', 'any', array['duyet','tra_ve']),
  ('demand_kiem_soat', 2, 'demand',  'any', array['chan','tra_ve']),
  ('supply_kiem_soat', 2, 'supply',  'any', array['chan','tra_ve']),
  ('ceo_duyet',        3, 'ceo',     'any', array['duyet','tra_ve'])
on conflict (key) do nothing;

alter table tt_lan_chay add column if not exists quy_trinh_phien_ban int not null default 1;
