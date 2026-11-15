-- =====================================================================
-- 32_dashboard_da_gui_bk.sql — Đánh dấu "đã gửi bảng kê" không kèm ngày (11/2026)
-- Chạy SAU 31_dashboard_be.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- Nút "Đánh dấu đã gửi bảng kê" chỉ bật cờ này; ngày gửi thực tế nhập tay ở bảng "Bảng kê & tiền thu".
-- =====================================================================
alter table fin_ar_edit add column if not exists da_gui_bk boolean not null default false;

-- Nếu đã bấm nút bản trước (ghi sẵn ngày gửi = ngày hóa đơn sớm nhất / đầu tháng sau kỳ):
-- đổi các ngày ghi sẵn đó thành cờ "đã gửi", bỏ ngày. Ngày nhập tay khác quy tắc trên giữ nguyên.
update fin_ar_edit e
   set da_gui_bk = true, ngay_gui_bk = null
 where e.so_ct = '' and e.tu_tao = false and e.ngay_gui_bk is not null
   and e.updated_at >= '2026-11-15'
   and e.ngay_gui_bk = coalesce(
         (select min(a.ngay_hd) from fin_ar a where a.ma_kh = e.ma_kh and a.ky = e.ky),
         (make_date(substr(e.ky, 5, 4)::int, substr(e.ky, 2, 2)::int, 1) + interval '1 month')::date);
