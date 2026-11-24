-- =====================================================================
-- 38_tuan_thu.sql — Phần "Tuân thủ bảng kê" (hợp đồng → bộ quy tắc → bảng kê → duyệt 4 head → gửi)
-- Chạy SAU 37_dashboard_trip.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không mất dữ liệu.
--
-- Mọi bảng tt_* bật RLS và KHÔNG có policy: chỉ máy chủ (service role) đọc ghi được.
-- Quyền thao tác kiểm ở máy chủ theo bảng tt_thanh_vien (mỗi người một phòng ban).
-- Cuối file: tạm TẮT cả 4 workflow cũ (WF1–WF4) theo yêu cầu; bật lại trên trang Workflow.
-- =====================================================================

create table if not exists tt_thanh_vien (
  user_id     uuid primary key references profiles(id) on delete cascade,
  phong_ban   text not null check (phong_ban in ('ke_toan','supply','demand','ceo')),
  created_at  timestamptz not null default now()
);

create table if not exists tt_hop_dong (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid references billing_groups(id) on delete set null,
  ma_khach      text not null unique,
  ten_khach     text not null,
  so_hop_dong   text not null,
  ngay_ky       date,
  storage_path  text,
  ten_tep       text,
  ten_sheet     jsonb not null default '{"ve_may_bay":"VMB-TRIP ID","khach_san":"KS-TRIP ID"}',
  cc_them       text,
  created_at    timestamptz not null default now()
);

-- Tham số máy đọc được của bộ quy tắc, có phiên bản. v1 = hợp đồng gốc.
create table if not exists tt_bo_quy_tac (
  id            uuid primary key default gen_random_uuid(),
  hop_dong_id   uuid not null references tt_hop_dong(id) on delete cascade,
  phien_ban     int not null,
  tham_so       jsonb not null,
  hieu_luc_tu   text not null,              -- 'YYYY-MM'
  ghi_chu       text,
  created_at    timestamptz not null default now(),
  unique (hop_dong_id, phien_ban)
);

-- Quy tắc dạng chữ cho head đọc, chốt.
create table if not exists tt_quy_tac (
  id            uuid primary key default gen_random_uuid(),
  hop_dong_id   uuid not null references tt_hop_dong(id) on delete cascade,
  ma            text not null,
  phong_ban     text not null check (phong_ban in ('ke_toan','supply','demand','ceo')),
  nhom          text, noi_dung text not null, gia_tri text, can_cu text,
  cach_kiem     text not null default 'tu_dong',
  muc_do        text not null default 'giai_trinh',
  du_lieu       text,
  chot          text not null default 'cho' check (chot in ('cho','dong_y','can_sua')),
  chot_y_kien   text,
  chot_boi      uuid references profiles(id),
  chot_luc      timestamptz,
  unique (hop_dong_id, ma)
);

create table if not exists tt_sua_doi (
  id               uuid primary key default gen_random_uuid(),
  hop_dong_id      uuid not null references tt_hop_dong(id) on delete cascade,
  so               int not null,
  ma_quy_tac       text not null,
  phong_ban        text not null,
  noi_dung_goc     text,
  noi_dung_moi     text not null,
  gia_tri_moi      text,
  thay_doi_tham_so jsonb,
  ly_do            text not null,
  can_cu           text,
  hieu_luc_tu      text not null,
  trang_thai       text not null default 'cho_duyet' check (trang_thai in ('cho_duyet','hieu_luc','tu_choi')),
  de_xuat_boi      uuid references profiles(id),
  created_at       timestamptz not null default now(),
  unique (hop_dong_id, so)
);

create table if not exists tt_sua_doi_duyet (
  sua_doi_id  uuid not null references tt_sua_doi(id) on delete cascade,
  phong_ban   text not null,
  quyet_dinh  text not null check (quyet_dinh in ('dong_y','khong_dong_y')),
  y_kien      text,
  nguoi       uuid references profiles(id),
  luc         timestamptz not null default now(),
  primary key (sua_doi_id, phong_ban)
);

