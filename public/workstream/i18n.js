/* ==========================================================================
   XPERISE — WORKSTREAM INTELLIGENCE  ·  i18n.js
   Toàn bộ chữ hiển thị nằm ở đây. Sửa chữ chỉ cần sửa file này.
   Quy ước thuật ngữ:
     - Open / In Progress / Done, High / Medium / Low giữ nguyên tiếng Anh vì
       đây là giá trị lưu trong cơ sở dữ liệu, dịch đi sẽ lệch dữ liệu.
     - "Đầu mục" = work item · "Người phụ trách" = owner (không dùng PIC)
     - "Luồng chiến lược" = workstream · "Chỉ số rủi ro" = Risk Index (WRI)
   ========================================================================== */

const I18N = {

/* ======================= TIẾNG VIỆT ======================= */
vi: {
  /* --- thanh trên cùng --- */
  searchPh: "Tìm đầu mục hoặc người phụ trách…",
  newItem: "Thêm đầu mục",
  refresh: "Tải lại dữ liệu",
  tabOverview: "Tổng quan", tabNetwork: "Mạng lưới", tabStreams: "Luồng chiến lược",
  tabTimeline: "Dòng thời gian", tabBoard: "Bảng điều hành", tabList: "Danh sách",
  tabSystem: "Dữ liệu & hệ thống",
  tabListTip: "Số đầu mục đang hiển thị theo bộ lọc",
  tabSystemTip: "Số đầu mục còn thiếu ít nhất một trường dữ liệu",
  exportCsv: "Xuất CSV", printReport: "In báo cáo",

  /* --- nhãn dùng chung --- */
  owner: "Người phụ trách", status: "Trạng thái", priority: "Mức ưu tiên",
  stream: "Luồng chiến lược", riskLevel: "Mức rủi ro",
  dateFrom: "Từ ngày", dateTo: "Đến ngày",
  all: "Tất cả", itemsUnit: "đầu mục", unassigned: "Chưa phân công",
  noDueDate: "Chưa đặt hạn", noStreamYet: "Chưa phân luồng",
  signature: "Biểu đồ đặc trưng",

  /* --- tóm tắt điều hành --- */
  execEyebrow: "Tóm tắt điều hành · cập nhật tự động",
  exec: {
    empty: "Danh mục chưa có đầu mục nào. Thêm công việc đầu tiên để hệ thống bắt đầu chấm rủi ro.",
    allDone: n => `Cả ${n} đầu mục đều đã hoàn thành. Không còn rủi ro tiến độ nào đang mở.`,
    level: (band, wri, n) => `Danh mục đang ở mức <em>${band}</em> — chỉ số rủi ro <b>${wri}/100</b> trên ${n} đầu mục đang chạy.`,
    overdue: n => `${n} đã quá hạn`,
    dueSoon: (n, d) => `${n} đến hạn trong ${d} ngày tới`,
    critical: n => `${n} ở mức nguy cấp`,
    noAlarms: "Không có đầu mục nào quá hạn hay ở mức nguy cấp.",
    concentrated: (c, name, p, hhi) => `Khối lượng công việc <em>${c}</em>: ${name} đang giữ <b>${p}%</b> (HHI ${hhi}).`,
    even: (n, hhi, base) => `Khối lượng công việc chia tương đối đều cho ${n} người (HHI ${hhi}, mức chia đều là ${base}).`,
    noDue: n => `${n} đầu mục chưa đặt hạn nên chưa thể xếp lịch.`,
    dataThin: p => `Mới <b>${p}%</b> thông tin mô tả được điền, nên bức tranh rủi ro có thể chưa đầy đủ.`,
    dataOk: p => `Thông tin đã điền <b>${p}%</b>, đủ để chỉ số phản ánh sát tình hình.`,
    progress: (pc, d, tt) => `Khối lượng đã xong <b>${pc}%</b> (${d}/${tt} hạng mục nhỏ).`,
    drift: (pc, d, tt, el, gap) => `Mới xong <b>${pc}%</b> khối lượng (${d}/${tt} hạng mục) nhưng đã dùng <b>${el}%</b> thời gian — lệch <em>${gap} điểm</em>.`
  },
  concLevels: { solo: "dồn hết vào một người", tight: "rất tập trung", some: "khá tập trung", even: "chia đều" },
  noAlerts: "Không có cảnh báo nào đang mở.",

  /* --- chỉ số --- */
  kpiActive: "Đang chạy", kpiActiveSub: n => `trên tổng ${n} đầu mục`,
  kpiRisk: "Chỉ số rủi ro", kpiRiskSub: b => `thang 0–100 · mức ${b}`,
  kpiCritical: "Nguy cấp", kpiCriticalSub: m => `chỉ số từ ${m} trở lên`,
  kpiOverdue: "Quá hạn", kpiOverdueSub: "đã trôi qua hạn chốt",
  kpiDueSoon: d => `Đến hạn trong ${d} ngày`, kpiDueSoonSub: "cần chốt trong tuần",
  kpiData: "Độ đầy đủ thông tin", kpiDataSub: (a, b) => `${a}/${b} ô đã điền`,

  /* --- bộ lọc --- */
  filterEyebrow: "Bộ lọc chung", clearFilters: "Xóa bộ lọc",
  viewingAll: "Đang xem toàn bộ danh mục",
  viewingFiltered: (a, b, bits) => `${a}/${b} đầu mục · ${bits}`,
  filterCleared: "Đã xóa bộ lọc",
  flags: {
    overdue: "Quá hạn", dueSoon: "Đến hạn trong tuần", critical: "Nguy cấp",
    highPrio: "Ưu tiên cao", noStart: "Chưa có ngày bắt đầu", noDue: "Chưa đặt hạn",
    notStarted: "Chưa khởi động", running: "Đang chạy dở",
    nearlyDone: "Sắp hoàn tất", drifting: "Chậm so với lịch"
  },

  /* --- tổng quan --- */
  riskMapTitle: "Bản đồ rủi ro",
  riskMapNote: "Ngang: số ngày còn lại đến hạn · Dọc: chỉ số rủi ro",
  axisDays: "Số ngày còn lại", axisRisk: "Chỉ số rủi ro", axisNoDue: "chưa đặt hạn",
  legendSize: "Chấm to nhỏ theo mức ưu tiên",
  triageEyebrow: "Thứ tự xử lý", triageTitle: "5 việc nên chạm trước",
  triageAllSet: "Thông tin đã đủ",
  workloadTitle: "Khối lượng theo người",
  hhiLabel: "Mức tập trung công việc (HHI)",
  hhiSolo: "Chỉ một người đang gánh toàn bộ",
  hhiNote: (c, n, base) => `${c} — chia đều cho ${n} người thì HHI là ${base}`,
  mixTitle: "Cơ cấu danh mục",
  dueTitle: "Mật độ đến hạn",
  dueBuckets: ["Quá hạn", "Tuần này", "2 tuần", "Trong tháng", "Sau đó", "Chưa đặt hạn"],
  dueNoteHot: "Cột đỏ và cam là phần cần quyết định ngay trong tuần.",
  dueNoteCalm: "Không có đầu mục nào đến hạn trong tuần này.",
  noItemsInFilter: "Không có đầu mục nào khớp bộ lọc hiện tại.",
  noOpenItems: "Không còn đầu mục nào đang chạy.",
  noOwners: "Chưa có ai được phân công.",

  /* --- mạng lưới --- */
  networkTitle: "Mạng lưới phụ thuộc",
  modeDep: "Phụ thuộc", modeOwn: "Sở hữu",
  cpEyebrow: "Đường găng", cpTitle: "Chuỗi quyết định tiến độ",
  netNoteOwn: "Đường nối thể hiện ai đang phụ trách việc gì. Bấm vào một người để lọc cả dashboard.",
  netNoteConfirmed: "Đường liền là liên kết đã được xác nhận.",
  netNoteSuggested: "Đường đứt nét là liên kết mới ở mức gợi ý, chưa được xác nhận.",
  legendDeps: "Số nhỏ = số việc đang chờ việc này xong",
  cpIntro: "Chưa có liên kết phụ thuộc nào được xác nhận nên chưa dựng được đường găng. Dưới đây là các liên kết hệ thống gợi ý, kèm căn cứ, để anh duyệt.",
  cpNone: "Chưa thấy dấu hiệu phụ thuộc nào giữa các đầu mục hiện có.",
  cpChain: "Chuỗi dài nhất trong mạng phụ thuộc — trễ một mắt xích là trễ cả chuỗi.",
  evNote: (title, word) => `Ghi chú của “${title}” có nhắc tới “${word}”`,
  evStream: (s, a, b) => `Cùng luồng ${s} · ${a} → ${b}`,
  evTagNote: "có căn cứ trong dữ liệu", evTagStream: "cùng luồng, theo thứ tự ngày",
  confirmLink: "Xác nhận liên kết",
  linkSaved: "Đã lưu liên kết lên cơ sở dữ liệu",
  linkSession: "Đã ghi nhận liên kết trong phiên này. Chạy đoạn SQL ở tab Dữ liệu & hệ thống để lưu lâu dài.",

  /* --- luồng chiến lược --- */
  streamsEyebrow: "Danh mục theo luồng", streamsTitle: "Luồng chiến lược",
  newStream: "Tạo luồng mới",
  streamFootnote: "Dấu ~ nghĩa là luồng do hệ thống tự suy ra từ tiêu đề, chưa ai xác nhận. Mở một đầu mục để đặt lại.",
  streamLead: "Người chủ lực", streamShare: p => `${p}% khối lượng`,
  streamNext: "Mốc gần nhất", streamOverdue: "Quá hạn",
  streamOnTrack: "đang đúng lịch", streamNeedsAction: "cần xử lý ngay",
  newStreamPrompt: "Tên luồng chiến lược mới:",
  streamAdded: n => `Đã thêm luồng “${n}”. Mở một đầu mục để gán vào luồng này.`,
  streamExists: "Luồng này đã có rồi.",

  /* --- dòng thời gian --- */
  timelineEyebrow: "Dòng thời gian", timelineTitle: "Lịch bàn giao theo ngày",
  timelineNote: "Hình thoi = chỉ có hạn chốt, chưa có ngày bắt đầu",
  colItemHead: "Đầu mục", noDueBar: "chưa đặt hạn",

  /* --- bảng điều hành --- */
  boardEyebrow: "Bảng điều hành", boardTitle: "Kéo thả để đổi trạng thái",
  boardNoteLive: "Thay đổi được lưu ngay và mọi biểu đồ cập nhật theo",
  boardNoteDemo: "Đang dùng dữ liệu mẫu — thay đổi chỉ tồn tại trong phiên này",
  boardMoved: (t, s) => `“${t}” chuyển sang ${s}`,

  /* --- danh sách --- */
  listEyebrow: "Danh sách chi tiết", listNote: "Bấm tên đầu mục để mở chi tiết",
  colItem: "Đầu mục", colRisk: "Rủi ro", colOwner: "Phụ trách", colDue: "Hạn chốt",
  colPriority: "Ưu tiên", colStatus: "Trạng thái", colNext: "Bước tiếp theo",
  nextDone: "Chỉ còn hoàn thiện",
  dtInfo: "Đang xem _START_–_END_ trên _TOTAL_", dtInfoEmpty: "Không có đầu mục nào",
  dtEmpty: "Chưa có đầu mục nào.", dtZero: "Không có đầu mục nào khớp bộ lọc.",
  dtFirst: "Đầu", dtLast: "Cuối", dtNext: "Sau", dtPrev: "Trước",

  /* --- dữ liệu & hệ thống --- */
  qualityEyebrow: "Chất lượng dữ liệu", qualityTitle: "Độ đầy đủ theo trường",
  qualityNote: "Bấm một đầu mục để bổ sung ngay",
  qualityFoot: n => `${n} đầu mục còn thiếu ít nhất một trường — đây chính là con số trên thẻ “Dữ liệu & hệ thống”. Trường “Bước tiếp theo” không tính vào đây, vì để trống là hợp lệ.`,
  qFields: { timeline_end: "Hạn chốt", timeline_start: "Ngày bắt đầu", description: "Mô tả" },
  qFilled: (a, b) => `${a}/${b} đã điền`, qMore: n => `+${n} đầu mục nữa`,

  systemEyebrow: "Hệ thống", systemTitle: "Mở rộng kết nối",
  conn: {
    stream: "Luồng chiến lược",
    streamOn: "Đã có cột `stream` — luồng được lưu cùng đầu mục",
    streamOff: "Đang suy ra từ tiêu đề, chưa lưu vào cơ sở dữ liệu",
    dep: "Liên kết phụ thuộc",
    depOn: "Đã có cột `blocked_by` — liên kết được lưu lâu dài",
    depOff: "Liên kết chỉ tồn tại trong phiên này",
    prog: "Tiến độ %",
    progOn: "Đã có cột `progress`",
    progOff: "Chưa bật — tiến độ đang suy ra từ trạng thái",
    live: "Đồng bộ tức thời",
    liveOn: "Đang chạy — đã nhận được thay đổi thật từ cơ sở dữ liệu",
    livePending: "Đã mở kênh nhưng chưa nhận tín hiệu nào. Mở app ở hai tab rồi sửa một đầu mục để kiểm chứng.",
    liveOff: "Chưa bật — cần tải lại trang mới thấy thay đổi của người khác"
  },
  connAllOn: "Toàn bộ lớp kết nối đã bật. Luồng và liên kết được chia sẻ cho cả đội.",
  connSetup: "Dán đoạn SQL này vào Supabase → SQL Editor → Run, rồi tải lại trang. App tự nhận cột mới, không cần sửa code.",
  copySql: "Sao chép SQL", sqlCopied: "Đã sao chép SQL", sqlCopyFail: "Trình duyệt chặn sao chép — bôi đen rồi copy tay nhé",

  formulaEyebrow: "Minh bạch cách tính", formulaTitle: "Chỉ số rủi ro (WRI) được tính thế nào",
  formulaIntro: (n, cap) => `Chỉ số cộng ${n} thành phần độc lập rồi giới hạn ở ${cap}. Đầu mục đã Done luôn bằng 0. Thành phần thứ tư là điểm phạt khi thiếu thông tin — một đầu mục không mô tả, không ngày bắt đầu thì không ai điều hành được. Ô “Bước tiếp theo” để trống không bị phạt: đó là cách ghi hợp lệ khi việc chỉ còn chờ hoàn thiện.`,
  fSchedule: "Áp lực lịch", fPriority: "Trọng số ưu tiên", fStatus: "Độ ì trạng thái", fData: "Thiếu thông tin",
  fNoDue: "Chưa đặt hạn", fOverdue: "Đã quá hạn", fWithin: d => `Còn ≤ ${d} ngày`, fBeyond: "Còn hơn 30 ngày",
  fMissStart: "Chưa có ngày bắt đầu", fMissDesc: "Chưa có mô tả",

  /* --- form --- */
  modalNew: "Thêm đầu mục", modalEdit: "Sửa đầu mục",
  modalNewSub: "Trạng thái mặc định là Open",
  modalEditSub: (s, b) => `Chỉ số rủi ro hiện tại ${s}/100 · mức ${b}`,
  fTitle: "Tên đầu mục", fDesc: "Mô tả", fStart: "Ngày bắt đầu", fEnd: "Hạn chốt",
  fOwner: "Người phụ trách", fOwnerPh: "Nhiều người thì ngăn bằng dấu phẩy",
  fNext: "Bước tiếp theo", fNextPh: "Để trống nếu chỉ còn hoàn thiện nốt — không bị tính là rủi ro",
  streamAuto: "— để hệ thống tự suy ra —", streamCreate: "＋ Tạo luồng mới…",
  streamHintOn: "Để trống thì luồng được suy ra từ tiêu đề.",
  streamHintOff: "Chưa có cột `stream` trên cơ sở dữ liệu nên luồng đang suy ra tạm. Chạy SQL ở tab Dữ liệu & hệ thống để bật.",
  wriPreview: "Chỉ số rủi ro dự kiến",
  save: "Lưu", cancel: "Hủy", deleteItem: "Xóa đầu mục",
  errDates: "Hạn chốt đang sớm hơn ngày bắt đầu. Anh chỉnh lại giúp nhé.",

  /* --- gợi ý tìm kiếm, lọc cục bộ, sửa nhanh --- */
  suggItems: "Đầu mục", suggOwners: "Người phụ trách",
  suggNone: "Không tìm thấy kết quả nào",
  suggHintOpen: "mở chi tiết", suggHintFilter: "lọc theo người này",
  localResetPic: n => `Đang lọc: ${n}`,
  localResetStatus: s => `Đang lọc: ${s}`,
  localResetPrio: p => `Đang lọc ưu tiên: ${p}`,
  localResetDue: "Đang lọc theo hạn",
  localResetTip: "Bỏ lọc này",
  wlItems: n => `${n} đầu mục đang chạy`,
  wlAvg: "Rủi ro trung bình",
  wlNext: "Hạn gần nhất",
  wlNextNone: "Chưa có hạn nào",
  wlHint: "Rê chuột để xem nhanh · bấm để lọc cả trang theo người này",
  wlMore: n => `+${n} đầu mục khác`,
  fieldSaved: f => `Đã cập nhật ${f}`,
  fieldStatus: "trạng thái", fieldPriority: "mức ưu tiên",
  fieldDue: "hạn chốt", fieldOwner: "người phụ trách",
  editHint: "Bấm để sửa",
  clearDue: "Xóa hạn chốt",
  cpConfirmed: "Liên kết đã xác nhận",
  cpMore: "Gợi ý thêm",
  cpNoMore: "Không còn gợi ý nào. Ghi rõ hơn ở ô Bước tiếp theo để hệ thống tìm thêm liên kết.",
  linkConfirmed: "đã xác nhận",
  removeLink: "Gỡ liên kết",
  linkRemoved: "Đã gỡ liên kết",
  manageStreams: "Quản lý luồng chiến lược",
  streamInUse: n => n ? `${n} đầu mục` : "chưa dùng",
  deleteStream: "Xóa luồng này",
  streamDeleteConfirm: (name, n) => n
    ? `Xóa luồng "${name}"?\n\n${n} đầu mục đang thuộc luồng này sẽ được gỡ về chế độ tự suy ra. Không đầu mục nào bị mất.`
    : `Xóa luồng "${name}"? Hiện chưa có đầu mục nào dùng luồng này.`,
  streamDeleted: name => `Đã xóa luồng "${name}"`,
  streamRestore: "Khôi phục các luồng mặc định đã xóa",
  streamRestored: "Đã khôi phục luồng mặc định",
  streamNoneLeft: "Không còn luồng nào. Tạo luồng mới hoặc khôi phục luồng mặc định.",
  /* --- hạng mục nhỏ & tiến độ --- */
  subTitle: "Hạng mục nhỏ", subAdd: "Thêm hạng mục", subAddPh: "Việc cần làm để hoàn thành đầu mục này…",
  subNone: "Chưa chia nhỏ. Thêm hạng mục để theo dõi tiến độ chi tiết.",
  subSaveFirst: "Lưu đầu mục trước, rồi mở lại để thêm hạng mục nhỏ.",
  subOwnerPh: "Người làm", subToggle: "Đánh dấu xong", subDelete: "Xóa hạng mục",
  subNeedStart: "Thêm ngày bắt đầu để hệ thống đo được lệch tiến độ.",
  noSubs: "chưa chia nhỏ", colProgress: "Tiến độ", expandRow: "Xem hạng mục nhỏ",
  progressLabel: "Tiến độ thực hiện",
  subsDone: (d, t) => `${d}/${t} hạng mục xong`,
  timeElapsed: p => `${p}% thời gian đã trôi`,
  driftAlert: (gap, el, done) => `Lệch tiến độ ${gap} điểm — đã dùng ${el}% thời gian nhưng mới xong ${done}% khối lượng.`,
  driftLateSubs: n => `${n} hạng mục đã quá hạn.`,
  kpiProgress: "Tiến độ", 
  kpiProgressSub: (d, t, e) => `${d}/${t} hạng mục · ${e}% thời gian`,
  kpiProgressSubPlain: (d, t) => `${d}/${t} hạng mục`,
  fDrift: "Lệch tiến độ", fDriftOk: "Đúng hoặc vượt tiến độ",
  fDrift50: "Chậm hơn 50 điểm", fDrift30: "Chậm hơn 30 điểm", fDrift15: "Chậm hơn 15 điểm",
  driftNote: "Chỉ chấm cho đầu mục đã chia nhỏ và có đủ ngày bắt đầu, hạn chốt.",
  thDueSoon: "Số ngày coi là sắp đến hạn", thDrift: "Mức lệch bắt đầu cảnh báo",
  weightResetBtn: "Khôi phục điểm mặc định",
  weightResetConfirm: "Đưa toàn bộ bảng điểm và ngưỡng về mặc định?",
  weightReset: "Đã khôi phục bảng điểm mặc định",
  subNoTable: "Chưa có bảng hạng mục nhỏ trên Supabase. Chạy đoạn SQL tạo bảng rồi tải lại trang — nếu không, dữ liệu nhập vào sẽ mất khi tải lại.",
  subCopySql: "Sao chép SQL tạo bảng",
  sqlCopied: "Đã sao chép SQL",
  sqlCopyFail: "Trình duyệt chặn sao chép — mở tab Dữ liệu & hệ thống để lấy SQL",
  progTip: (d, tt, dp, ep) => ep === null
    ? `Đã xong ${d}/${tt} hạng mục nhỏ (${dp}%)`
    : `Đã xong ${d}/${tt} hạng mục nhỏ (${dp}%) · thời gian đã trôi ${ep}%`,
  subMore: n => `+${n} hạng mục nhỏ khác`,
  triageNextSub: title => `Việc con đang dở: ${title}`,
  wlSubs: "Hạng mục nhỏ",
  wlOwnSubs: n => `${n} hạng mục nhỏ đứng tên người này`,
  csvSubHead: ["Đầu mục cha","Luồng","Hạng mục nhỏ","Đã xong","Người phụ trách","Hạn"],
  subDuplicate: "Đầu mục này đã có hạng mục nhỏ trùng tên",
  msSearch: "Tìm…", msAll: "Chọn tất cả", msNone: "Bỏ chọn",
  msCount: (first, more) => `${first} +${more}`,
  delete: "Xóa",
  subColTitle: "Hạng mục nhỏ", subNotePh: "Ghi chú thêm…",
  subAddPh: "Nhập tên hạng mục nhỏ rồi nhấn Enter",
  subAddHint: "Enter để thêm", subToggle: "Đánh dấu hoàn thành",
  subDeleteConfirm: n => `Xóa "${n}"?`,
  subNeedV4: "Chạy migrate_v4.sql để nhập được mô tả, mức ưu tiên và trạng thái cho hạng mục nhỏ.",
  sortBy: "Sắp xếp theo", sortRemove: "Bỏ bậc này", sortReset: "Đặt lại",
  sortHint: "Giữ Shift rồi bấm tiêu đề cột để thêm bậc sắp xếp",
  errNoOwner: "Đầu mục phải có người phụ trách",
  errDateOrder: "Hạn chốt đang sớm hơn ngày bắt đầu",
  errSave: m => `Lưu không thành công: ${m}`,
  errLoad: m => `Không đọc được dữ liệu: ${m}`,
  errDelete: m => `Xóa không thành công: ${m}`,
  confirmDelete: t => `Xóa “${t}”? Thao tác này không hoàn tác được.`,
  savedNew: "Đã thêm đầu mục", savedEdit: "Đã cập nhật đầu mục", deleted: "Đã xóa đầu mục",
  savedDemo: "Đã lưu (dữ liệu mẫu, chưa ghi lên cơ sở dữ liệu)",
  reloaded: "Đã tải lại", exported: n => `Đã xuất ${n} đầu mục`,

  demoNotice: 'Đang chạy <strong>dữ liệu mẫu</strong> để anh xem trước. Điền <code>SUPABASE_URL</code> và <code>SUPABASE_ANON_KEY</code> ở đầu file <code>app.js</code> để nối vào dữ liệu thật.',
  footNote: "Mọi chỉ số tính trực tiếp từ dữ liệu thật, không ước lượng",

  csvHead: ["Đầu mục","Người phụ trách","Luồng","Ngày bắt đầu","Hạn chốt","Ưu tiên","Trạng thái","Bước tiếp theo","Mô tả","Chỉ số rủi ro","Mức rủi ro","Số hạng mục nhỏ","Đã xong","Tiến độ","Lệch lịch"],
  reason: {
    done: "Đã hoàn thành", noDue: "chưa đặt hạn",
    overdue: n => `quá hạn ${n} ngày`, dueToday: "đến hạn hôm nay", left: n => `còn ${n} ngày`,
    startsIn: n => `${n} ngày nữa mới bắt đầu`
  },
  bands: { critical: "Nguy cấp", high: "Cao", watch: "Theo dõi", stable: "Ổn định" },
  streams: { product: "Sản phẩm & Nền tảng", partner: "Đối tác & Phân phối",
             capital: "Vốn & Nhà đầu tư", presence: "Hiện diện & Vận hành" }
},

/* ======================= ENGLISH ======================= */
en: {
  searchPh: "Search work items or owners…",
  newItem: "New work item",
  refresh: "Reload data",
  tabOverview: "Overview", tabNetwork: "Network", tabStreams: "Workstreams",
  tabTimeline: "Timeline", tabBoard: "Board", tabList: "List",
  tabSystem: "Data & system",
  tabListTip: "Work items currently shown under the filter",
  tabSystemTip: "Work items missing at least one data field",
  exportCsv: "Export CSV", printReport: "Print report",

  owner: "Owner", status: "Status", priority: "Priority",
  stream: "Workstream", riskLevel: "Risk level",
  dateFrom: "From", dateTo: "To",
  all: "All", itemsUnit: "work items", unassigned: "Unassigned",
  noDueDate: "No due date", noStreamYet: "Unassigned stream",
  signature: "Signature view",

  execEyebrow: "Executive summary · auto-generated",
  exec: {
    empty: "No work items yet. Add the first one and the system will start scoring risk.",
    allDone: n => `All ${n} work items are complete. No schedule risk remains open.`,
    level: (band, wri, n) => `Portfolio risk is <em>${band}</em> — index <b>${wri}/100</b> across ${n} active work items.`,
    overdue: n => `${n} past due`,
    dueSoon: (n, d) => `${n} due within ${d} days`,
    critical: n => `${n} at critical level`,
    noAlarms: "Nothing is past due or at critical level.",
    concentrated: (c, name, p, hhi) => `Workload is <em>${c}</em>: ${name} holds <b>${p}%</b> (HHI ${hhi}).`,
    even: (n, hhi, base) => `Workload is spread fairly evenly across ${n} owners (HHI ${hhi}, even split would be ${base}).`,
    noDue: n => `${n} work items have no due date, so they cannot be scheduled yet.`,
    dataThin: p => `Only <b>${p}%</b> of descriptive fields are filled in, so the risk picture may be incomplete.`,
    dataOk: p => `Fields are <b>${p}%</b> complete, enough for the index to track reality closely.`,
    progress: (pc, d, tt) => `Work is <b>${pc}%</b> complete (${d}/${tt} subtasks).`,
    drift: (pc, d, tt, el, gap) => `Only <b>${pc}%</b> of the work is done (${d}/${tt} subtasks) but <b>${el}%</b> of the time is spent — a drift of <em>${gap} points</em>.`
  },
  concLevels: { solo: "held entirely by one person", tight: "highly concentrated", some: "fairly concentrated", even: "evenly split" },
  noAlerts: "No open alerts.",

  kpiActive: "Active", kpiActiveSub: n => `of ${n} total`,
  kpiRisk: "Risk index", kpiRiskSub: b => `0–100 scale · ${b}`,
  kpiCritical: "Critical", kpiCriticalSub: m => `index ${m} and above`,
  kpiOverdue: "Past due", kpiOverdueSub: "deadline has passed",
  kpiDueSoon: d => `Due within ${d} days`, kpiDueSoonSub: "needs closing this week",
  kpiData: "Field completeness", kpiDataSub: (a, b) => `${a}/${b} fields filled`,

  filterEyebrow: "Global filter", clearFilters: "Clear filters",
  viewingAll: "Viewing the full portfolio",
  viewingFiltered: (a, b, bits) => `${a}/${b} work items · ${bits}`,
  filterCleared: "Filters cleared",
  flags: {
    overdue: "Past due", dueSoon: "Due this week", critical: "Critical",
    highPrio: "High priority", noStart: "No start date", noDue: "No due date",
    notStarted: "Not started", running: "In progress",
    nearlyDone: "Nearly done", drifting: "Behind schedule"
  },

  riskMapTitle: "Risk map",
  riskMapNote: "Horizontal: days to deadline · Vertical: risk index",
  axisDays: "Days remaining", axisRisk: "Risk index", axisNoDue: "no due date",
  legendSize: "Marker size = priority",
  triageEyebrow: "Triage order", triageTitle: "Top 5 to touch first",
  triageAllSet: "All fields complete",
  workloadTitle: "Workload by owner",
  hhiLabel: "Workload concentration (HHI)",
  hhiSolo: "One person is carrying everything",
  hhiNote: (c, n, base) => `${c} — an even split across ${n} owners would be ${base}`,
  mixTitle: "Portfolio mix",
  dueTitle: "Deadline density",
  dueBuckets: ["Past due", "This week", "2 weeks", "This month", "Later", "No due date"],
  dueNoteHot: "Red and amber bars need a decision this week.",
  dueNoteCalm: "Nothing falls due this week.",
  noItemsInFilter: "No work items match the current filter.",
  noOpenItems: "No active work items left.",
  noOwners: "Nobody has been assigned yet.",

  networkTitle: "Dependency network",
  modeDep: "Dependencies", modeOwn: "Ownership",
  cpEyebrow: "Critical path", cpTitle: "What actually paces delivery",
  netNoteOwn: "Lines show who owns what. Click an owner to filter the whole dashboard.",
  netNoteConfirmed: "Solid lines are confirmed dependencies.",
  netNoteSuggested: "Dashed lines are suggestions only — not yet confirmed.",
  legendDeps: "Small number = work items waiting on this one",
  cpIntro: "No dependency has been confirmed yet, so no critical path can be drawn. Below are links the system suggests, each with its evidence, for you to approve.",
  cpNone: "No sign of dependencies between the current work items.",
  cpChain: "Longest chain in the network — a slip on any link slips the whole chain.",
  evNote: (title, word) => `Notes on “${title}” mention “${word}”`,
  evStream: (s, a, b) => `Same ${s} stream · ${a} → ${b}`,
  evTagNote: "grounded in the data", evTagStream: "same stream, sequential dates",
  confirmLink: "Confirm dependency",
  linkSaved: "Dependency saved to the database",
  linkSession: "Dependency recorded for this session. Run the SQL on the Data & system tab to make it permanent.",

  streamsEyebrow: "Portfolio by stream", streamsTitle: "Workstreams",
  newStream: "New workstream",
  streamFootnote: "A ~ marks a stream the system inferred from the title, not yet confirmed. Open a work item to set it.",
  streamLead: "Lead owner", streamShare: p => `${p}% of the load`,
  streamNext: "Next milestone", streamOverdue: "Past due",
  streamOnTrack: "on schedule", streamNeedsAction: "needs attention now",
  newStreamPrompt: "Name of the new workstream:",
  streamAdded: n => `Added “${n}”. Open a work item to assign it to this stream.`,
  streamExists: "That workstream already exists.",

  timelineEyebrow: "Timeline", timelineTitle: "Delivery schedule by date",
  timelineNote: "Diamond = due date only, no start date set",
  colItemHead: "Work item", noDueBar: "no due date",

  boardEyebrow: "Board", boardTitle: "Drag to change status",
  boardNoteLive: "Changes save immediately and every chart follows",
  boardNoteDemo: "Sample data — changes only last for this session",
  boardMoved: (t, s) => `“${t}” moved to ${s}`,

  listEyebrow: "Detailed list", listNote: "Click a title to open details",
  colItem: "Work item", colRisk: "Risk", colOwner: "Owner", colDue: "Due date",
  colPriority: "Priority", colStatus: "Status", colNext: "Next step",
  nextDone: "Just needs finishing",
  dtInfo: "Showing _START_–_END_ of _TOTAL_", dtInfoEmpty: "No work items",
  dtEmpty: "No work items yet.", dtZero: "No work items match the filter.",
  dtFirst: "First", dtLast: "Last", dtNext: "Next", dtPrev: "Prev",

  qualityEyebrow: "Data quality", qualityTitle: "Completeness by field",
  qualityNote: "Click a work item to fill it in",
  qualityFoot: n => `${n} work items are missing at least one field — that is the number on the “Data & system” tab. “Next step” is excluded, because leaving it blank is a valid answer.`,
  qFields: { timeline_end: "Due date", timeline_start: "Start date", description: "Description" },
  qFilled: (a, b) => `${a}/${b} filled`, qMore: n => `+${n} more`,

  systemEyebrow: "System", systemTitle: "Extend the connection",
  conn: {
    stream: "Workstreams",
    streamOn: "`stream` column present — streams saved with each work item",
    streamOff: "Inferred from titles, not stored in the database",
    dep: "Dependency links",
    depOn: "`blocked_by` column present — links stored permanently",
    depOff: "Links only exist for this session",
    prog: "Progress %",
    progOn: "`progress` column present",
    progOff: "Not enabled — progress inferred from status",
    live: "Live sync",
    liveOn: "Running — a real change has come through from the database",
    livePending: "Channel open but no signal received yet. Open the app in two tabs and edit an item to verify.",
    liveOff: "Not enabled — reload the page to see other people's changes"
  },
  connAllOn: "The full connected layer is on. Streams and dependencies are shared across the team.",
  connSetup: "Paste this SQL into Supabase → SQL Editor → Run, then reload. The app picks up the new columns on its own.",
  copySql: "Copy SQL", sqlCopied: "SQL copied", sqlCopyFail: "Browser blocked the clipboard — select and copy manually",

  formulaEyebrow: "How the number is built", formulaTitle: "How the Risk Index (WRI) is calculated",
  formulaIntro: (n, cap) => `The index adds ${n} independent components and caps at ${cap}. Anything marked Done scores 0. The fourth component penalises missing information — a work item with no description and no start date cannot be managed. A blank “Next step” carries no penalty: it is a valid way of saying the item just needs finishing.`,
  fSchedule: "Schedule pressure", fPriority: "Priority weight", fStatus: "Status inertia", fData: "Missing information",
  fNoDue: "No due date", fOverdue: "Past due", fWithin: d => `${d} days or fewer left`, fBeyond: "More than 30 days left",
  fMissStart: "No start date", fMissDesc: "No description",

  modalNew: "New work item", modalEdit: "Edit work item",
  modalNewSub: "Status defaults to Open",
  modalEditSub: (s, b) => `Current risk index ${s}/100 · ${b}`,
  fTitle: "Title", fDesc: "Description", fStart: "Start date", fEnd: "Due date",
  fOwner: "Owner", fOwnerPh: "Separate multiple owners with commas",
  fNext: "Next step", fNextPh: "Leave blank if it only needs finishing — no risk penalty",
  streamAuto: "— let the system infer it —", streamCreate: "＋ Create a new workstream…",
  streamHintOn: "Leave blank and the stream is inferred from the title.",
  streamHintOff: "No `stream` column in the database yet, so streams are inferred temporarily. Run the SQL on the Data & system tab to enable it.",
  wriPreview: "Projected risk index",
  save: "Save", cancel: "Cancel", deleteItem: "Delete work item",
  errDates: "The due date falls before the start date. Please adjust.",

  /* --- search suggestions, local filters, quick edit --- */
  suggItems: "Work items", suggOwners: "Owners",
  suggNone: "No matches found",
  suggHintOpen: "open details", suggHintFilter: "filter by this owner",
  localResetPic: n => `Filtered: ${n}`,
  localResetStatus: s => `Filtered: ${s}`,
  localResetPrio: p => `Priority: ${p}`,
  localResetDue: "Filtered by due date",
  localResetTip: "Clear this filter",
  wlItems: n => `${n} active work items`,
  wlAvg: "Average risk",
  wlNext: "Next deadline",
  wlNextNone: "No deadline set",
  wlHint: "Hover for a quick look · click to filter the whole page by this owner",
  wlMore: n => `+${n} more work items`,
  fieldSaved: f => `${f} updated`,
  fieldStatus: "Status", fieldPriority: "Priority",
  fieldDue: "Due date", fieldOwner: "Owner",
  editHint: "Click to edit",
  clearDue: "Clear due date",
  cpConfirmed: "Confirmed links",
  cpMore: "More suggestions",
  cpNoMore: "No suggestions left. Add detail to Next step so the system can find more links.",
  linkConfirmed: "confirmed",
  removeLink: "Remove link",
  linkRemoved: "Link removed",
  manageStreams: "Manage workstreams",
  streamInUse: n => n ? `${n} items` : "not in use",
  deleteStream: "Delete this workstream",
  streamDeleteConfirm: (name, n) => n
    ? `Delete the "${name}" workstream?\n\n${n} work items in it will fall back to automatic inference. No work item is deleted.`
    : `Delete the "${name}" workstream? No work items currently use it.`,
  streamDeleted: name => `Workstream "${name}" deleted`,
  streamRestore: "Restore deleted default workstreams",
  streamRestored: "Default workstreams restored",
  streamNoneLeft: "No workstreams left. Create one or restore the defaults.",
  /* --- subtasks & progress --- */
  subTitle: "Subtasks", subAdd: "Add subtask", subAddPh: "A step needed to finish this work item…",
  subNone: "Not broken down yet. Add subtasks to track detailed progress.",
  subSaveFirst: "Save the work item first, then reopen it to add subtasks.",
  subOwnerPh: "Owner", subToggle: "Mark done", subDelete: "Delete subtask",
  subNeedStart: "Add a start date so the system can measure schedule drift.",
  noSubs: "not broken down", colProgress: "Progress", expandRow: "Show subtasks",
  progressLabel: "Progress",
  subsDone: (d, t) => `${d}/${t} subtasks done`,
  timeElapsed: p => `${p}% of time elapsed`,
  driftAlert: (gap, el, done) => `Schedule drift of ${gap} points — ${el}% of the time is spent but only ${done}% of the work is done.`,
  driftLateSubs: n => `${n} subtasks are past due.`,
  kpiProgress: "Progress",
  kpiProgressSub: (d, t, e) => `${d}/${t} subtasks · ${e}% of time`,
  kpiProgressSubPlain: (d, t) => `${d}/${t} subtasks`,
  fDrift: "Schedule drift", fDriftOk: "On or ahead of schedule",
  fDrift50: "Behind by 50 points", fDrift30: "Behind by 30 points", fDrift15: "Behind by 15 points",
  driftNote: "Only scored for items that are broken down and have both start and due dates.",
  thDueSoon: "Days counted as due soon", thDrift: "Drift level that triggers the alert",
  weightResetBtn: "Restore default weights",
  weightResetConfirm: "Reset all weights and thresholds to their defaults?",
  weightReset: "Default weights restored",
  subNoTable: "The subtasks table does not exist in Supabase yet. Run the setup SQL and reload — otherwise anything you enter here is lost on reload.",
  subCopySql: "Copy setup SQL",
  sqlCopied: "SQL copied",
  sqlCopyFail: "Clipboard blocked — open the Data & system tab to copy the SQL",
  progTip: (d, tt, dp, ep) => ep === null
    ? `${d}/${tt} subtasks done (${dp}%)`
    : `${d}/${tt} subtasks done (${dp}%) · ${ep}% of time elapsed`,
  subMore: n => `+${n} more subtasks`,
  triageNextSub: title => `Open subtask: ${title}`,
  wlSubs: "Subtasks",
  wlOwnSubs: n => `${n} subtasks assigned to this person`,
  csvSubHead: ["Parent item","Workstream","Subtask","Done","Owner","Due"],
  subDuplicate: "This work item already has a subtask with the same name",
  msSearch: "Search…", msAll: "Select all", msNone: "Clear",
  msCount: (first, more) => `${first} +${more}`,
  delete: "Delete",
  subColTitle: "Subtask", subNotePh: "Add a note…",
  subAddPh: "Type a subtask name and press Enter",
  subAddHint: "Enter to add", subToggle: "Mark as done",
  subDeleteConfirm: n => `Delete "${n}"?`,
  subNeedV4: "Run migrate_v4.sql to add notes, priority and status to subtasks.",
  sortBy: "Sorted by", sortRemove: "Remove this level", sortReset: "Reset",
  sortHint: "Shift-click a column header to add a sort level",
  errNoOwner: "A work item needs an owner",
  errDateOrder: "The due date is earlier than the start date",
  errSave: m => `Could not save: ${m}`,
  errLoad: m => `Could not read data: ${m}`,
  errDelete: m => `Could not delete: ${m}`,
  confirmDelete: t => `Delete “${t}”? This cannot be undone.`,
  savedNew: "Work item added", savedEdit: "Work item updated", deleted: "Work item deleted",
  savedDemo: "Saved (sample data, not written to the database)",
  reloaded: "Reloaded", exported: n => `Exported ${n} work items`,

  demoNotice: 'Running on <strong>sample data</strong> for preview. Fill in <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> at the top of <code>app.js</code> to connect real data.',
  footNote: "Every figure computed directly from live data, never estimated",

  csvHead: ["Work item","Owner","Workstream","Start date","Due date","Priority","Status","Next step","Description","Risk index","Risk level","Subtasks","Done","Progress","Drift"],
  reason: {
    done: "Complete", noDue: "no due date",
    overdue: n => `${n} days past due`, dueToday: "due today", left: n => `${n} days left`,
    startsIn: n => `starts in ${n} days`
  },
  bands: { critical: "Critical", high: "High", watch: "Watch", stable: "Stable" },
  streams: { product: "Product & Platform", partner: "Partnerships & Distribution",
             capital: "Capital & Investors", presence: "Presence & Operations" }
}
};

