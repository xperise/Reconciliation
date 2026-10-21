-- =====================================================================
-- 21_dashboard_the_xpay.sql — Thẻ XPAY & thông tin doanh nghiệp (Dashboard Mobility)
-- Chạy SAU 19_dashboard_mobility.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không mất dữ liệu.
--
--   · mob_company: mỗi pháp nhân (số hợp đồng) 1 dòng — MST, địa chỉ, email doanh nghiệp.
--   · mob_card:    mỗi thẻ 1 dòng, nhận diện bằng UID. Số thẻ và pantoken lưu ĐÃ MÃ HOÁ
--                  (AES-256-GCM, khoá MOB_CARD_KEY trên Vercel — không nằm trong database).
--   · KHÔNG lưu mã PIN và password email.
-- Chỉ API phía server (service role) đọc/ghi; trình duyệt không truy cập trực tiếp.
-- =====================================================================

create table if not exists mob_company (
  key         text primary key,            -- số hợp đồng (cùng mã dùng ở tab Tiến độ khách hàng)
  mst         text,
  address     text,
  email       text,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists mob_card (
  uid              text primary key,
  key              text not null,          -- số hợp đồng của doanh nghiệp sở hữu thẻ
  company_on_card  text,
  holder           text,
  pan_enc          text,                   -- số thẻ đã mã hoá
  pan_last4        text,                   -- 4 số cuối để hiển thị dạng che
  pantoken_enc     text,                   -- pantoken (mã QR) đã mã hoá
  expiry           text,                   -- MM/YY
  monthly_limit    bigint,
  balance          bigint,
  balance_date     date,
  updated_at       timestamptz not null default now(),
  updated_by       text
);
create index if not exists mob_card_key_idx on mob_card (key);

alter table mob_company enable row level security;
alter table mob_card    enable row level security;
