-- =====================================================================
-- 64_tuan_thu_thu_vien_hub.sql — Thư viện mẫu Cấp 1, 2, 3 và hub template
--   • tt_hub_mau: mẫu quy trình dùng chung. Chỉ chứa cấu trúc (role, bước, quyền, điều kiện),
--     không chứa người, email, mã khách, số tiền, hợp đồng.
--   • nguon: 'he_thong' (3 mẫu chuẩn do nền tảng cung cấp) hoặc 'hub' (tổ chức công bố).
--   • Ai đọc được: mọi người đăng nhập (để nhân bản). Ai ghi: chỉ qua hàm của ứng dụng (service role).
-- Chạy SAU 63_tuan_thu_tu_gui_theo_khach.sql.
-- =====================================================================

create table if not exists tt_hub_mau (
  id         uuid primary key default gen_random_uuid(),
  ma         text not null unique,
  ten        text not null,
  mo_ta      text not null default '',
  cap        text not null check (cap in ('cap1','cap2','cap3','tu_mo_ta')),
  nguon      text not null check (nguon in ('he_thong','hub')) default 'hub',
  cau_truc   jsonb not null,
  cong_bo_luc timestamptz not null default now(),
  kiem_dinh  boolean not null default false
);

alter table tt_hub_mau enable row level security;
drop policy if exists tt_hub_mau_doc on tt_hub_mau;
create policy tt_hub_mau_doc on tt_hub_mau for select to authenticated using (true);

insert into tt_hub_mau (ma, ten, mo_ta, cap, nguon, kiem_dinh, cau_truc) values
('cap1', 'Cấp 1 · Gọn', 'Kế toán làm chuẩn bị, CEO duyệt trực tiếp. Dành cho 1–3 người, 1–3 khách.', 'cap1', 'he_thong', true,
 '{"roles":[{"key":"ke_toan","ten":"Kế toán","kichHoat":false},{"key":"ceo","ten":"CEO","kichHoat":true}],
   "buoc":[
     {"key":"ke_toan_duyet","nhom":1,"roleKey":"ke_toan","che_do":"any","ketQua":["duyet","tra_ve"],"yeuCauDuyet":true,"chayKhi":"luon","suaDoi":true},
     {"key":"ceo_duyet","nhom":2,"roleKey":"ceo","che_do":"any","ketQua":["duyet","tra_ve"],"yeuCauDuyet":true,"chayKhi":"luon","suaDoi":true}]}'::jsonb),
('cap2', 'Cấp 2 · Chuẩn', 'Kế toán duyệt; Demand và Supply kiểm soát song song (chỉ chặn hoặc trả về); CEO duyệt cuối. Dành cho 4–10 người, 2–4 phòng.', 'cap2', 'he_thong', true,
 '{"roles":[{"key":"ke_toan","ten":"Kế toán","kichHoat":false},{"key":"demand","ten":"Demand","kichHoat":false},{"key":"supply","ten":"Supply","kichHoat":false},{"key":"ceo","ten":"CEO","kichHoat":true}],
   "buoc":[
     {"key":"ke_toan_duyet","nhom":1,"roleKey":"ke_toan","che_do":"any","ketQua":["duyet","tra_ve"],"yeuCauDuyet":true,"chayKhi":"luon","suaDoi":true},
     {"key":"demand_kiem_soat","nhom":2,"roleKey":"demand","che_do":"any","ketQua":["chan","tra_ve"],"yeuCauDuyet":false,"chayKhi":"luon","suaDoi":true},
     {"key":"supply_kiem_soat","nhom":2,"roleKey":"supply","che_do":"any","ketQua":["chan","tra_ve"],"yeuCauDuyet":false,"chayKhi":"luon","suaDoi":true},
     {"key":"ceo_duyet","nhom":3,"roleKey":"ceo","che_do":"any","ketQua":["duyet","tra_ve"],"yeuCauDuyet":true,"chayKhi":"luon","suaDoi":true}]}'::jsonb),
('cap3', 'Cấp 3 · Đa phòng', 'Nhiều phòng và khối; bước điều phối và mua sắm song song; ban giám đốc chỉ duyệt khi vượt ngưỡng. Dành cho 10 người trở lên, nhiều chi nhánh.', 'cap3', 'he_thong', true,
 '{"roles":[{"key":"ke_toan","ten":"Kế toán","kichHoat":false},{"key":"dieu_phoi","ten":"Điều phối","kichHoat":false},{"key":"mua_sam","ten":"Mua sắm","kichHoat":false},{"key":"ban_giam_doc","ten":"Ban giám đốc","kichHoat":true}],
   "buoc":[
     {"key":"ke_toan_duyet","nhom":1,"roleKey":"ke_toan","che_do":"any","ketQua":["duyet","tra_ve"],"yeuCauDuyet":true,"chayKhi":"luon","suaDoi":true},
     {"key":"dieu_phoi_duyet","nhom":2,"roleKey":"dieu_phoi","che_do":"any","ketQua":["duyet","tra_ve","chan"],"yeuCauDuyet":true,"chayKhi":"luon","suaDoi":true},
     {"key":"mua_sam_duyet","nhom":2,"roleKey":"mua_sam","che_do":"any","ketQua":["duyet","tra_ve","chan"],"yeuCauDuyet":true,"chayKhi":"luon","suaDoi":true},
     {"key":"ban_giam_doc_duyet","nhom":3,"roleKey":"ban_giam_doc","che_do":"any","ketQua":["duyet","tra_ve"],"yeuCauDuyet":true,"chayKhi":"vuot_nguong","suaDoi":true}]}'::jsonb)
on conflict (ma) do nothing;