create table if not exists tt_phong_ban_khach (
  hop_dong_id     uuid not null references tt_hop_dong(id) on delete cascade,
  ten             text not null,
  ma_cost_center  text,
  thu_tu          int not null default 0,
  primary key (hop_dong_id, ten)
);

create table if not exists tt_lan_chay (
  id                uuid primary key default gen_random_uuid(),
  hop_dong_id       uuid not null references tt_hop_dong(id) on delete cascade,
  thang             text not null,           -- 'YYYY-MM'
  dot               smallint,                -- null = cả tháng
  phien_ban_quy_tac int not null,
  buoc              text not null default 'cho_ke_toan'
                    check (buoc in ('cho_ke_toan','cho_scope','cho_ceo','da_gui','huy')),
  vong              int not null default 1,
  raw_paths         jsonb not null default '{}',
  raw_ten           jsonb not null default '{}',
  bang_ke_path      text,
  bao_cao_path      text,
  tong_hop          jsonb,
  gui_luc           timestamptz,
  gui_den           text,
  gui_cc            text,
  thread_id         text,
  loi               text,
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now()
);

create table if not exists tt_canh_bao (
  id              bigserial primary key,
  lan_chay_id     uuid not null references tt_lan_chay(id) on delete cascade,
  ma_quy_tac      text not null,
  phong_ban       text not null,
  muc_do          text not null,
  loai            text,
  dong            int[] not null default '{}',
  noi_dung        text not null,
  so_tien         numeric,
  giai_trinh      text,
  giai_trinh_boi  uuid references profiles(id),
  giai_trinh_luc  timestamptz
);
create index if not exists tt_canh_bao_lan_idx on tt_canh_bao (lan_chay_id);

create table if not exists tt_thay_doi (
  id              bigserial primary key,
  lan_chay_id     uuid not null references tt_lan_chay(id) on delete cascade,
  ma_quy_tac      text not null,
  loai            text not null,
  dong            int not null,
  ma_giao_dich    text,
  cot             text not null,
  truoc           numeric,
  sau             numeric,
  xac_nhan        boolean not null default false,
  xac_nhan_boi    uuid references profiles(id),
  xac_nhan_luc    timestamptz
);
create index if not exists tt_thay_doi_lan_idx on tt_thay_doi (lan_chay_id);

-- Nhật ký duyệt từng bước. vong tăng mỗi khi bị trả về / upload lại raw.
create table if not exists tt_duyet (
  id           bigserial primary key,
  lan_chay_id  uuid not null references tt_lan_chay(id) on delete cascade,
  vong         int not null,
  buoc         text not null check (buoc in ('ke_toan','demand','supply','ceo')),
  quyet_dinh   text not null check (quyet_dinh in ('duyet','tra_ve')),
  y_kien       text,
  de_xuat_agent text,
  nguoi        uuid references profiles(id),
  nguoi_email  text,
  luc          timestamptz not null default now()
);
create index if not exists tt_duyet_lan_idx on tt_duyet (lan_chay_id, vong);

alter table tt_thanh_vien      enable row level security;
alter table tt_hop_dong        enable row level security;
alter table tt_bo_quy_tac      enable row level security;
alter table tt_quy_tac         enable row level security;
alter table tt_sua_doi         enable row level security;
alter table tt_sua_doi_duyet   enable row level security;
alter table tt_phong_ban_khach enable row level security;
alter table tt_lan_chay        enable row level security;
alter table tt_canh_bao        enable row level security;
alter table tt_thay_doi        enable row level security;
alter table tt_duyet           enable row level security;

-- ---------------------------------------------------------------------
-- Dữ liệu khởi tạo: hợp đồng VCB 216.2.0.2026/VCB-UTS — bản GỐC, chưa áp sửa đổi
-- ---------------------------------------------------------------------
insert into tt_hop_dong (ma_khach, ten_khach, so_hop_dong, ngay_ky, group_id)
select 'VCB', 'VIETCOMBANK', '216.2.0.2026/VCB-UTS', date '2026-05-11',
       (select id from billing_groups
         where ma_he_thong ilike 'vcb%' or ten_nhom ilike '%vietcombank%' or ten_nhom ilike 'vcb%'
         order by (ten_nhom ilike '%vietcombank%') desc limit 1)
