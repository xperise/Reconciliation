-- =====================================================================
-- 61_tuan_thu_yeu_cau_duyet_chay_khi.sql — Customize từ đầu đến cuối cho từng bước
--   • yeu_cau_duyet: bước có yêu cầu duyệt không. Mặc định true (như hiện tại).
--   • chay_khi: bước chạy khi nào: luon | canh_bao_chan | vuot_nguong | ngoai_le. Mặc định luon.
--   • tt_hop_dong.nguong_tien: ngưỡng tiền của khách, dùng cho "vượt ngưỡng". Để trống = chưa đặt.
--   • Additive. Cấu hình hiện có giữ nguyên hành vi (mọi bước luôn chạy và có duyệt).
-- Chạy SAU 60_tuan_thu_quorum_theo_loai.sql.
-- =====================================================================

alter table tt_buoc_quy_trinh add column if not exists yeu_cau_duyet boolean not null default true;
alter table tt_buoc_quy_trinh add column if not exists chay_khi text not null default 'luon';
alter table tt_buoc_quy_trinh drop constraint if exists tt_buoc_quy_trinh_chay_khi_check;
alter table tt_buoc_quy_trinh add constraint tt_buoc_quy_trinh_chay_khi_check
  check (chay_khi in ('luon','canh_bao_chan','vuot_nguong','ngoai_le'));

alter table tt_hop_dong add column if not exists nguong_tien numeric null;
