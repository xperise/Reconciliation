// Đặc tả template Excel — dùng chung cho đọc file (client) và ghi DB (server).
// Sinh từ spec.json cùng file template. Đổi tên cột ở đây thì phải đổi trong template.
export type ColType = "text" | "code" | "enum" | "money" | "int" | "num" | "pct" | "date" | "ky" | "kyhalf";
export type WriteMode = "upsert" | "replace_by_ky" | "replace_all";
export interface ColSpec { h: string; f: string; t: ColType; req?: boolean; enum?: string[] }
export interface SheetSpec { sheet: string; table: string; mode: WriteMode; key: string[]; title: string; cols: ColSpec[] }

export const TEMPLATE_VERSION = "1.0";
export const SHEETS: SheetSpec[] = [
 {
  "sheet": "THAM_SO",
  "table": "fin_params",
  "mode": "upsert",
  "key": [
   "key"
  ],
  "title": "Tham số chính sách & cấu hình",
  "cols": [
   {
    "h": "Mã tham số",
    "f": "key",
    "t": "text",
    "req": true
   },
   {
    "h": "Giá trị",
    "f": "value",
    "t": "text",
    "req": true
   },
   {
    "h": "Diễn giải",
    "f": "note",
    "t": "text"
   }
  ]
 },
 {
  "sheet": "DM_KHACH_HANG",
  "table": "fin_customers",
  "mode": "upsert",
  "key": [
   "ma_kh"
  ],
  "title": "Danh mục khách hàng",
  "cols": [
   {
    "h": "Mã KH",
    "f": "ma_kh",
    "t": "code",
    "req": true
   },
   {
    "h": "Tên khách hàng",
    "f": "ten_kh",
    "t": "text",
    "req": true
   },
   {
    "h": "Tên viết tắt",
    "f": "ten_viet_tat",
    "t": "text"
   },
   {
    "h": "Nhóm",
    "f": "nhom",
    "t": "enum",
    "req": true,
    "enum": [
     "N1",
     "N2",
     "N3",
     "N4",
     "N5"
    ]
   },
   {
    "h": "PM phụ trách",
    "f": "pm",
    "t": "text"
   },
   {
    "h": "Sales chốt",
    "f": "sales",
    "t": "text"
   },
   {
    "h": "Credit term (ngày)",
    "f": "credit_term",
    "t": "int"
   },
   {
    "h": "Ghi chú",
    "f": "ghi_chu",
    "t": "text"
   }
  ]
 },
 {
  "sheet": "DM_NCC",
  "table": "fin_suppliers",
  "mode": "upsert",
  "key": [
   "ma_ncc"
  ],
  "title": "Danh mục nhà cung cấp",
  "cols": [
   {
    "h": "Mã NCC",
    "f": "ma_ncc",
    "t": "code",
    "req": true
   },
   {
    "h": "Tên nhà cung cấp",
    "f": "ten_ncc",
    "t": "text",
    "req": true
   },
   {
    "h": "Ngành",
    "f": "nganh",
    "t": "enum",
    "req": true,
    "enum": [
     "Hotel",
     "Flight",
     "Mobility",
     "SaaS",
     "F&B",
     "Khác"
    ]
   },
   {
    "h": "Payment term HĐ (ngày)",
    "f": "payment_term",
    "t": "int",
    "req": true
   },
   {
    "h": "Partnership phụ trách",
    "f": "partnership",
    "t": "text"
   }
  ]
 },
 {
  "sheet": "DM_NHAN_SU",
  "table": "fin_staff",
  "mode": "upsert",
  "key": [
   "ho_ten"
  ],
  "title": "Nhân sự hưởng hoa hồng",
  "cols": [
   {
    "h": "Họ tên",
    "f": "ho_ten",
    "t": "text",
    "req": true
   },
   {
    "h": "Team",
    "f": "team",
    "t": "enum",
    "req": true,
    "enum": [
     "PM",
     "Sales",
     "Partnership"
    ]
   },
   {
    "h": "Trục",
    "f": "truc",
    "t": "enum",
    "enum": [
     "Travel",
     "Mobility",
     "Tất cả"
    ]
   },
   {
    "h": "Tỷ lệ pool GMV Sales",
    "f": "tl_pool_gmv",
    "t": "pct"
   },
   {
    "h": "Tỷ lệ pool HĐ + SaaS",
    "f": "tl_pool_hd",
    "t": "pct"
   },
   {
    "h": "Tỷ lệ quỹ Partnership",
    "f": "tl_partnership",
    "t": "pct"
   }
  ]
 },
 {
  "sheet": "PHAN_BO_PM",
  "table": "fin_pm_alloc",
  "mode": "replace_all",
  "key": [
   "nhom",
   "pm"
  ],
  "title": "Phân bổ khách cho PM",
  "cols": [
   {
    "h": "Nhóm",
    "f": "nhom",
    "t": "enum",
    "req": true,
    "enum": [
     "N1",
     "N2",
     "N3",
     "N4",
     "N5"
    ]
   },
   {
    "h": "PM",
    "f": "pm",
    "t": "text",
    "req": true
   },
   {
    "h": "Số khách phụ trách",
    "f": "so_khach",
    "t": "num",
    "req": true
   }
  ]
 },
 {
  "sheet": "KE_HOACH",
  "table": "fin_targets",
  "mode": "upsert",
  "key": [
   "ky"
  ],
  "title": "Kế hoạch theo tháng",
  "cols": [
   {
    "h": "Kỳ",
    "f": "ky",
    "t": "ky",
    "req": true
   },
   {
    "h": "GMV Hotel",
    "f": "gmv_hotel",
    "t": "money"
   },
   {
    "h": "GMV Flights",
    "f": "gmv_flight",
    "t": "money"
   },
   {
    "h": "GMV N2",
    "f": "gmv_n2",
    "t": "money"
   },
   {
    "h": "GMV N3",
    "f": "gmv_n3",
    "t": "money"
   },
   {
    "h": "GMV N4",
    "f": "gmv_n4",
    "t": "money"
   },
   {
    "h": "GMV N5",
    "f": "gmv_n5",
    "t": "money"
   },
   {
    "h": "GMV SaaS Travel",
    "f": "gmv_saas_t",
    "t": "money"
   },
   {
    "h": "GMV SaaS Mobility",
    "f": "gmv_saas_m",
    "t": "money"
   },
   {
    "h": "GMV F&B",
    "f": "gmv_fnb",
    "t": "money"
   },
   {
    "h": "Số KH N1",
    "f": "kh_n1",
    "t": "int"
   },
   {
    "h": "Số KH N2",
    "f": "kh_n2",
    "t": "int"
   },
   {
    "h": "Số KH N3",
    "f": "kh_n3",
    "t": "int"
   },
   {
    "h": "Số KH N4",
    "f": "kh_n4",
    "t": "int"
   },
   {
    "h": "Số KH N5",
    "f": "kh_n5",
    "t": "int"
   },
   {
    "h": "Ngân sách chi phí vận hành",
    "f": "opex_budget",
    "t": "money"
   }
  ]
 },
 {
  "sheet": "GMV",
  "table": "fin_gmv",
  "mode": "replace_by_ky",
  "key": [
   "ky"
  ],
  "title": "GMV & giá vốn theo khách – NCC – dịch vụ",
  "cols": [
   {
    "h": "Kỳ",
    "f": "ky",
    "t": "ky",
    "req": true
   },
   {
    "h": "Mã KH",
    "f": "ma_kh",
    "t": "code",
    "req": true
   },
   {
    "h": "Mã NCC",
    "f": "ma_ncc",
    "t": "code"
   },
   {
    "h": "Dịch vụ",
    "f": "dich_vu",
    "t": "enum",
    "req": true,
    "enum": [
     "Hotel",
     "Flight",
     "Mobility",
     "SaaS Travel",
     "SaaS Mobility",
     "F&B"
    ]
   },
   {
    "h": "GMV",
    "f": "gmv",
    "t": "money",
    "req": true
   },
   {
    "h": "Giá vốn",
    "f": "gia_von",
    "t": "money",
    "req": true
   },
   {
    "h": "Chiết khấu KH",
    "f": "chiet_khau",
    "t": "money"
   }
  ]
 },
 {
  "sheet": "CONG_NO_PHAI_THU",
  "table": "fin_ar",
  "mode": "replace_all",
  "key": [],
  "title": "Công nợ phải thu (toàn bộ sổ tại ngày chốt)",
  "cols": [
   {
    "h": "Mã KH",
    "f": "ma_kh",
    "t": "code",
    "req": true
   },
   {
    "h": "Kỳ nợ",
    "f": "ky",
    "t": "ky",
    "req": true
   },
   {
    "h": "Số chứng từ",
    "f": "so_ct",
    "t": "text"
   },
   {
    "h": "Ngày hóa đơn",
    "f": "ngay_hd",
    "t": "date"
   },
   {
    "h": "Ngày đến hạn",
    "f": "ngay_den_han",
    "t": "date",
    "req": true
   },
   {
    "h": "Số tiền phải thu",
    "f": "so_tien",
    "t": "money",
    "req": true
   },
   {
    "h": "Đã thu",
    "f": "da_thu",
    "t": "money"
   },
   {
    "h": "Ngày thu đủ",
    "f": "ngay_thu_du",
    "t": "date"
   }
  ]
 },
 {
  "sheet": "CONG_NO_PHAI_TRA",
  "table": "fin_ap",
  "mode": "replace_all",
  "key": [],
  "title": "Công nợ phải trả (toàn bộ sổ tại ngày chốt)",
  "cols": [
   {
    "h": "Mã NCC",
    "f": "ma_ncc",
    "t": "code",
    "req": true
   },
   {
    "h": "Kỳ",
    "f": "ky",
    "t": "ky"
   },
   {
    "h": "Số chứng từ",
    "f": "so_ct",
    "t": "text"
   },
   {
    "h": "Ngày hóa đơn",
    "f": "ngay_hd",
    "t": "date",
    "req": true
   },
   {
    "h": "Ngày đến hạn",
    "f": "ngay_den_han",
    "t": "date",
    "req": true
   },
   {
    "h": "Số tiền phải trả",
    "f": "so_tien",
    "t": "money",
    "req": true
   },
   {
    "h": "Đã trả",
    "f": "da_tra",
    "t": "money"
   },
   {
    "h": "Ngày trả đủ",
    "f": "ngay_tra",
    "t": "date"
   }
  ]
 },
 {
  "sheet": "DONG_TIEN",
  "table": "fin_cash",
  "mode": "upsert",
  "key": [
   "ky_nua_thang",
   "khoan_muc"
  ],
  "title": "Kế hoạch & thực hiện dòng tiền theo nửa tháng",
  "cols": [
   {
    "h": "Kỳ nửa tháng",
    "f": "ky_nua_thang",
    "t": "kyhalf",
    "req": true
   },
   {
    "h": "Khoản mục",
    "f": "khoan_muc",
    "t": "enum",
    "req": true,
    "enum": [
     "Thu công nợ KH",
     "Chi nhà cung cấp",
     "Chi lương & nhân sự",
     "Chi vận hành",
     "Thu/chi tài chính",
     "Khác"
    ]
   },
   {
    "h": "Kế hoạch",
    "f": "ke_hoach",
    "t": "money"
   },
   {
    "h": "Thực hiện",
    "f": "thuc_hien",
    "t": "money"
   }
  ]
 },
 {
  "sheet": "CHI_PHI",
  "table": "fin_opex",
  "mode": "replace_by_ky",
  "key": [
   "ky"
  ],
  "title": "Chi phí theo khoản mục",
  "cols": [
   {
    "h": "Kỳ",
    "f": "ky",
    "t": "ky",
    "req": true
   },
   {
    "h": "Khoản mục",
    "f": "khoan_muc",
    "t": "enum",
    "req": true,
    "enum": [
     "Lương & nhân sự",
     "Công nghệ",
     "Marketing",
     "Quản lý chung",
     "Phí thanh toán & ngân hàng",
     "Khấu hao",
     "Lãi vay",
     "Thuế TNDN",
     "Khác"
    ]
   },
   {
    "h": "Số tiền",
    "f": "so_tien",
    "t": "money",
    "req": true
   }
  ]
 },
 {
  "sheet": "HOP_DONG",
  "table": "fin_contracts",
  "mode": "upsert",
  "key": [
   "ma_kh"
  ],
  "title": "Hợp đồng mới (tính thưởng Sales)",
  "cols": [
   {
    "h": "Mã KH",
    "f": "ma_kh",
    "t": "code",
    "req": true
   },
   {
    "h": "Nhóm",
    "f": "nhom",
    "t": "enum",
    "req": true,
    "enum": [
     "N1",
     "N3",
     "N5"
    ]
   },
   {
    "h": "Sales",
    "f": "sales",
    "t": "text",
    "req": true
   },
   {
    "h": "Ngày ký",
    "f": "ngay_ky",
    "t": "date",
    "req": true
   },
   {
    "h": "Số user",
    "f": "so_user",
    "t": "int"
   }
  ]
 }
];

export const SHEET_BY_NAME: Record<string, SheetSpec> = Object.fromEntries(SHEETS.map((s) => [s.sheet, s]));
