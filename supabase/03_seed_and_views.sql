-- =====================================================================
-- 03_seed_and_views.sql — dữ liệu khởi tạo & view báo cáo
-- =====================================================================

-- ---- Bốn workflow, mặc định TẮT để bạn kiểm thử trước khi bật ----
insert into workflow_schedules (key, ten, mo_ta, enabled, schedule_kind, run_at_hhmm, interval_minutes) values
  ('wf1', 'Gửi bảng kê',
   'Mỗi sáng, tìm khách đến hạn gửi bảng kê, lấy file trên Drive và gửi email cho đầu mối khách hàng.',
   false, 'daily', '08:00', null),
  ('wf2', 'Nhận phản hồi khách',
   'Đọc hộp thư, nhận diện email khách trả lời vào thread bảng kê, để AI phân loại rồi chuyển kế toán duyệt.',
   false, 'interval', null, 1),
  ('wf3', 'Gửi tệp đã tải lên',
   'Quét các tệp kế toán đã tải lên website nhưng chưa gửi, rồi gửi cho khách. Chạy như lưới an toàn cho những lần gửi ngay bị lỗi.',
   false, 'interval', null, 5),
  ('wf4', 'Theo dõi hạn phản hồi',
   'Mỗi sáng, kiểm tra khách nào quá hạn để nhắc theo cấp escalate, và nhắc nội bộ khi kế toán upload chậm.',
   false, 'daily', '08:30', null)
on conflict (key) do nothing;

-- ---- Giá trị mặc định cho SLA nội bộ (sheet 3.2) ----
insert into app_settings (key, value) values
  ('sla_noi_bo', '{
     "nhac_lan_1_sau_ngay": 1,
     "escalate_sau_ngay": 2,
     "sla_upload_v2_ngay": 2,
     "sla_upload_hstt_ngay": 2
   }'::jsonb),
  ('email', '{
     "from_name": "xperise",
     "reply_to": "cs@uts.network",
     "logo_url": "https://files.uts.network/email_assets/xperise_alt_fulllogo%402x.png"
   }'::jsonb)
on conflict (key) do nothing;

-- =====================================================================
-- VIEW BÁO CÁO
-- =====================================================================

-- Tỷ lệ đúng hạn của khách hàng theo kỳ
create or replace view v_sla_khach_hang as
select
  t.ky_doi_soat,
  t.ten_nhom,
  t.ma_he_thong,
  t.status,
  t.han_chap_nhan,
  t.ngay_chot,
  t.escalate_level,
  t.so_vong_remind,
  case
    when t.ngay_chot is null and t.han_chap_nhan < current_date then 'qua_han'
    when t.ngay_chot is null                                    then 'dang_cho'
    when t.ngay_chot <= t.han_chap_nhan                         then 'dung_han'
    else 'tre_han'
  end as ket_qua_sla,
  case when t.ngay_chot is not null
       then t.ngay_chot - t.han_chap_nhan end as so_ngay_lech
from tracking t;

-- Khách chưa chốt, sắp xếp theo mức độ trễ
create or replace view v_khach_chua_chot as
select
  t.id,
  t.ten_nhom,
  t.ma_he_thong,
  t.ky_doi_soat,
  t.status,
  t.han_chap_nhan,
  current_date - t.han_chap_nhan as so_ngay_tre,
  t.escalate_level,
  t.so_vong_remind,
  c.nhom_escalate,
  c.email_l1,
  c.email_ke_toan
from tracking t
join billing_groups c on c.id = t.group_id
where t.status not in ('da_chot', 'hoan_tat_cho_thanh_toan',
                       'mac_dinh_chap_thuan', 'da_gui_ho_so_thanh_toan')
order by (current_date - t.han_chap_nhan) desc nulls last;

-- Thời gian trung bình nội bộ dừng ở mỗi trạng thái (tìm nút thắt cổ chai)
create or replace view v_thoi_gian_trung_binh_trang_thai as
select
  status_cu as trang_thai,
  count(*)                              as so_lan,
  round(avg(gio_o_status_cu), 1)        as gio_trung_binh,
  round(max(gio_o_status_cu), 1)        as gio_lau_nhat
from status_log
where status_cu is not null and gio_o_status_cu is not null
group by status_cu
order by avg(gio_o_status_cu) desc;
