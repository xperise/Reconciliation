'use client';
import { useState } from 'react';

// =====================================================================
// Dữ liệu SOP — cấu trúc theo vai trò × tình huống
// =====================================================================

const SECTIONS = [
  {
    id: 'tong-quan',
    label: 'Tổng quan',
    icon: '◎',
    color: 'accent',
    mo_ta: 'Hiểu cách hệ thống vận hành từ đầu tới cuối trước khi bắt đầu.',
    noi_dung: [
      {
        tieu_de: 'Quy trình đối soát một kỳ',
        mo_ta: 'Mỗi kỳ đối soát đi qua 4 giai đoạn chính, tự động hóa tối đa, chỉ dừng lại khi cần người quyết định.',
        buoc: [
          { so: '1', ten: 'Gửi bảng kê', chu_the: 'Hệ thống tự động', mo_ta: 'WF1 chạy lúc 08:00. Với mỗi nhóm đến hạn gửi hôm nay, hệ thống tìm tệp trong kho, gửi email đính kèm cho khách, ghi thread_id để neo mọi email sau này.' },
          { so: '2', ten: 'Nhận phản hồi', chu_the: 'Hệ thống tự động', mo_ta: 'WF2 chạy mỗi phút. Đọc hộp thư, tìm email khách reply vào đúng thread bảng kê, dùng AI phân loại ý định rồi đẩy vào hàng chờ duyệt.' },
          { so: '3', ten: 'Kế toán duyệt', chu_the: 'Kế toán', mo_ta: 'Vào trang Chờ duyệt, đọc tóm tắt AI + nguyên văn email khách, chọn một trong ba quyết định: Đồng ý, Cần sửa, hoặc Từ chối.' },
          { so: '4', ten: 'Hoàn tất', chu_the: 'Hệ thống tự động', mo_ta: 'Tuỳ quyết định của kế toán: chốt và chuẩn bị hồ sơ thanh toán, gửi lại bảng kê sửa (khi kế toán upload bản mới), hoặc chuyển xử lý tay.' },
        ],
      },
      {
        tieu_de: 'Đọc Dashboard ba tầng',
        mo_ta: 'Dashboard chia theo người đọc, không chia theo loại số liệu.',
        bang: {
          header: ['Tầng', 'Dành cho', 'Trả lời câu hỏi'],
          rows: [
            ['Tầng 1 — Chiến lược', 'Ban điều hành', 'Quy trình có giúp thu tiền nhanh không, tự động hoá tới đâu'],
            ['Tầng 2 — Vận hành', 'Quản lý', 'Khâu nào đang làm chậm, lỗi thuộc nội bộ hay khách'],
            ['Tầng 3 — Hành động', 'Vận hành hằng ngày', 'Hôm nay phải gọi ai, xử lý kỳ nào trước'],
          ],
        },
        chu_y: { loai: 'accent', noi_dung: 'Ô chỉ số nào bấm được sẽ dẫn thẳng sang danh sách đã lọc sẵn. Số liệu tính lại mỗi lần mở trang, không có giá trị lưu cứng. Khi chưa đủ dữ liệu để tính, ô hiện dấu gạch chứ không đoán.' },
      },
      {
        tieu_de: 'Mười chỉ số và cách tính',
        mo_ta: '',
        bang: {
          header: ['Chỉ số', 'Cách tính'],
          rows: [
            ['Chốt tự động hoàn toàn', 'Số kỳ chốt mà chưa từng đi qua "Cần chỉnh sửa" hay "Cần xử lý tay", chia tổng số kỳ đã chốt'],
            ['Vòng đời chốt công nợ', 'Trung bình số ngày từ lần gửi bảng kê đầu tiên tới ngày chốt'],
            ['Rủi ro kẹt dòng tiền', 'Số kỳ quá hạn chia tổng số kỳ đang xử lý'],
            ['Rò rỉ thời gian nội bộ', 'Tổng giờ nằm ở các trạng thái chờ nội bộ: chờ file, chờ duyệt, cần sửa, chờ HSTT'],
            ['Nút thắt lớn nhất', 'Trạng thái có số giờ trung bình cao nhất trong kỳ'],
            ['Lệch SLA trung bình', 'Số ngày khách thực sự dùng trừ đi SLA cam kết trong Master Data'],
            ['Cận hạn 24 giờ', 'Kỳ chưa chốt có hạn rơi vào hôm nay hoặc ngày mai'],
            ['Tỷ lệ phải xử lý tay', 'Số kỳ ở trạng thái "Cần xử lý tay" chia tổng số kỳ'],
            ['Số lần sửa mỗi bảng kê', 'Tổng lượt chuyển sang "Cần chỉnh sửa" chia tổng số bảng kê'],
            ['Thời gian chờ thuộc về ai', 'Phân bổ tổng giờ chờ giữa trạng thái nội bộ và trạng thái chờ khách'],
          ],
        },
        chu_y: { loai: 'high', noi_dung: 'Chỉ số "Số lần sửa mỗi bảng kê" vượt 1 nghĩa là trung bình mỗi bảng kê phải sửa hơn một lần — dấu hiệu chất lượng dữ liệu đầu vào có vấn đề, nên soi lại khâu chuẩn bị file.' },
      },
      {
        tieu_de: 'Bốn workflow và lịch chạy',
        mo_ta: '',
        bang: {
          header: ['Workflow', 'Việc làm', 'Lịch mặc định', 'Tắt được không?'],
          rows: [
            ['WF1', 'Gửi bảng kê cho nhóm đến hạn', '08:00 hằng ngày', 'Có'],
            ['WF2', 'Nhận & phân loại phản hồi khách', 'Mỗi 1 phút', 'Có'],
            ['WF3', 'Gửi lại tệp chưa gửi được', 'Mỗi 5 phút', 'Có'],
            ['WF4', 'Nhắc khách + nhắc nội bộ chậm', '08:30 hằng ngày', 'Có'],
          ],
        },
      },
      {
        tieu_de: '11 trạng thái trong vòng đời một kỳ',
        mo_ta: 'Mỗi dòng Tracking chỉ đi theo một chiều. Không có trạng thái nào "quay lui".',
        bang: {
          header: ['Trạng thái', 'Ý nghĩa', 'Ai chuyển'],
          rows: [
            ['Chưa gửi', 'WF1 chưa xử lý kỳ này', 'Tự động khởi tạo'],
            ['Chờ file — đã nhắc nội bộ', 'Hết hạn nhưng kho chưa có tệp', 'WF1'],
            ['Đã gửi bảng kê', 'Email đã tới khách', 'WF1 / WF3'],
            ['Khách đã trả lời', 'WF2 phát hiện reply mới', 'WF2'],
            ['Chờ kế toán duyệt', 'AI đã phân loại, cần người quyết', 'WF2 / WF4'],
            ['Cần chỉnh sửa', 'Kế toán chọn "Cần sửa"', 'Kế toán'],
            ['Đã chốt', 'Kế toán chọn "Đồng ý"', 'Kế toán'],
            ['Chờ hồ sơ thanh toán', 'Chốt xong, chờ upload HSTT', 'Tự động'],
            ['Đã gửi hồ sơ thanh toán', 'HSTT đã gửi khách', 'WF3'],
            ['Mặc định chấp thuận', 'Hết vòng nhắc, tự động chốt (nhóm 1)', 'WF4'],
            ['Cần xử lý tay', 'Hệ thống dừng, cần người can thiệp', 'Nhiều nguồn'],
          ],
        },
      },
    ],
  },

  {
    id: 'ke-toan',
    label: 'Kế toán',
    icon: '⊟',
    color: 'stable',
    mo_ta: 'Tải tệp lên, duyệt phản hồi khách, và xử lý các trường hợp ngoại lệ.',
    noi_dung: [
      {
        tieu_de: 'Tải bảng kê lên (việc hằng ngày)',
        mo_ta: '',
        buoc: [
          { so: '1', ten: 'Vào tab Bảng kê → Tệp bảng kê', chu_the: '', mo_ta: 'Thanh tab trên cùng chia bốn nhóm: Tổng quan, Bảng kê, Quản lý, Hỗ trợ. Ô tải tệp nằm đầu trang.' },
          { so: '2', ten: 'Chọn nhóm và kỳ', chu_the: '', mo_ta: 'Chọn từ danh sách — không cần nhớ tên thư mục hay cú pháp tên file. Kỳ mặc định là tháng trước.' },
          { so: '3', ten: 'Chọn loại tệp', chu_the: '', mo_ta: '"Bảng kê" cho lần đầu. "Hồ sơ thanh toán" khi chốt xong cần gửi HSTT. Hệ thống tự đánh số phiên bản.' },
          { so: '4', ten: 'Kéo thả tệp', chu_the: '', mo_ta: 'Nhận .xlsx .pdf .docx .zip — tối đa 50 MB. Giữ tick "Gửi cho khách ngay" để hệ thống gửi email liền sau khi upload.' },
          { so: '5', ten: 'Kiểm tra kết quả', chu_the: '', mo_ta: 'Thông báo "Đã gửi bảng kê cho [nhóm]" xuất hiện. Vào Tracking để thấy trạng thái chuyển sang "Đã gửi bảng kê".' },
        ],
        chu_y: { loai: 'amber', noi_dung: 'Tên tệp đặt thế nào cũng được — hệ thống đã biết nhóm và kỳ từ lúc bạn chọn. Tải bản chỉnh sửa lên cùng nhóm cùng kỳ thì tự động thành bản 2.' },
      },
      {
        tieu_de: 'Duyệt phản hồi khách (việc hằng ngày)',
        mo_ta: 'Số đỏ trên mục "Chờ duyệt" ở sidebar = số việc đang chờ.',
        buoc: [
          { so: '1', ten: 'Mở trang Chờ duyệt', chu_the: '', mo_ta: 'Mỗi thẻ là một nhóm khách vừa phản hồi. Đọc nhãn AI (Khách đồng ý / Muốn trao đổi thêm / Từ chối) và % độ tin cậy.' },
          { so: '2', ten: 'Đọc tóm tắt và nguyên văn', chu_the: '', mo_ta: 'Mở "Xem nguyên văn email khách" nếu cần đối chiếu. Link "Mở bảng kê đã gửi" để nhìn lại file.' },
          { so: '3', ten: 'Chọn quyết định', chu_the: '', mo_ta: '3 nút: "Đồng ý — chốt bảng kê" / "Cần sửa — gửi lại bản mới" / "Từ chối — xử lý tay". Nút được tô đậm là gợi ý của AI.' },
          { so: '4', ten: 'Ghi chú nếu cần', chu_the: '', mo_ta: 'Ô ghi chú không bắt buộc — dùng khi cần lý do cho audit log. Bấm xong là xong, trang tự làm mới.' },
        ],
        chu_y: { loai: 'violet', noi_dung: 'Chọn "Cần sửa" → tải bản chỉnh lên trang Tệp bảng kê → hệ thống tự gửi email cho khách (thường trong vài giây). Không cần gửi email tay.' },
      },
      {
        tieu_de: 'Gửi hồ sơ thanh toán',
        mo_ta: 'Sau khi kỳ đã chốt, trạng thái chuyển sang "Chờ hồ sơ thanh toán".',
        buoc: [
          { so: '1', ten: 'Chuẩn bị tệp HSTT', chu_the: '', mo_ta: 'Thường là file .zip hoặc .pdf.' },
          { so: '2', ten: 'Vào Tệp bảng kê → Tải lên', chu_the: '', mo_ta: 'Chọn đúng nhóm, đúng kỳ. Đổi loại tệp sang "Hồ sơ thanh toán".' },
          { so: '3', ten: 'Upload và gửi', chu_the: '', mo_ta: 'Giữ tick "Gửi cho khách ngay". Hệ thống gửi email riêng cho khách trong cùng thread bảng kê.' },
        ],
      },
    ],
  },

  {
    id: 'pm',
    label: 'PM',
    icon: '⊕',
    color: 'high',
    mo_ta: 'Theo dõi tiến độ toàn bộ kỳ, can thiệp khi cần, và xử lý ngoại lệ.',
    noi_dung: [
      {
        tieu_de: 'Theo dõi tiến độ kỳ',
        mo_ta: 'Trang Tổng quan và Theo dõi kỳ là hai màn hình chính.',
        buoc: [
          { so: '1', ten: 'Tổng quan', chu_the: '', mo_ta: '5 số KPI ở đầu trang: đã chốt, chờ duyệt, chờ nội bộ upload, quá hạn, cần xử lý tay. Nhìn một cái biết cả kỳ đang tắc ở đâu.' },
          { so: '2', ten: 'Theo dõi kỳ', chu_the: '', mo_ta: 'Lọc theo kỳ, trạng thái, hoặc tên nhóm. Cột "Escalate" hiển thị thanh L1→L2→L3 và số vòng lặp — nhìn một cái biết mức độ leo thang.' },
          { so: '3', ten: 'Nhật ký', chu_the: '', mo_ta: 'Tra cứu khi cần chứng minh: ai làm gì lúc mấy giờ, mỗi trạng thái nằm bao lâu.' },
        ],
      },
      {
        tieu_de: 'Can thiệp thủ công (khi hệ thống dừng)',
        mo_ta: 'Nút "Can thiệp" trên mỗi dòng Tracking — dành cho PM và kế toán.',
        buoc: [
          { so: '1', ten: 'Xác định vấn đề', chu_the: '', mo_ta: 'Thường gặp: Thread_ID biến mất (khách xóa email gốc), trạng thái kẹt sai, hoặc cần tạm dừng escalate.' },
          { so: '2', ten: 'Bấm "Can thiệp"', chu_the: '', mo_ta: 'Cửa sổ mở ra cho sửa mọi trường: trạng thái, hạn chấp nhận, ngày gửi, ngày chốt, mốc chờ file, cấp escalate, số vòng nhắc, cả ba Thread ID, link tệp, phân loại AI và ghi chú.' },
          { so: '3', ten: 'Ghi lý do rồi Lưu', chu_the: '', mo_ta: 'Nhật ký ghi lại đúng những trường đã đổi kèm giá trị cũ và mới. Bấm vào dòng trong Nhật ký để xem bảng so sánh.' },
        ],
        chu_y: { loai: 'amber', noi_dung: 'Nếu Thread_ID mất: vào Gmail tìm thread gốc → copy ID từ URL (phần sau #thread/) → paste vào ô Thread_ID mới.' },
      },
      {
        tieu_de: 'Xử lý "Cần xử lý tay"',
        mo_ta: 'Khi hệ thống đặt trạng thái này nghĩa là bot đã dừng lại và chờ người can thiệp.',
        buoc: [
          { so: '1', ten: 'Đọc ghi chú', chu_the: '', mo_ta: 'Cột Ghi chú và Nhật ký ghi rõ lý do hệ thống dừng.' },
          { so: '2', ten: 'Xử lý ngoài hệ thống', chu_the: '', mo_ta: 'Liên hệ trực tiếp với khách hoặc leo thang nội bộ tuỳ tình huống.' },
          { so: '3', ten: 'Cập nhật lại', chu_the: '', mo_ta: 'Dùng nút Can thiệp để đổi trạng thái phù hợp (ví dụ "Đã chốt") để Tracking phản ánh thực tế.' },
        ],
      },
    ],
  },

  {
    id: 'admin',
    label: 'Quản trị',
    icon: '⊛',
    color: 'critical',
    mo_ta: 'Cấu hình hệ thống, quản lý người dùng và xử lý sự cố kỹ thuật.',
    noi_dung: [
      {
        tieu_de: 'Thiết lập ban đầu (làm một lần)',
        mo_ta: '',
        buoc: [
          { so: '1', ten: 'Kết nối Google', chu_the: '', mo_ta: 'Cài đặt → Kết nối Google → chọn hộp thư vận hành → chấp nhận quyền Gmail. Nếu Google không trả mã làm mới: vào myaccount.google.com/permissions gỡ quyền cũ rồi kết nối lại.' },
          { so: '2', ten: 'Nhập Master Data', chu_the: '', mo_ta: 'Master Data → Thêm nhóm. Mỗi nhóm = một đơn vị gửi bảng kê. Khai đủ: mã hệ thống, ngày gửi, SLA, email L1, email kế toán nội bộ.' },
          { so: '3', ten: 'Cấu hình workflow', chu_the: '', mo_ta: 'Workflow → bật từng workflow. Dùng "Chạy thử ngay" trước khi bật lịch tự động. Workflow chạy theo lịch đọc từ database — đổi giờ trên web là hiệu lực ngay.' },
          { so: '4', ten: 'Cấp tài khoản', chu_the: '', mo_ta: 'Người dùng → Cấp tài khoản. 4 vai trò: Quản trị (toàn quyền), Kế toán (upload + duyệt), PM (can thiệp tracking), Cấp quản lý (chỉ xem).' },
        ],
      },
      {
        tieu_de: 'Thêm/sửa Master Data',
        mo_ta: 'Khi có khách mới hoặc cần cập nhật SLA, email.',
        buoc: [
          { so: '1', ten: 'Master Data → Thêm/Sửa nhóm', chu_the: '', mo_ta: 'Form đầy đủ: mã hệ thống, điểm phân nhóm (tự động gợi ý nhóm 1/2/3), lịch gửi, SLA, email các cấp.' },
          { so: '2', ten: 'Lưu ý mã hệ thống', chu_the: '', mo_ta: 'Mã hệ thống phân biệt hoa/thường, dùng để xếp tệp trong kho và hiển thị trong bảng. Đặt xong không nên đổi.' },
          { so: '3', ten: 'Điểm phân nhóm', chu_the: '', mo_ta: 'GMV + Quy mô + Lịch sử tranh chấp + Độ phức tạp, mỗi tiêu chí 1-3 điểm. 3-5 điểm = nhóm 1 (tự chốt), 6-9 = nhóm 2, 10-12 = nhóm 3.' },
        ],
        chu_y: { loai: 'red', noi_dung: 'Tick "Ngưng hợp tác" để workflow bỏ qua nhóm đó. Không cần xóa — dữ liệu lịch sử vẫn giữ nguyên.' },
      },
      {
        tieu_de: 'Tra cứu thư đã gửi cho khách',
        mo_ta: 'Khi khách gọi lên hỏi "sao tôi nhận hai lần" hoặc "tôi chưa nhận được gì".',
        buoc: [
          { so: '1', ten: 'Mở Quản lý → Workflow', chu_the: '', mo_ta: 'Kéo xuống mục Lịch sử chạy gần đây.' },
          { so: '2', ten: 'Bấm vào dòng cần tra', chu_the: '', mo_ta: 'Cột Thư cho biết lượt đó gửi bao nhiêu thư. Bấm vào dòng để mở bảng chi tiết.' },
          { so: '3', ten: 'Đọc bảng thư', chu_the: '', mo_ta: 'Mỗi dòng ghi loại thư, nhóm khách, kỳ, địa chỉ nhận, danh sách CC, tiêu đề và thời điểm gửi.' },
          { so: '4', ten: 'Xem diễn biến nếu cần', chu_the: '', mo_ta: 'Phần "Diễn biến từng nhóm" giải thích vì sao nhóm nào đó bị bỏ qua hoặc lỗi.' },
        ],
        chu_y: { loai: 'stable', noi_dung: 'Đây là bằng chứng đối chiếu khi có tranh chấp: thư nào đã gửi, gửi lúc nào, tới địa chỉ nào.' },
      },
      {
        tieu_de: 'Xử lý sự cố workflow',
        mo_ta: 'Workflow → Lịch sử chạy gần đây cho thấy lượt nào lỗi và lý do.',
        buoc: [
          { so: '1', ten: 'Đọc cột Tóm tắt', chu_the: '', mo_ta: 'Hàng đỏ "Lỗi" thường do: Gmail mất kết nối (→ vào Cài đặt kết nối lại), hoặc tệp hỏng (→ yêu cầu kế toán upload lại).' },
          { so: '2', ten: 'Chạy thử tay', chu_the: '', mo_ta: 'Bấm "Chạy thử ngay" trên workflow bị lỗi. Đọc thông báo kết quả để biết cụ thể nhóm nào hỏng.' },
          { so: '3', ten: 'Kiểm tra Nhật ký', chu_the: '', mo_ta: 'Nhật ký → tab "Chuyển trạng thái" để thấy luồng dữ liệu. Tab "Thao tác người dùng" để tra ai đã can thiệp gì.' },
        ],
      },
      {
        tieu_de: 'Nhóm escalate và quy tắc tự động',
        mo_ta: '',
        bang: {
          header: ['Nhóm', 'Điểm', 'Số cấp nhắc', 'Số vòng', 'Sau hết vòng'],
          rows: [
            ['1', '3–5', 'L1 → L2', '1 vòng', 'Tự động chốt + báo khách'],
            ['2', '6–9', 'L1 → L2 → L3', '1 vòng', 'Kế toán quyết định'],
            ['3', '10–12', 'L1 → L2 → L3', '2 vòng', 'Kế toán quyết định'],
          ],
        },
        chu_y: { loai: 'teal', noi_dung: 'WF4 nhắc nội bộ ở D+1 và escalate lên cấp quản lý ở D+2 khi kế toán chậm upload tệp hoặc hồ sơ thanh toán.' },
      },
    ],
  },
];

