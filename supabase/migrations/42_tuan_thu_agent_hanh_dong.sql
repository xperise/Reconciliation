-- =====================================================================
-- 42_tuan_thu_agent_hanh_dong.sql — Làm việc qua agent (như Cowork)
--   Head nhắn cho agent; agent đọc dữ liệu và ĐỀ XUẤT thao tác (sửa ô bảng kê, ghi giải trình,
--   xác nhận ô app tự sửa, duyệt, trả về, chặn, gỡ chặn, đề xuất / duyệt sửa đổi quy tắc, chốt quy tắc,
--   bổ sung skill). Mỗi thao tác hiện thành thẻ trong chat; người bấm "Thực hiện" thì mới chạy,
--   bằng đúng quyền của người đó. Mọi thao tác ghi nhật ký.
-- Chạy SAU 41_tuan_thu_hop_dong_day_du.sql.
-- =====================================================================

create table if not exists tt_hanh_dong (
  id           bigserial primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  phong_ban    text not null,
  lan_chay_id  uuid references tt_lan_chay(id) on delete cascade,
  cong_cu      text not null,
  tham_so      jsonb not null default '{}',
  mo_ta        text not null,
  trang_thai   text not null default 'cho' check (trang_thai in ('cho','da_lam','bo_qua','loi')),
  ket_qua      text,
  luc          timestamptz not null default now(),
  xu_ly_luc    timestamptz
);
create index if not exists tt_hanh_dong_user_idx on tt_hanh_dong (user_id, trang_thai);

alter table tt_chat add column if not exists hanh_dong_ids bigint[];

-- Sửa tay từng ô của bảng kê (qua agent). Áp sau khi đọc raw, trước khi app tự sửa theo quy tắc.
create table if not exists tt_sua_tay (
  id           bigserial primary key,
  lan_chay_id  uuid not null references tt_lan_chay(id) on delete cascade,
  loai         text not null check (loai in ('khach_san','ve_may_bay')),
  dong         int not null,
  cot          text not null,
  gia_tri_cu   text,
  gia_tri_moi  text,
  ly_do        text not null,
  nguoi        uuid references profiles(id),
  nguoi_email  text,
  luc          timestamptz not null default now()
);
create index if not exists tt_sua_tay_lan_idx on tt_sua_tay (lan_chay_id);

alter table tt_hanh_dong enable row level security;
alter table tt_sua_tay   enable row level security;
