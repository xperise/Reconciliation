-- =====================================================================
-- 18_dashboard_them_dong.sql — Thêm dòng mới ở các bảng cập nhật trực tiếp
-- Chạy SAU 17_dashboard_nhap_tay.sql. Supabase → SQL Editor → Run.
-- Chạy lại nhiều lần không mất dữ liệu.
-- =====================================================================

-- Khi file template có số cho cùng ô, bên nào thắng?
--   'file' (mặc định) — số trong file ghi đè số nhập tay. Dùng cho những ô
--                       nhập tạm trong lúc chờ kế toán lên file.
--   'tay'             — số nhập trên web thắng, kể cả khi file có số.
alter table fin_manual add column if not exists uu_tien text not null default 'file';

-- Cho phép nhóm 'dm': khai nhanh một khách hàng / nhà cung cấp chưa có trong
-- danh mục, để thêm được dòng công nợ cho đối tượng mới ngay trên web.
--   nhom='dm', ky='DM', khoa='kh|<mã>' hoặc 'ncc|<mã>', ghi_chu = tên đối tượng.