// =====================================================================
// Component
// =====================================================================

/** Màu viền và nền cho tab vai trò, lấy thẳng từ token. */
const TONE: Record<string, { pill: string; bg: string; fg: string; border: string }> = {
  accent:   { pill: 'pill-watch',    bg: 'var(--accent-soft)',   fg: 'var(--accent-deep)', border: 'var(--accent)' },
  stable:   { pill: 'pill-stable',   bg: 'var(--stable-soft)',   fg: 'var(--stable)',      border: 'var(--stable)' },
  high:     { pill: 'pill-high',     bg: 'var(--high-soft)',     fg: 'var(--high)',        border: 'var(--high)' },
  critical: { pill: 'pill-critical', bg: 'var(--critical-soft)', fg: 'var(--critical)',    border: 'var(--critical)' },
};

const CALLOUT_MAP: Record<string, string> = {
  accent:   'callout callout-accent',
  violet:   'callout callout-accent',
  high:     'callout callout-high',
  amber:    'callout callout-high',
  stable:   'callout callout-stable',
  teal:     'callout callout-stable',
  critical: 'callout callout-critical',
  red:      'callout callout-critical',
};

function StepList({ buoc }: { buoc: any[] }) {
  return (
    <ol className="list-none m-0 p-0 space-y-3 mt-3">
      {buoc.map((b) => (
        <li key={b.so} className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent)] text-white text-[11px] font-bold
            flex items-center justify-center mt-0.5">
            {b.so}
          </span>
          <div>
            <p className="text-[13px] font-semibold m-0 text-[var(--ink)]">
              {b.ten}
              {b.chu_the && (
                <span className="ml-2 text-[11px] font-normal text-[var(--ink-3)]">— {b.chu_the}</span>
              )}
            </p>
            <p className="text-[13px] text-[var(--ink-2)] mt-0.5 mb-0 leading-relaxed">{b.mo_ta}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function DataTable({ bang }: { bang: { header: string[]; rows: string[][] } }) {
  return (
    <div className="overflow-x-auto mt-3 rounded-[var(--r-sm)] border border-[var(--line)]">
      <table className="tbl text-[12.5px]">
        <thead>
          <tr>{bang.header.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {bang.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={j === 0 ? 'font-semibold mono' : ''}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GuideContent() {
  const [activeSection, setActiveSection] = useState('tong-quan');
  const section = SECTIONS.find((s) => s.id === activeSection)!;
  const tone = TONE[section.color] ?? TONE.accent;

  return (
    <div className="flex gap-5 items-start">
      {/* Sidebar tabs */}
      <aside className="w-[190px] shrink-0">
        <nav className="card overflow-hidden sticky top-6">
          <div className="px-4 py-3 border-b border-[var(--line)]">
            <p className="eyebrow m-0">Vai trò</p>
          </div>
          <ul className="list-none m-0 p-2 space-y-0.5">
            {SECTIONS.map((s) => {
              const c = TONE[s.color] ?? TONE.accent;
              const isActive = s.id === activeSection;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setActiveSection(s.id)}
                    className={[
                      'w-full text-left px-3 py-[7px] rounded-[var(--r-sm)] text-[13px] font-medium',
                      'flex items-center gap-2 transition-colors',
                      'w-full text-left',
                    ].join(' ')}
                    style={isActive ? { background: c.bg, color: c.fg } : undefined}
                  >
                    <span className="text-base leading-none">{s.icon}</span>
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-3 border-t border-[var(--line)]">
            <p className="text-[11px] text-[var(--ink-3)] m-0 leading-relaxed">
              Hướng dẫn cập nhật theo SOP v1.0 tháng 7/2026.
            </p>
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Section header */}
        <div className="card overflow-hidden" style={{ borderLeft: `4px solid ${tone.border}` }}>
          <div className="px-5 py-4">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl leading-none">{section.icon}</span>
              <span className={`pill ${tone.pill}`}>{section.label}</span>
            </div>
            <p className="text-[13.5px] text-[var(--ink-2)] m-0 mt-1 leading-relaxed">
              {section.mo_ta}
            </p>
          </div>
        </div>

        {/* Content blocks */}
        {section.noi_dung.map((nd, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <h2 className="text-[14px] font-bold m-0 text-[var(--ink)]">{nd.tieu_de}</h2>
              {nd.mo_ta && (
                <p className="text-[12.5px] text-[var(--ink-3)] mt-1 mb-0 leading-relaxed">{nd.mo_ta}</p>
              )}
            </div>
            <div className="px-5 py-4 space-y-3">
              {(nd as any).buoc && <StepList buoc={(nd as any).buoc} />}
              {(nd as any).bang && <DataTable bang={(nd as any).bang} />}
              {(nd as any).chu_y && (
                <div className={CALLOUT_MAP[(nd as any).chu_y.loai] + ' mt-3'}>
                  <strong>Lưu ý: </strong>{(nd as any).chu_y.noi_dung}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
