-- =====================================================================
-- 39_tuan_thu_agent.sql — Agent AI cho phần Tuân thủ bảng kê
-- Chạy SAU 38_tuan_thu.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không mất dữ liệu.
--
-- Cần thêm biến môi trường trên Vercel: ANTHROPIC_API_KEY (bắt buộc), ANTHROPIC_MODEL (tùy chọn,
-- mặc định claude-sonnet-5-5). Thiếu key thì mọi nút agent AI báo lỗi rõ, luồng duyệt vẫn chạy.
-- =====================================================================

-- Skill của từng phòng ban, có phiên bản. Bản mới nhất là bản đang dùng.
create table if not exists tt_skill (
  id          bigserial primary key,
  phong_ban   text not null check (phong_ban in ('ke_toan','supply','demand','ceo')),
  phien_ban   int not null,
  noi_dung    text not null,
  ly_do       text,
  tao_boi     uuid references profiles(id),
  luc         timestamptz not null default now(),
  unique (phong_ban, phien_ban)
);

-- Gợi ý bổ sung skill sinh ra khi head duyệt khác đề xuất của agent (học từ quyết định)
create table if not exists tt_skill_goi_y (
  id           bigserial primary key,
  phong_ban    text not null,
  noi_dung     text not null,
  nguon        text,
  lan_chay_id  uuid references tt_lan_chay(id) on delete set null,
  trang_thai   text not null default 'cho' check (trang_thai in ('cho','da_nhan','bo_qua')),
  xu_ly_boi    uuid references profiles(id),
  luc          timestamptz not null default now()
);

-- Lịch sử chat với agent (theo người, theo phòng ban, theo lần chạy hoặc chung)
create table if not exists tt_chat (
  id           bigserial primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  phong_ban    text not null,
  lan_chay_id  uuid references tt_lan_chay(id) on delete cascade,
  vai          text not null check (vai in ('user','assistant')),
  noi_dung     text not null,
  luc          timestamptz not null default now()
);
create index if not exists tt_chat_idx on tt_chat (user_id, phong_ban, lan_chay_id, luc);

-- Kết quả agent AI: rà soát một bước, phân tích tác động sửa đổi, gợi ý giải trình
create table if not exists tt_ai_ket_qua (
  id           bigserial primary key,
  loai         text not null check (loai in ('ra_soat','tac_dong','goi_y_giai_trinh')),
  phong_ban    text not null,
  lan_chay_id  uuid references tt_lan_chay(id) on delete cascade,
  vong         int,
  sua_doi_id   uuid references tt_sua_doi(id) on delete cascade,
  skill_phien_ban int,
  noi_dung     text not null,
  model        text,
  nguoi        uuid references profiles(id),
  luc          timestamptz not null default now()
);
create index if not exists tt_ai_kq_lan_idx on tt_ai_ket_qua (lan_chay_id, vong);
create index if not exists tt_ai_kq_sd_idx on tt_ai_ket_qua (sua_doi_id);

alter table tt_duyet add column if not exists skill_phien_ban int;

alter table tt_skill        enable row level security;
alter table tt_skill_goi_y  enable row level security;
alter table tt_chat         enable row level security;
alter table tt_ai_ket_qua   enable row level security;

insert into tt_skill (phong_ban, phien_ban, noi_dung, ly_do) values
  ('ke_toan', 1, 'Bạn là agent Kế toán của Xperise, phụ trách kiểm bảng kê gửi khách trong scope kế toán.
- Chiết khấu và phí dịch vụ phải đúng bảng quy tắc hợp đồng (VCB: chiết khấu = 0, phí dịch vụ = 0). Lệch là lỗi chặn gửi; app được tự sửa nhưng kế toán phải xác nhận.
- Thành tiền chưa VAT + VAT = thành tiền đã VAT; Tổng thành tiền = thành tiền − chiết khấu + phí.
- Raw và bảng kê phải khớp từng mã giao dịch: không thiếu, không thừa, không trùng y hệt. Cặp đặt (+) / hủy (−) là hợp lệ.
- Dòng có tiền phải có số hóa đơn; dòng trống phòng ban phải giải trình.
- Header: tên, MST, địa chỉ hai bên và tài khoản nhận tiền đúng hợp đồng.', 'Bản đầu'),
  ('demand', 1, 'Bạn là agent Demand (khách hàng) của Xperise.
- Định mức tiền phòng theo PL02 hợp đồng VCB: theo chức danh × nhóm địa bàn PL2b; vượt định mức phải có tờ trình phê duyệt trước, nếu không VCB không thanh toán phần vượt (Đ6.2).
- Hạn mức mua sắm 3 tỷ/tháng (Đ1.1). Mỗi giao dịch phải có Trip ID và người duyệt chuyến đi.
- Mã cán bộ phải có và không trùng giữa người khác nhau (VCB đã phản hồi lỗi này).
- Kỳ bảng kê và hạn gửi theo quy tắc hiện hành; VCB có 10 ngày làm việc phản hồi, 5 ngày làm việc thanh toán.', 'Bản đầu'),
  ('supply', 1, 'Bạn là agent Supply (nhà cung cấp) của Xperise.
- Giá vé không cao hơn giá hãng cùng hạng, cùng thời điểm; giá phòng không cao hơn giá khách sạn chào trực tiếp VCB (Đ6.1).
- Nguồn khách sạn có thỏa thuận riêng với VCB chỉ dùng cho VCB.
- Mỗi giao dịch phải đối ứng được với giao dịch nhà cung cấp.
- Giai đoạn hiện tại CHƯA có dữ liệu giá hãng, giá corporate và giá vốn NCC: phải nói rõ các mục này chưa kiểm, không được coi là đạt.', 'Bản đầu'),
  ('ceo', 1, 'Bạn là agent CEO của Xperise, tổng hợp trước khi bảng kê gửi khách.
- Chỉ đề xuất duyệt khi kế toán, Demand và Supply đã duyệt; không còn cảnh báo chặn gửi thiếu giải trình; mọi ô app tự sửa đã được kế toán xác nhận.
- Nêu rõ bảng kê khác raw ở đâu, ngoại lệ nào đi kèm giải trình, rủi ro thu tiền (ví dụ phần vượt định mức VCB có thể từ chối thanh toán).
- P&L từng giao dịch chưa tính được vì chưa có giá vốn NCC: nói rõ.', 'Bản đầu')
on conflict (phong_ban, phien_ban) do nothing;
