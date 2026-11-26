-- =====================================================================
-- 53_tuan_thu_quyen_va_bao_cao_ceo.sql — Vai trò, phân quyền, báo cáo CEO
--   • CEO là CHỨC VỤ (tt_thanh_vien.phong_ban = 'ceo'). Quyền bổ sung được gán riêng ở đây.
--   • tt_quyen: người được cấp thêm quyền trong một tổ chức.
--       quan_tri        : làm thay mọi phòng (như Admin)
--       kich_hoat       : kích hoạt hợp đồng (ngoài role đã có)
--       xem_bao_cao     : xem tổng quan CEO
--   • Additive. Không đổi dữ liệu cũ.
-- Chạy SAU 52_tuan_thu_rls_theo_to_chuc.sql.
-- =====================================================================

create table if not exists tt_quyen (
  user_id    uuid not null,
  org_id     uuid not null references tt_to_chuc(id),
  quyen      text not null check (quyen in ('quan_tri','kich_hoat','xem_bao_cao')),
  cap_boi    uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id, quyen)
);

create index if not exists tt_quyen_org_idx on tt_quyen (org_id);
alter table tt_quyen enable row level security;

drop policy if exists tt_quyen_org on tt_quyen;
create policy tt_quyen_org on tt_quyen
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));
