-- =====================================================================
-- 50_tuan_thu_nen_to_chuc.sql — Nền tảng nhiều tổ chức (bước 1a, chưa đổi hành vi)
--   • Tạo bảng tt_to_chuc và một tổ chức mặc định cho dữ liệu hiện có.
--   • Thêm cột org_id (mặc định = tổ chức mặc định) vào mọi bảng tt_*.
--   • Additive: không xoá, không đổi kiểu cột cũ. Code hiện tại không đọc org_id.
--   Bước sau: lọc mọi truy vấn theo org_id, rồi bật RLS theo tổ chức.
-- Chạy SAU 49_tuan_thu_ma_role_chuan.sql.
-- =====================================================================

create table if not exists tt_to_chuc (
  id         uuid primary key,
  ten        text not null,
  created_at timestamptz not null default now()
);

insert into tt_to_chuc (id, ten)
values ('00000000-0000-0000-0000-000000000001', 'Tổ chức mặc định (dữ liệu hiện có)')
on conflict (id) do nothing;

alter table tt_to_chuc enable row level security;

alter table if exists tt_ai_ket_qua add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_ai_ket_qua_org_id_idx on tt_ai_ket_qua (org_id);
alter table if exists tt_bo_quy_tac add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_bo_quy_tac_org_id_idx on tt_bo_quy_tac (org_id);
alter table if exists tt_buoc_quy_trinh add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_buoc_quy_trinh_org_id_idx on tt_buoc_quy_trinh (org_id);
alter table if exists tt_canh_bao add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_canh_bao_org_id_idx on tt_canh_bao (org_id);
alter table if exists tt_chan add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_chan_org_id_idx on tt_chan (org_id);
alter table if exists tt_chat add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_chat_org_id_idx on tt_chat (org_id);
alter table if exists tt_duyet add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_duyet_org_id_idx on tt_duyet (org_id);
alter table if exists tt_hanh_dong add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_hanh_dong_org_id_idx on tt_hanh_dong (org_id);
alter table if exists tt_hop_dong add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_hop_dong_org_id_idx on tt_hop_dong (org_id);
alter table if exists tt_lan_chay add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_lan_chay_org_id_idx on tt_lan_chay (org_id);
alter table if exists tt_mau_bang_ke add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_mau_bang_ke_org_id_idx on tt_mau_bang_ke (org_id);
alter table if exists tt_phong_ban_khach add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_phong_ban_khach_org_id_idx on tt_phong_ban_khach (org_id);
alter table if exists tt_quy_tac add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_quy_tac_org_id_idx on tt_quy_tac (org_id);
alter table if exists tt_role add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_role_org_id_idx on tt_role (org_id);
alter table if exists tt_skill add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_skill_org_id_idx on tt_skill (org_id);
alter table if exists tt_skill_goi_y add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_skill_goi_y_org_id_idx on tt_skill_goi_y (org_id);
alter table if exists tt_sua_doi add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_sua_doi_org_id_idx on tt_sua_doi (org_id);
alter table if exists tt_sua_doi_duyet add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_sua_doi_duyet_org_id_idx on tt_sua_doi_duyet (org_id);
alter table if exists tt_sua_tay add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_sua_tay_org_id_idx on tt_sua_tay (org_id);
alter table if exists tt_tep_lan_chay add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_tep_lan_chay_org_id_idx on tt_tep_lan_chay (org_id);
alter table if exists tt_thanh_vien add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_thanh_vien_org_id_idx on tt_thanh_vien (org_id);
alter table if exists tt_thay_doi add column if not exists org_id uuid not null default '00000000-0000-0000-0000-000000000001' references tt_to_chuc(id);
create index if not exists tt_thay_doi_org_id_idx on tt_thay_doi (org_id);