/* --- Bộ máy dịch ------------------------------------------------------- */
let LANG = "vi";

/** Lấy chuỗi theo khoá, hỗ trợ khoá lồng nhau kiểu "exec.overdue". */
function t(key) {
  const parts = String(key).split(".");
  let node = I18N[LANG];
  for (const p of parts) { if (node == null) break; node = node[p]; }
  if (node == null) {                       // thiếu bản dịch thì rơi về tiếng Việt
    node = I18N.vi;
    for (const p of parts) { if (node == null) break; node = node[p]; }
  }
  return node == null ? key : node;
}

function setLang(lang) {
  LANG = I18N[lang] ? lang : "vi";
  document.documentElement.lang = LANG;
  try { localStorage.setItem("xp-lang", LANG); } catch (e) { /* file:// có thể chặn */ }
  applyStaticText();
}

function initLang() {
  let saved = null;
  try { saved = localStorage.getItem("xp-lang"); } catch (e) { /* bỏ qua */ }
  LANG = I18N[saved] ? saved : "vi";
  document.documentElement.lang = LANG;
}

/** Đổ chữ vào mọi phần tử có data-i18n trong HTML. */
function applyStaticText() {
  document.querySelectorAll("[data-i18n]").forEach(n => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach(n => { n.placeholder = t(n.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-title]").forEach(n => { n.title = t(n.dataset.i18nTitle); });
  document.querySelectorAll("#langSeg .seg-btn").forEach(b => b.classList.toggle("is-active", b.dataset.lang === LANG));
}
