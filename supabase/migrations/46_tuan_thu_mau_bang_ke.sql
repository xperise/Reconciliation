-- =====================================================================
-- 46_tuan_thu_mau_bang_ke.sql
--   1) Mẫu bảng kê riêng từng khách: agent/kế toán upload một bảng kê khách đã nhận → app học cấu trúc
--      (sheet, tiêu đề, cột, dòng tổng, chân trang, danh sách phòng ban) → kế toán duyệt → lần chạy từ raw
--      của khách đó dựng đúng mẫu.
--   2) Lịch sử file của lần chạy (mỗi lần kế toán tải lại bảng kê / raw đều giữ lại).
-- Chạy SAU 45_tuan_thu_bang_ke_da_format.sql.
-- =====================================================================

create table if not exists tt_mau_bang_ke (
  id           uuid primary key default gen_random_uuid(),
  ma_khach     text not null,
  phien_ban    int not null,
  ten_tep      text not null,
  path         text not null,
  cau_truc     jsonb not null,
  trang_thai   text not null default 'cho_duyet' check (trang_thai in ('cho_duyet','hieu_luc','thay_the')),
  tao_boi      uuid references profiles(id),
  duyet_boi    uuid references profiles(id),
  luc          timestamptz not null default now(),
  duyet_luc    timestamptz,
  unique (ma_khach, phien_ban)
);

create table if not exists tt_tep_lan_chay (
  id           bigserial primary key,
  lan_chay_id  uuid not null references tt_lan_chay(id) on delete cascade,
  vong         int not null,
  loai         text not null check (loai in ('raw','bk_upload','bk_app','bk_sua')),
  path         text not null,
  ten          text,
  nguoi_email  text,
  luc          timestamptz not null default now()
);
create index if not exists tt_tep_lan_chay_idx on tt_tep_lan_chay (lan_chay_id, vong);

alter table tt_lan_chay add column if not exists mau_id uuid references tt_mau_bang_ke(id);

alter table tt_mau_bang_ke  enable row level security;
alter table tt_tep_lan_chay enable row level security;
