-- =====================================================================
-- 60_tuan_thu_quorum_theo_loai.sql — Quorum sửa đổi theo loại thay đổi
--   • tt_quorum_loai: với mỗi loại thay đổi, những bước nào tham gia quorum.
--   • tt_sua_doi.loai: loại của đề xuất. Đề xuất cũ = 'dieu_khoan_tien' (tham gia mọi bước, như trước).
--   • Seed 4 loại mặc định, mỗi loại tham gia đủ 4 bước mặc định → hành vi không đổi.
-- Chạy SAU 59_tuan_thu_quorum_theo_buoc.sql.
-- =====================================================================

create table if not exists tt_quorum_loai (
  org_id    uuid not null references tt_to_chuc(id),
  loai      text not null,
  ten       text not null,
  buoc_keys text[] not null default '{}',
  primary key (org_id, loai)
);

alter table tt_quorum_loai enable row level security;
drop policy if exists tt_quorum_loai_org on tt_quorum_loai;
create policy tt_quorum_loai_org on tt_quorum_loai
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

alter table tt_sua_doi add column if not exists loai text not null default 'dieu_khoan_tien';

insert into tt_quorum_loai (org_id, loai, ten, buoc_keys) values
  ('00000000-0000-0000-0000-000000000001', 'dieu_khoan_tien', 'Điều khoản tiền (chiết khấu, phí)', array['ke_toan_duyet','demand_kiem_soat','supply_kiem_soat','ceo_duyet']),
  ('00000000-0000-0000-0000-000000000001', 'dinh_muc',        'Định mức',                          array['ke_toan_duyet','demand_kiem_soat','supply_kiem_soat','ceo_duyet']),
  ('00000000-0000-0000-0000-000000000001', 'ky_thanh_toan',   'Kỳ thanh toán',                     array['ke_toan_duyet','demand_kiem_soat','supply_kiem_soat','ceo_duyet']),
  ('00000000-0000-0000-0000-000000000001', 'mo_ta',           'Mô tả, diễn đạt (không đổi số)',    array['ke_toan_duyet','demand_kiem_soat','supply_kiem_soat','ceo_duyet'])
on conflict (org_id, loai) do nothing;
