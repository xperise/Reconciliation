-- =====================================================================
-- 43_tuan_thu_them_hop_dong.sql — Thêm hợp đồng / khách mới ngay trên app
--   Upload PDF hợp đồng + phụ lục → agent đọc: tóm tắt điều khoản, tham số máy, câu hỏi còn mở;
--   agent của từng phòng rút quy tắc theo scope → 4 head chốt → kích hoạt → chạy bảng kê.
--   Một khách có nhiều hợp đồng (gia hạn, hợp đồng mới): lần chạy chọn đúng hợp đồng.
-- Chạy SAU 42_tuan_thu_agent_hanh_dong.sql. Chạy lại nhiều lần không mất dữ liệu.
-- =====================================================================

alter table tt_hop_dong add column if not exists trang_thai text not null default 'hieu_luc';
alter table tt_hop_dong drop constraint if exists tt_hop_dong_trang_thai_check;
alter table tt_hop_dong add constraint tt_hop_dong_trang_thai_check
  check (trang_thai in ('dang_doc','cho_chot','hieu_luc','het_hieu_luc','loi'));
alter table tt_hop_dong add column if not exists ten_cong_ty_raw text;   -- tên ở cột "Tên công ty" của raw
alter table tt_hop_dong add column if not exists tep_hop_dong jsonb not null default '[]';  -- [{path, ten}]
alter table tt_hop_dong add column if not exists cau_hoi_mo jsonb;      -- điểm hợp đồng chưa rõ, agent nêu khi đọc
alter table tt_hop_dong add column if not exists loi_doc text;
alter table tt_hop_dong add column if not exists tao_boi uuid references profiles(id);
alter table tt_hop_dong add column if not exists hieu_luc_tu text;      -- 'YYYY-MM': tháng bắt đầu áp dụng bộ quy tắc v1

-- Một khách nhiều hợp đồng
alter table tt_hop_dong drop constraint if exists tt_hop_dong_ma_khach_key;
create unique index if not exists tt_hop_dong_khach_so_uq on tt_hop_dong (ma_khach, so_hop_dong);

update tt_hop_dong set ten_cong_ty_raw = 'VIETCOMBANK' where ma_khach = 'VCB' and ten_cong_ty_raw is null;
