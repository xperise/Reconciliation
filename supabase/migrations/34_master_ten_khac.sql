-- =====================================================================
-- 34_master_ten_khac.sql — Tên gọi khác của pháp nhân trên các hệ thống (11/2026)
-- Chạy SAU 33_master_pm.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- Một pháp nhân có thể mang tên khác trên hệ thống đặt chỗ / sổ phải thu (vd. Sao Thủy = Masterise, Techcombank).
-- Dashboard gộp mọi tên trong cột này về đúng pháp nhân khi dựng GMV và đọc sổ phải thu.
-- =====================================================================
alter table customers add column if not exists ten_khac text;