on conflict (ma_khach) do nothing;

insert into tt_bo_quy_tac (hop_dong_id, phien_ban, tham_so, hieu_luc_tu, ghi_chu)
select id, 1, '{"ma_khach": "VCB", "so_hop_dong": "216.2.0.2026/VCB-UTS", "ty_le_chiet_khau": {"khach_san": 0, "ve_may_bay": 0}, "phi_dich_vu": {"khach_san": 0, "ve_may_bay": 0}, "ky": {"kieu": "thang"}, "tai_khoan": {"so": "1068273979", "ngan_hang": "Ngân hàng TMCP Ngoại thương Việt Nam, Chi nhánh Tân Định"}, "ben_ban": {"ten": "Công ty Cổ phần Universal Travel Solutions Network", "mst": "0317855759", "dia_chi": "Tầng 3, Harbour View Tower, số 35 Nguyễn Huệ, Phường Sài Gòn, Thành phố Hồ Chí Minh, Việt Nam", "dien_thoai": "19002183"}, "ben_mua": {"ten": "NGÂN HÀNG THƯƠNG MẠI CỔ PHẦN NGOẠI THƯƠNG VIỆT NAM", "mst": "0100112437", "dia_chi": "198 Trần Quang Khải, phường Hoàn Kiếm, Thành phố Hà Nội", "dien_thoai": "02439343137"}, "han_muc_thang": 3000000000, "dinh_muc_phong": [{"nhom": "Lãnh đạo cấp cao (phòng Suite)", "muc": null, "tu_khoa": ["tổng giám đốc", "hđqt", "hội đồng quản trị", "ban kiểm soát", "kế toán trưởng", "giám đốc khối"]}, {"nhom": "GĐ, PGĐ Sở giao dịch, CN TP.HCM", "muc": [2500000, 2000000], "tu_khoa": ["sở giao dịch", "chi nhánh tp hồ chí minh", "chi nhánh tp. hồ chí minh"]}, {"nhom": "GĐ, PGĐ ĐVTV khác", "muc": [2000000, 1700000], "tu_khoa": ["giám đốc", "phó giám đốc"]}, {"nhom": "Các đối tượng khác", "muc": [1500000, 1300000], "tu_khoa": []}], "dia_ban_nhom_1_2": ["ha noi", "hanoi", "ho chi minh", "hcm", "sai gon", "saigon", "can tho", "da nang", "hai phong", "hue", "ha long", "bai chay", "tuan chau", "hong gai", "nha trang", "phu quoc", "vung tau", "thu dau mot", "binh duong", "hai duong", "bac ninh", "hoa lu", "ninh binh", "thai nguyen", "viet tri", "thanh hoa", "vinh", "cua lo", "quy nhon", "pleiku", "buon ma thuot", "da lat", "dalat", "bien hoa", "my tho", "long xuyen", "rach gia"], "ten_trang_thai": {"khach_san:completed": "Có lưu trú", "khach_san:canceled": "Đã hủy", "khach_san:pending checkin": "Chờ nhận phòng", "ve_may_bay:completed": "Đã sử dụng", "ve_may_bay:cancelled": "Đã hủy"}}'::jsonb, '2026-01', 'Hợp đồng gốc 216.2.0.2026/VCB-UTS ký 11/05/2026'
from tt_hop_dong where ma_khach = 'VCB'
on conflict (hop_dong_id, phien_ban) do nothing;

