import { NextResponse } from "next/server";
import { guard } from "@/lib/dashboard/server";
import { errMsg, fail } from "@/lib/dashboard/mobility";
import { goiMoHinh, TEN_MO_HINH } from "@/lib/tuan-thu/ai-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Hỏi AI" trên dashboard Mobility.
 *  Server chỉ gọi mô hình (dùng chung lớp gọi AI và khoá API với agent Tuân thủ). Công cụ đọc số liệu chạy trong trình duyệt
 *  của người hỏi, trên đúng dữ liệu dashboard họ đang xem: trang gửi lại kết quả công cụ ở lượt sau.
 *  Ghi: AI chỉ đề xuất (de_xuat_ghi); trang tự dựng thay đổi từ dữ liệu thật và ghi bằng quyền của người đang đăng nhập.
 *  Mốc làm đổi KPI (đồng ý ký, ký PL / HĐ mới, khởi tạo XPAY) chờ người nhắn bấm xác nhận. */

type Tool = { name: string; description: string; input_schema: any };
const S = (description: string) => ({ type: "string", description });
const B = (description: string) => ({ type: "boolean", description });
const N = (description: string) => ({ type: "integer", description });
const obj = (properties: Record<string, any>, required: string[] = []) => ({ type: "object", properties, required });

const TOOLS: Tool[] = [
  { name: "tim_khach", description: "Tìm khách hàng theo tên (gõ tắt, không dấu đều được), số hợp đồng, nhóm client hoặc tên người liên hệ. Trả về tối đa 15 khách: mã, tên, PIC, bước hiện tại. Dùng trước khi trả lời về một khách cụ thể; nếu ra nhiều khách cùng tên (ví dụ KPMG có nhiều pháp nhân) thì hỏi lại người dùng là khách nào.",
    input_schema: obj({ q: S("chuỗi cần tìm"), gioi_han: N("số khách tối đa, mặc định 15") }, ["q"]) },
  { name: "xem_khach", description: "Xem hồ sơ một khách theo mã (số hợp đồng hoặc mã XPAY-…): PIC, các mốc (đồng ý ký, ký phụ lục, ký HĐ mới, khởi tạo XPAY) kèm ngày, số thẻ XPAY, GMV XPAY 30 ngày, hạng Top 300, các hoạt động gần nhất, next step, meeting sắp tới.",
    input_schema: obj({ ma: S("mã khách") }, ["ma"]) },
  { name: "loc_khach", description: "Lọc và đếm khách theo điều kiện; trả về tổng số và danh sách (mặc định 20 khách đầu theo thứ tự sắp xếp). Mọi điều kiện không bắt buộc.",
    input_schema: obj({
      pic: S("tên PIC; 'chua_co' = chưa phân công"), da_ky: B("đã ký phụ lục / HĐ mới"), dong_y_ky: B("đã đồng ý ký (verbal)"), khoi_tao: B("đã khởi tạo XPAY"),
      co_the: B("đang có thẻ XPAY"), active_30: B("có giao dịch XPAY trong 30 ngày"), top300: B("thuộc Top 300"), co_meeting: B("đã có meeting"),
      next_step_qua_han: B("next step đã quá hạn"), sap_xep: { type: "string", enum: ["gmv30", "so_the", "hang_top300", "ten", "hoat_dong_gan_nhat"] }, gioi_han: N("tối đa 50"),
    }) },
  { name: "hoi_chon", description: "Hiện các khách để người dùng BẤM CHỌN khi tên nhắn tới khớp nhiều hồ sơ (ví dụ KPMG có nhiều pháp nhân). Tối đa 6 mã, xếp khả năng cao nhất lên đầu. Sau khi gọi thì dừng, chờ người dùng chọn.",
    input_schema: obj({ lua_chon: { type: "array", items: obj({ ma: S("mã khách") }, ["ma"]), description: "các khách để chọn" } }, ["lua_chon"]) },
  { name: "de_xuat_ghi", description: "Ghi thông tin người dùng vừa nhắn vào hồ sơ MỘT khách (đã xác định chắc chắn mã). Luôn kèm một hoạt động. Chỉ điền trường người dùng thật sự nói tới. Ngày dạng YYYY-MM-DD. Ghi chú, hãng đang đi, next step được lưu ngay (người dùng hoàn tác được); mốc đồng ý ký, ký phụ lục, ký HĐ mới, khởi tạo XPAY chờ người dùng xác nhận.",
    input_schema: obj({
      ma: S("mã khách"), cau_goc: S("câu người dùng nhắn, nguyên văn"),
      loai_hoat_dong: { type: "string", enum: ["note", "call", "email", "zalo", "meet"], description: "note = ghi nhận thông tin; call/email/zalo/meet khi người dùng nói đã gọi, email, nhắn, đã gặp khách" },
      ngay_hoat_dong: S("ngày diễn ra hoạt động, mặc định hôm nay"), ket_qua: S("kết quả ngắn, vd 'Đang đi hãng khác', 'Đồng ý ký', 'Hẹn gọi lại'"), noi_dung: S("nội dung chi tiết, diễn đạt lại gọn"),
      hang_dang_di: S("hãng taxi / gọi xe khách đang dùng thay XPAY, vd Vinasun, Xanh SM, Grab, Be"),
      dong_y_ky: S("ngày khách đồng ý ký (verbal)"), ky_phu_luc: S("ngày ký phụ lục"), ky_hd_moi: S("ngày ký hợp đồng mới"), khoi_tao_xpay: S("ngày khởi tạo XPAY"),
      next_step: obj({ viec: S("việc tiếp theo, vd 'Ký HĐ', 'Gọi lại', 'Gửi phụ lục'"), ngay: S("ngày làm") }, ["viec"]),
    }, ["ma", "cau_goc"]) },
  { name: "tong_quan", description: "Số liệu tổng của dashboard: tổng khách, đã ký, đồng ý ký, đã khởi tạo XPAY, có thẻ, active 30 ngày, GMV XPAY 30 ngày, tổng thẻ; và các số đó theo từng PIC.", input_schema: obj({}) },
];

