-- =====================================================================
-- 62_tuan_thu_nhat_ky_lan_chay.sql — Nhật ký của từng lần chạy
--   • Ghi các sự kiện đọc được trong lần chạy: bước bị bỏ qua (kèm lý do), chuyển nhóm, gửi.
--   • Additive. Lần chạy cũ không có nhật ký thì trang chỉ hiện trống.
-- Chạy SAU 61_tuan_thu_yeu_cau_duyet_chay_khi.sql.
-- =====================================================================

create table if not exists tt_nhat_ky_lan_chay (
  id          bigserial primary key,
  org_id      uuid not null references tt_to_chuc(id),
  lan_chay_id uuid not null references tt_lan_chay(id) on delete cascade,
  vong        int,
  loai        text not null,
  noi_dung    text not null,
  nguoi_email text,
  luc         timestamptz not null default now()
);

create index if not exists tt_nhat_ky_lan_chay_idx on tt_nhat_ky_lan_chay (lan_chay_id, luc);
alter table tt_nhat_ky_lan_chay enable row level security;

drop policy if exists tt_nhat_ky_lan_chay_org on tt_nhat_ky_lan_chay;
create policy tt_nhat_ky_lan_chay_org on tt_nhat_ky_lan_chay
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));