insert into tt_quy_tac (hop_dong_id, ma, phong_ban, nhom, noi_dung, gia_tri, can_cu, cach_kiem, muc_do, du_lieu)
select h.id, v.* from tt_hop_dong h, (values
  ('KT-01','ke_toan','Chiết khấu','Không áp dụng chiết khấu trên bất kỳ dòng nào của bảng kê','Chiết khấu trước VAT = 0; VAT chiết khấu = 0','Đ3.1 chỉ nêu chiết khấu ''nếu có'', không quy định mức; Đ12: mọi thay đổi phải có phụ lục ký','tu_dong','chan_gui','Cột chiết khấu trên raw và bảng kê'),
  ('KT-02','ke_toan','Phí dịch vụ','Không thu phí dịch vụ trên chi phí mua sắm vé, khách sạn','Phí dịch vụ = 0','Đ1.2: giá HĐ 3,24 tỷ đã gồm chi phí bộ giải pháp; Đ5: chi phí mua sắm theo thực tế phát sinh','tu_dong','chan_gui','Cột phí dịch vụ'),
  ('KT-03','ke_toan','Số học','Thành tiền chưa VAT + VAT = Thành tiền đã VAT; Tổng thành tiền = Thành tiền − chiết khấu + phí','Chênh 0đ','Đ3.1 hồ sơ thanh toán; PL01 mẫu bảng kê','tu_dong','chan_gui','Các cột tiền'),
  ('KT-04','ke_toan','Làm tròn','Số tiền trên bảng kê giữ nguyên theo raw, không làm tròn lại khi format','Chênh 0đ so với raw','Quy ước nội bộ (anh Van chốt 25/11/2026)','tu_dong','chan_gui','Raw và bảng kê'),
  ('KT-05','ke_toan','Đầy đủ','Raw và bảng kê khớp từng mã giao dịch: không thiếu, không thừa, không trùng','Khớp 100%','Đ3.1: bảng kê chi tiết giao dịch và chi phí phát sinh trong kỳ','tu_dong','chan_gui','Mã giao dịch, số vé'),
  ('KT-06','ke_toan','Thông tin thanh toán','Tài khoản nhận tiền in trên header bảng kê','1068273979 – VCB CN Tân Định','Phần Bên B và Đ3.2 (chuyển khoản vào tài khoản ghi trong HĐ)','tu_dong','chan_gui','Header bảng kê'),
  ('KT-07','ke_toan','Thông tin bên bán','Tên, MST, địa chỉ Bên B trên header','CTCP Universal Travel Solutions Network; MST 0317855759; Tầng 3 Harbour View Tower, 35 Nguyễn Huệ','Phần thông tin Bên B','tu_dong','chan_gui','Header bảng kê'),
  ('KT-08','ke_toan','Thông tin bên mua','Tên, MST, địa chỉ Bên A trên header','NH TMCP Ngoại thương VN; MST 0100112437; 198 Trần Quang Khải, P. Hoàn Kiếm, Hà Nội','Phần thông tin Bên A','tu_dong','chan_gui','Header bảng kê'),
  ('KT-09','ke_toan','Hóa đơn','Mỗi giao dịch có số hóa đơn GTGT và link tra cứu','Không trống','Đ3.1: hồ sơ thanh toán gồm hóa đơn GTGT của Bên B','tu_dong','giai_trinh','Số hóa đơn, link hóa đơn'),
  ('KT-10','ke_toan','Dòng tổng','Dòng tổng mỗi sheet = tổng chi tiết; sheet Chi phí phòng ban = tổng 2 sheet vé và khách sạn; dòng tổng không mang số thứ tự','Chênh 0đ','PL01 mẫu bảng kê','tu_dong','chan_gui','Toàn bộ file'),
  ('KT-11','ke_toan','Mẫu bảng kê','Đúng cột và thứ tự cột theo PL01 (Tiền phòng, Tiền vé máy bay)','Theo PL01','PL01; mẫu chỉ đổi khi Quản lý kế toán VCB thống nhất','tu_dong','chan_gui','Template'),
  ('KT-12','ke_toan','VAT','Thuế suất VAT theo hóa đơn và quy định hiện hành','Theo hóa đơn','Đ1.2 (VAT theo pháp luật hiện hành)','head_xem','giai_trinh','Cột VAT'),
  ('DM-01','demand','Kỳ bảng kê','Bảng kê gửi 1 lần cho cả tháng; giao dịch xếp kỳ theo ngày giao dịch; giao dịch ngoài kỳ phải có giải trình của kế toán','1 kỳ/tháng, hạn gửi ngày cuối cùng của tháng','Đ3.1','tu_dong','giai_trinh','Ngày giao dịch'),
  ('DM-02','demand','Hạn gửi','Hạn gửi bảng kê từng đợt','Ngày cuối cùng của tháng dương lịch','Đ3.1 (HĐ gốc: ngày cuối tháng)','tu_dong','theo_doi','Lịch gửi'),
  ('DM-03','demand','Hạn mức','Tổng mua sắm trong tháng không vượt hạn mức; vượt phải có văn bản đề nghị điều chỉnh của VCB','3.000.000.000đ/tháng','Đ1.1','tu_dong','giai_trinh','Tổng giá trị tháng'),
  ('DM-04','demand','Định mức tiền phòng','Giá phòng/đêm (đã thuế) không vượt định mức theo chức danh và nhóm địa bàn; vượt phải có phê duyệt trước, nếu không VCB không thanh toán phần vượt','Xem sheet Định mức tiền phòng','Đ6.2; PL02 mục I.3; PL2b; PL02 mục III','tu_dong','chan_gui','Chức danh, nhóm địa bàn, đơn giá, tờ trình'),
  ('DM-05','demand','Định mức vé','Hạng vé đúng theo chức danh; vé hạng cao hơn phải có xác nhận hoặc phê duyệt','Xem sheet Định mức vé','PL02 mục II','head_xem','giai_trinh','Chức danh, hạng vé, phê duyệt'),
  ('DM-06','demand','Ghép phòng','Đoàn từ 2 người phải ghép phòng, trừ các ngoại lệ PL02; ở ghép trên 2 người được cộng tối đa 50% định mức từ người thứ 3','Theo PL02 mục III','PL02 mục III','head_xem','giai_trinh','Trip ID, số khách mỗi phòng, giới tính, chức danh'),
  ('DM-07','demand','Phê duyệt chuyến đi','Mỗi giao dịch có Trip ID và người duyệt chuyến đi','Không trống','PL02 mục III (phải có phê duyệt cử đi công tác)','tu_dong','chan_gui','Trip ID, người duyệt'),
  ('DM-08','demand','Dữ liệu cán bộ','Mã cán bộ và cost center có giá trị, không trùng mã giữa các người khác nhau','Không trống, không trùng','Phản hồi VCB đợt 1 T10/2026; PL01','tu_dong','giai_trinh','Mã cán bộ, họ tên, cost center'),
  ('DM-09','demand','Thanh toán','Theo dõi: VCB có 10 ngày làm việc phản hồi (im lặng = chấp nhận), thanh toán trong 5 ngày làm việc sau chấp nhận','10 + 5 ngày làm việc','Đ3.2','tu_dong','theo_doi','Ngày gửi, ngày phản hồi, ngày thanh toán'),
  ('DM-10','demand','Chậm thanh toán','Quá 60 ngày chưa thanh toán: Bên B được chấm dứt HĐ; phạt chậm trả','1%/tháng (30 ngày) × số ngày chậm','Đ6.1; Đ8','tu_dong','theo_doi','Công nợ phải thu'),
  ('DM-11','demand','Khiếu nại','Khiếu nại bằng văn bản trong 3 ngày làm việc; Bên B cung cấp biên lai trong 3 ngày làm việc; chỉ xử lý sự việc trong 60 ngày','3 / 3 / 60 ngày','Đ10','tu_dong','theo_doi','Email phản hồi của VCB'),
  ('DM-12','demand','Người nhận','Gửi bảng kê tới đầu mối VCB','Cần chốt danh sách To/CC','Đ7.2','head_xem','chan_gui','Master data khách hàng'),
  ('SP-01','supply','Giá vé','Giá vé qua xperise không cao hơn giá cùng hạng trên website hãng tại cùng thời điểm','≤ giá hãng','Đ6.1','gd2','giai_trinh','Giá hãng tại thời điểm đặt'),
  ('SP-02','supply','Giá phòng','Giá phòng không cao hơn giá khách sạn chào trực tiếp VCB (cùng hạng, số phòng, thời gian, đã gồm thuế)','≤ giá chào VCB','Đ6.1','gd2','giai_trinh','Danh sách giá corporate VCB'),
  ('SP-03','supply','Corporate rate','Nguồn khách sạn có thỏa thuận riêng với VCB chỉ dùng cho cán bộ VCB','Không dùng cho khách khác','Đ6.1; PL03 mục D3','head_xem','theo_doi','Danh sách KS corporate VCB'),
  ('SP-04','supply','Đối ứng NCC','Mỗi giao dịch nối được với giao dịch nhà cung cấp (PNR, mã booking, hóa đơn NCC)','100% có mã đối ứng','Nội bộ','gd2','giai_trinh','Dữ liệu NCC'),
  ('SP-05','supply','Phạm vi','Dịch vụ trong nước; giao dịch quốc tế cần xác nhận','Nội địa','Đ1; PL03 mục 2.1 (phạm vi Việt Nam)','tu_dong','giai_trinh','Cột Nội địa/Quốc tế'),
  ('CEO-01','ceo','P&L giao dịch','Mỗi giao dịch: doanh thu trên bảng kê − giá vốn NCC; margin âm hoặc dưới ngưỡng phải cảnh báo','Cần chốt ngưỡng margin','Nội bộ','gd2','giai_trinh','Giá vốn NCC'),
  ('CEO-02','ceo','Sửa đổi quy tắc','Mọi quy tắc khác HĐ gốc phải có văn bản làm căn cứ và đủ 4 head đồng ý','Đủ 4/4','Đ12 (thay đổi phải có phụ lục ký)','head_xem','chan_gui','Sheet Sửa đổi so với HĐ'),
  ('CEO-03','ceo','Phạt SLA','Theo dõi vi phạm SLA Sev1 có thể bị khấu trừ vào giá HĐ','0,1%/ngày, tối đa 8%','Đ9; PL03 mục 6.2–6.3','head_xem','theo_doi','Log sự cố')
) as v(ma, phong_ban, nhom, noi_dung, gia_tri, can_cu, cach_kiem, muc_do, du_lieu)
where h.ma_khach = 'VCB'
on conflict (hop_dong_id, ma) do nothing;