const SYSTEM = (today: string, email: string, ctx: string) => `Bạn là "Hỏi AI" trên dashboard Mobility (XPAY) của Xperise. Người hỏi là nhân sự kinh doanh / quản lý (${email}). Hôm nay là ${today}.
Nhiệm vụ: trả lời câu hỏi về khách hàng và tiến độ triển khai XPAY dựa trên số liệu dashboard, đọc qua công cụ.
Quy tắc:
- Trả lời tiếng Việt, ngắn gọn, đi thẳng vào ý. Dùng gạch đầu dòng khi liệt kê. Số tiền ghi theo kiểu Việt Nam (1.234.000 đ, hoặc 12,5 triệu).
- Chỉ nói số liệu lấy từ kết quả công cụ trong cuộc trò chuyện này. Không đoán, không bịa. Thiếu dữ liệu thì nói rõ là dashboard chưa có.
- Khi nhắc tới một khách, viết dạng [[mã|tên ngắn]] để người dùng bấm mở hồ sơ, ví dụ [[20000025|KPMG]].
- Tên khách gõ tắt hoặc không dấu: dùng tim_khach. Ra nhiều khách thì liệt kê và hỏi lại khách nào, đừng tự chọn.
- Khi người dùng nhắn THÔNG TIN MỚI về khách (ví dụ "KPMG đi Vinasun", "đã gặp chị Lan bên Navigos, đồng ý ký, hẹn ký 5/12"), đó là yêu cầu ghi vào hồ sơ:
  1. Xác định khách: đang mở hồ sơ thì mặc định là khách đó; nếu không thì tim_khach. Đúng 1 khách thì ghi luôn. Nhiều khách khớp thì gọi hoi_chon rồi dừng, không tự chọn. Không tìm thấy thì nói rõ và hỏi lại tên.
  2. Gọi de_xuat_ghi một lần cho khách đó, chỉ điền trường người dùng nói tới. Đổi ngày tương đối ra ngày cụ thể theo hôm nay (năm hiện tại nếu không nói năm). Không tự bịa mốc hay ngày.
  3. Câu trả lời kèm theo chỉ 1–2 câu: nhắc điều đáng chú ý (ví dụ khách có thẻ mà chưa active nay đi hãng khác). Không lặp lại nội dung thẻ.
- Câu hỏi thì chỉ đọc, không gọi de_xuat_ghi. Không chắc người dùng muốn ghi hay hỏi thì hỏi lại.
- Dòng "(Hệ thống: …)" trong tin nhắn là trạng thái do trang ghi lại (đã lưu, hoàn tác, bỏ qua), không phải lời người dùng.
- Không đưa số thẻ, pantoken, số điện thoại hay email người liên hệ vào câu trả lời.
Bối cảnh màn hình người dùng đang xem: ${ctx || "không rõ"}.`;

export async function POST(req: Request) {
  try {
    const g = await guard(false, "m");
    if ("error" in g) return fail(g.error, g.status);
    const body = (await req.json().catch(() => ({}))) as { messages?: any[]; ctx?: string; today?: string };
    const messages = Array.isArray(body.messages) ? body.messages.slice(-40) : [];
    if (!messages.length) return fail("Chưa có câu hỏi", 400);
    if (JSON.stringify(messages).length > 400_000) return fail("Cuộc trò chuyện quá dài, bấm Cuộc mới để hỏi tiếp", 413, "too_long");
    const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || "") ? body.today! : new Date().toISOString().slice(0, 10);
    const r = await goiMoHinh({ system: SYSTEM(today, g.user.email, String(body.ctx || "").slice(0, 400)), messages, tools: TOOLS, max_tokens: 1500 });
    return NextResponse.json({ content: r.content, stop_reason: r.stop_reason, model: TEN_MO_HINH() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return fail(errMsg(e), 500); }
}
