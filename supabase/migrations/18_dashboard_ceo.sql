-- =====================================================================
-- 18_dashboard_ceo.sql — Tham số cho tab Góc nhìn CEO và Xu hướng
-- Chạy SAU 17_dashboard_nhap_tay.sql. Supabase → SQL Editor → Run.
-- Chạy lại nhiều lần không mất dữ liệu, không ghi đè giá trị đã có.
--
-- Không tạo bảng mới. Mọi phần mới đều tính từ dữ liệu đã có:
--   · Dòng thêm tay (khách mới, kỳ mới, khoản chi phí / dòng tiền mới, GMV theo khách)
--     ghi vào các bảng sẵn có fin_ar_edit, fin_ap_edit, fin_manual, fin_customers,
--     fin_suppliers.
--   · Upload file của kỳ nào thì số trong file ghi đè số nhập tay của kỳ đó (xử lý
--     trong code, không cần đổi cấu trúc bảng).
--
-- File này chỉ thêm các tham số mặc định vào fin_params để thấy và sửa được.
-- Không chạy file này web vẫn chạy bình thường với đúng các giá trị mặc định dưới đây.
-- Muốn đổi: sửa cột value trong bảng fin_params, hoặc khai cùng mã trong sheet THAM_SO.
-- =====================================================================

insert into fin_params (key, value, note) values
  ('lai_suat_von_nam',  '10%', 'Chi phí vốn khi công ty tự ứng tiền cho khách (thu chậm hơn trả NCC), %/năm. Dùng tính lợi nhuận ròng theo khách.'),
  ('cts_phan_bo',       'gmv', 'Cách chia chi phí vận hành (trừ Marketing) về từng khách: gmv = theo tỷ trọng GMV · khach = chia đều mỗi khách active · tron = một nửa mỗi cách.'),
  ('ltv_thang_toi_da',  '36',  'Vòng đời tối đa của một khách (tháng) khi tỷ lệ rời bỏ gần bằng 0. Dùng tính LTV.'),
  ('cac_so_thang',      '3',   'Số tháng gần nhất dùng tính CAC và đóng góp bình quân một khách.'),
  ('tl_luong_sales',    '',    'Phần Lương & nhân sự tính vào chi phí thu hút khách (VD 25%). Để trống = tự tính bằng số người team Sales / tổng DM_NHAN_SU.'),
  ('credit_term_chuan', '30',  'Credit term chuẩn (ngày). Khách được cho dài hơn bị coi là điều khoản lỏng khi phân tích nguyên nhân thu chậm.'),
  ('ngay_tre_gui_bk',   '5',   'Gửi bảng kê muộn hơn số ngày này sau cuối kỳ thì coi là gửi trễ (nguyên nhân nội bộ của thu chậm).')
on conflict (key) do nothing;
