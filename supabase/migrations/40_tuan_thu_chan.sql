-- =====================================================================
-- 40_tuan_thu_chan.sql — Đổi quy trình duyệt bảng kê
--   Kế toán duyệt → CEO duyệt & gửi.
--   Demand và Supply KHÔNG duyệt: nhận cảnh báo (chuông + email) và chỉ can thiệp khi cần,
--   bằng cách CHẶN lần chạy (CEO không duyệt được cho tới khi gỡ) hoặc TRẢ VỀ kế toán.
-- Chạy SAU 39_tuan_thu_agent.sql. Chạy lại nhiều lần không mất dữ liệu.
-- =====================================================================

create table if not exists tt_chan (
  id           bigserial primary key,
  lan_chay_id  uuid not null references tt_lan_chay(id) on delete cascade,
  phong_ban    text not null check (phong_ban in ('demand','supply')),
  ly_do        text not null,
  nguoi        uuid references profiles(id),
  nguoi_email  text,
  luc          timestamptz not null default now(),
  go_luc       timestamptz,
  go_boi       uuid references profiles(id),
  go_email     text,
  go_ghi_chu   text
);
create index if not exists tt_chan_lan_idx on tt_chan (lan_chay_id);
alter table tt_chan enable row level security;

-- Lần chạy đang chờ Demand & Supply (theo quy trình cũ) chuyển thẳng sang chờ CEO
update tt_lan_chay set buoc = 'cho_ceo' where buoc = 'cho_scope';

-- Cập nhật skill cho đúng quy trình mới (thêm phiên bản, không sửa bản cũ)
insert into tt_skill (phong_ban, phien_ban, noi_dung, ly_do)
select s.phong_ban, s.phien_ban + 1, s.noi_dung || E'\n' || v.them, 'Đổi quy trình: Demand/Supply kiểm soát và chặn khi cần, không duyệt'
from (select distinct on (phong_ban) * from tt_skill order by phong_ban, phien_ban desc) s
join (values
  ('demand', '- Quy trình: Demand KHÔNG duyệt bảng kê. Bạn nhận cảnh báo thuộc scope Demand và chỉ đề xuất CHẶN (CEO không duyệt được cho tới khi gỡ) hoặc TRẢ VỀ kế toán khi có rủi ro thật: vượt định mức không tờ trình, vượt hạn mức, thiếu phê duyệt chuyến đi, sai thông tin cán bộ ảnh hưởng thanh toán. Còn lại kết luận KHÔNG CẦN CHẶN.'),
  ('supply', '- Quy trình: Supply KHÔNG duyệt bảng kê. Bạn nhận cảnh báo thuộc scope Supply và chỉ đề xuất CHẶN hoặc TRẢ VỀ khi có rủi ro thật về giá hoặc nguồn cung. Các mục chưa có dữ liệu thì nêu là chưa kiểm, không tự coi là lý do chặn.'),
  ('ceo', '- Quy trình mới: bảng kê chỉ cần kế toán duyệt rồi tới CEO. Demand và Supply không duyệt mà kiểm soát: chỉ đề xuất duyệt khi KHÔNG còn lần chặn nào của Demand/Supply đang hiệu lực; nếu có, nêu lý do chặn. Điều kiện "Demand và Supply đã duyệt" ở trên không còn áp dụng.')
) as v(phong_ban, them) on v.phong_ban = s.phong_ban
where not exists (select 1 from tt_skill x where x.phong_ban = s.phong_ban and x.ly_do like 'Đổi quy trình:%');