insert into tt_phong_ban_khach (hop_dong_id, ten, ma_cost_center, thu_tu)
select h.id, v.* from tt_hop_dong h, (values
  ('Trung tâm Quản lý vận hành Bán lẻ',null,1),
  ('Phòng Phát triển sản phẩm bán lẻ','680821',2),
  ('Pháp chế',null,3),
  ('Ban Marketing và truyền thông',null,4),
  ('Ban Khách hàng doanh nghiệp lớn','680057',5),
  ('Trung tâm Đổi mới sáng tạo Vietcombank',null,6),
  ('Tài chính kế toán','680141',7),
  ('Công nợ',null,8),
  ('Trường Đào tạo và PT nguồn nhân lực VCB',null,9),
  ('Ban Kiểm tra nội bộ',null,10),
  ('Văn phòng Đảng ủy VCB',null,11),
  ('Ban Tổ chức và Nhân sự',null,12),
  ('Chính sách sản phẩm bán buôn',null,13),
  ('Ban Khách hàng FDI',null,14),
  ('Ban Khách hàng doanh nghiệp',null,15),
  ('Ban Định chế tài chính',null,16),
  ('Quản lý rủi ro tín dụng',null,17),
  ('Ban Kinh doanh sản phẩm vốn',null,18),
  ('BTK DA "Cải tiến HT khởi tạo KV KHBB"',null,19),
  ('Phòng Quản lý chất lượng',null,20),
  ('Phê duyệt tín dụng',null,21),
  ('Phòng Quản lý Kênh chi nhánh',null,22),
  ('Ban Thị trường tài chính',null,23),
  ('Bộ phận Phê duyệt tín dụng TSC tại HCM',null,24),
  ('Phòng Chính sách An ninh thông tin',null,25),
  ('Quản lý Tài sản nợ - Tài sản có',null,26),
  ('BTK DA "XD Khung bảo vệ DL cá nhân"',null,27),
  ('Phòng Chính sách sản phẩm vốn',null,28),
  ('Trung tâm định giá tài sản VCB',null,29),
  ('Trung tâm Tài trợ thương mại',null,30),
  ('Phòng Giải pháp và kênh số bán buôn',null,31),
  ('BTKDA XD và áp dụng khung năng lực...',null,32),
  ('Chính sách và kế hoạch nhân sự',null,33),
  ('Ban Chiến lược và Thư ký HĐQT',null,34),
  ('Cơ quan Công đoàn VCB',null,35),
  ('BTK thành lập NHTM 100% vốn của VCB tại IFC',null,36),
  ('Quản lý rủi ro hoạt động',null,37),
  ('Trung tâm thanh toán',null,38),
  ('VPĐD VCB tại khu vực phía Nam',null,39),
  ('Trung tâm hỗ trợ khách hàng',null,40),
  ('BTK DA "Số hóa chi nhánh"',null,41),
  ('Trung tâm định giá tài sản ',null,42),
  ('Phòng Tài chính kế toán',null,43),
  ('Trung tâm Xử lý tiền mặt tại TP. HCM',null,44),
  ('Trung tâm TTTM - HCM',null,45),
  ('Phòng Quản lý xây dựng cơ bản',null,46),
  ('PHÒNG PHÊ DUYỆT TÍN DỤNG',null,47),
  ('Ban Tổ chức Đảng ủy VCB',null,48),
  ('Ban Tuyên giáo Đảng ủy VCB',null,49),
  ('Trung tâm Phát triển phần mềm ứng dụng',null,50),
  ('Cơ quan Ủy ban Kiểm tra Đảng ủy VCB',null,51),
  ('Văn phòng',null,52),
  ('Phòng Kiểm thử ứng dụng',null,53),
  ('Phòng Chính sách khách hàng bán lẻ',null,54),
  ('Trung tâm dịch vụ khách hàng',null,55),
  ('BTKDA SKCL vận hành VCB đến năm 2030',null,56),
  ('Ban triển khai Dự án Private Banking',null,57),
  ('BTK DA tăng vốn điều lệ cho VCB',null,58),
  ('Quản lý xây dựng cơ bản',null,59),
  ('BTKDA Mua sắm hệ thống CNTT PCRT tại VCB',null,60),
  ('Phòng chống rửa tiền',null,61),
  ('Trung tâm Vận hành công nghệ thông tin',null,62),
  ('Kiểm toán nội bộ HSC',null,63),
  ('Ban Mua sắm',null,64),
  ('BTKDA Xây dựng HT SP&DV thị trường vốn',null,65),
  ('Tiểu ban rà soát quy trình quy chế nội bộ ngân hàng xây dựng',null,66),
  ('BTK DA "VCB Corporate Digibank"',null,67),
  ('BTKDA MR cải tiến các DVsố dành cho KHTC',null,68),
  ('Phát triển kênh số và đối tác',null,69),
  ('Tiểu ban Rà soát đánh giá MHTC NSML NHXD',null,70),
  ('Ban điều hành',null,71),
  ('BTK "Dự án Chuyển đổi ISO 20022"',null,72),
  ('BTK DA chuyển đổi Microsoft Office 365',null,73),
  ('BTK DA Đầu tư HT Quản lý QHKH (CRM)',null,74),
  ('BTK DA nâng cấp toàn diện HT VCB Money',null,75),
  ('Phòng Quản lý thông tin khách hàng',null,76),
  ('Trung tâm Quản trị và Ứng dụng dữ liệu',null,77)
) as v(ten, ma_cost_center, thu_tu)
where h.ma_khach = 'VCB'
on conflict (hop_dong_id, ten) do nothing;


-- ---------------------------------------------------------------------
-- Tạm tắt 4 workflow cũ (WF1 gửi bảng kê, WF2 phân loại phản hồi, WF3 gửi lại tệp, WF4 nhắc SLA).
-- Giao diện Workflow giữ nguyên; bật lại ở đó khi cần.
-- ---------------------------------------------------------------------
update workflow_schedules set enabled = false where key in ('wf1','wf2','wf3','wf4');
