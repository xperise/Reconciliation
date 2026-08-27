import { supabaseAdmin } from './supabase/admin';
import { nowInVN, daysBetween } from './period';
import { STATUS_LABEL, TrackingStatus } from './types';

/**
 * Chỉ số dashboard, chia ba tầng theo người đọc:
 *   Tầng 1 — dòng tiền và mức tự động hoá, dành cho ban điều hành
 *   Tầng 2 — nút thắt và hiệu suất, dành cho quản lý
 *   Tầng 3 — cảnh báo cần hành động, dành cho vận hành
 *
 * Mọi con số đều dẫn xuất tại thời điểm gọi. Không có giá trị nào viết cứng,
 * vì một dashboard hiện số cũ nguy hiểm hơn dashboard không hiện gì — người
 * đọc vẫn tin nó.
 *
 * Khi thiếu dữ liệu để tính, trả về null chứ không đoán. Giao diện sẽ hiện
 * "chưa đủ dữ liệu" thay vì một con số bịa.
 */

/** Trạng thái coi như đã kết thúc vòng đời đối soát. */
const DONE: TrackingStatus[] = [
  'da_chot', 'hoan_tat_cho_thanh_toan', 'mac_dinh_chap_thuan', 'da_gui_ho_so_thanh_toan',
];

/** Trạng thái mà đồng hồ đang chạy về phía nội bộ, không phải phía khách. */
const INTERNAL_WAIT: TrackingStatus[] = [
  'cho_file_da_nhac_noi_bo', 'cho_duyet_phan_loai', 'can_chinh_sua', 'cho_ho_so_thanh_toan',
];

/** Trạng thái đồng hồ đang chạy về phía khách hàng. */
const CUSTOMER_WAIT: TrackingStatus[] = ['da_gui_bang_ke', 'da_nhan_phan_hoi'];

export type Metric = {
  key: string;
  label: string;
  value: number | null;
  display: string;
  sub: string;
  tone: 'critical' | 'high' | 'watch' | 'stable' | 'neutral';
  /** Tỷ lệ 0..1 để vẽ thanh 3px dưới ô KPI. */
  meter?: number;
  /** Liên kết lọc khi bấm vào ô, rỗng nghĩa là ô không bấm được. */
  href?: string;
};

export type DashboardData = {
  ky: string;
  tier1: Metric[];
  tier2: Metric[];
  tier3: Metric[];
  bottleneck: { status: string; label: string; gio: number; soLan: number }[];
  rootCause: { nguon: string; gio: number; tyLe: number }[];
  slaCompare: { nhom: string; ky: string; thucTe: number; camKet: number; lech: number }[];
  atRisk: any[];
  overdue: any[];
  tongActive: number;
  tongDaChot: number;
};

function pct(n: number, d: number): number | null {
  return d > 0 ? (n / d) * 100 : null;
}

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(v >= 10 ? 0 : 1)}%`;
}

function fmtDays(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1)}`;
}

export async function loadDashboard(ky: string): Promise<DashboardData> {
  const sb = supabaseAdmin();
  const today = nowInVN().isoDate;

  const [trackingRes, logRes, groupRes] = await Promise.all([
    sb.from('tracking').select('*'),
    sb.from('status_log').select('*'),
    sb.from('billing_groups').select('id, ma_he_thong, ten_nhom, nhom_escalate, sla_chap_nhan_hd, sla_chap_nhan_thuc_te'),
  ]);

  const all = (trackingRes.data ?? []) as any[];
  const logs = (logRes.data ?? []) as any[];
  const groups = (groupRes.data ?? []) as any[];
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const kyRows = all.filter((r) => r.ky_doi_soat === ky);
  const daChot = kyRows.filter((r) => DONE.includes(r.status));
  const active = kyRows.filter((r) => !DONE.includes(r.status) && r.status !== 'can_xu_ly_tay');

  // Gom log theo từng dòng tracking để soi lịch sử đi qua những trạng thái nào
  const logByTracking = new Map<string, any[]>();
  for (const l of logs) {
    const arr = logByTracking.get(l.tracking_id) ?? [];
    arr.push(l);
    logByTracking.set(l.tracking_id, arr);
  }

  // =====================================================================
  // TẦNG 1 — dòng tiền và tự động hoá
  // =====================================================================

  // 1. Tỷ lệ đối soát không cần người chạm tay
  const zeroTouch = daChot.filter((r) => {
    const hist = logByTracking.get(r.id) ?? [];
    return !hist.some((h) =>
      h.status_moi === 'can_chinh_sua' || h.status_moi === 'can_xu_ly_tay');
  }).length;
  const zeroTouchPct = pct(zeroTouch, daChot.length);

  // 2. Vòng đời chốt công nợ: từ lần gửi đầu tiên tới ngày chốt
  const turnarounds: number[] = daChot
    .map((r) => {
      const hist = (logByTracking.get(r.id) ?? [])
        .filter((h) => h.status_moi === 'da_gui_bang_ke')
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const firstSent = hist[0]?.created_at?.slice(0, 10) ?? r.ngay_gui_gan_nhat;
      if (!firstSent || !r.ngay_chot) return null;
      return daysBetween(firstSent, r.ngay_chot);
    })
    .filter((v): v is number => v !== null && v >= 0);
  const avgTurnaround = turnarounds.length
    ? turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length
    : null;

  // 3. Tỷ lệ rủi ro kẹt dòng tiền
  const quaHan = active.filter((r) => r.han_chap_nhan && daysBetween(r.han_chap_nhan, today) > 0);
  const riskPct = pct(quaHan.length, active.length);

  const tier1: Metric[] = [
    {
      key: 'zero_touch',
      label: 'Chốt tự động hoàn toàn',
      value: zeroTouchPct,
      display: fmtPct(zeroTouchPct),
      sub: daChot.length ? `${zeroTouch}/${daChot.length} kỳ đã chốt không phải sửa` : 'chưa có kỳ nào chốt',
      tone: zeroTouchPct === null ? 'neutral' : zeroTouchPct >= 70 ? 'stable' : zeroTouchPct >= 40 ? 'high' : 'critical',
      meter: zeroTouchPct === null ? undefined : zeroTouchPct / 100,
    },
    {
      key: 'turnaround',
      label: 'Vòng đời chốt công nợ',
      value: avgTurnaround,
      display: avgTurnaround === null ? '—' : `${fmtDays(avgTurnaround)} ngày`,
      sub: turnarounds.length ? `trung bình trên ${turnarounds.length} kỳ đã chốt` : 'chưa đủ dữ liệu',
      tone: avgTurnaround === null ? 'neutral' : avgTurnaround <= 5 ? 'stable' : avgTurnaround <= 10 ? 'high' : 'critical',
      meter: avgTurnaround === null ? undefined : Math.min(avgTurnaround / 15, 1),
    },
    {
      key: 'cashflow_risk',
      label: 'Rủi ro kẹt dòng tiền',
      value: riskPct,
      display: fmtPct(riskPct),
      sub: active.length ? `${quaHan.length}/${active.length} kỳ đang xử lý bị quá hạn` : 'không có kỳ đang xử lý',
      tone: riskPct === null ? 'neutral' : riskPct === 0 ? 'stable' : riskPct <= 20 ? 'high' : 'critical',
      meter: riskPct === null ? undefined : riskPct / 100,
      href: '/tracking?loc=qua_han',
    },
  ];

  // =====================================================================
  // TẦNG 2 — nút thắt và hiệu suất
  // =====================================================================

  const kyTrackingIds = new Set(kyRows.map((r) => r.id));
  const kyLogs = logs.filter((l) => kyTrackingIds.has(l.tracking_id) && l.gio_o_status_cu != null);

  // 4. Rò rỉ thời gian nội bộ
  const gioNoiBo = kyLogs
    .filter((l) => INTERNAL_WAIT.includes(l.status_cu))
    .reduce((s, l) => s + Number(l.gio_o_status_cu), 0);
  const gioKhach = kyLogs
    .filter((l) => CUSTOMER_WAIT.includes(l.status_cu))
    .reduce((s, l) => s + Number(l.gio_o_status_cu), 0);
  const gioTong = gioNoiBo + gioKhach;

  // 5. Điểm thắt cổ chai
  const byStatus = new Map<string, { tong: number; soLan: number }>();
  for (const l of kyLogs) {
    if (!l.status_cu) continue;
    const cur = byStatus.get(l.status_cu) ?? { tong: 0, soLan: 0 };
    cur.tong += Number(l.gio_o_status_cu);
    cur.soLan += 1;
    byStatus.set(l.status_cu, cur);
  }
  const bottleneck = [...byStatus.entries()]
    .map(([status, v]) => ({
      status,
      label: STATUS_LABEL[status as TrackingStatus] ?? status,
      gio: v.tong / v.soLan,
      soLan: v.soLan,
    }))
    .sort((a, b) => b.gio - a.gio);

  // 6. SLA thực tế so với cam kết
  const slaCompare = daChot
    .map((r) => {
      const g = groupById.get(r.group_id);
      if (!g || !r.ngay_chot) return null;
      const camKet = g.sla_chap_nhan_thuc_te ?? g.sla_chap_nhan_hd;
      if (!camKet) return null;
      const hist = (logByTracking.get(r.id) ?? [])
        .filter((h) => h.status_moi === 'da_gui_bang_ke')
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const lastSent = hist[0]?.created_at?.slice(0, 10) ?? r.ngay_gui_gan_nhat;
      if (!lastSent) return null;
      const thucTe = daysBetween(lastSent, r.ngay_chot);
      return { nhom: r.ten_nhom, ky: r.ky_doi_soat, thucTe, camKet, lech: thucTe - camKet };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .sort((a, b) => b.lech - a.lech);

  const lechTb = slaCompare.length
    ? slaCompare.reduce((s, v) => s + v.lech, 0) / slaCompare.length
    : null;

  // 7. Phân bổ nguyên nhân gây trễ
  const rootCause = gioTong > 0
    ? [
        { nguon: 'Nội bộ xperise', gio: gioNoiBo, tyLe: (gioNoiBo / gioTong) * 100 },
        { nguon: 'Phía khách hàng', gio: gioKhach, tyLe: (gioKhach / gioTong) * 100 },
      ]
    : [];

  const tier2: Metric[] = [
    {
      key: 'internal_leak',
      label: 'Rò rỉ thời gian nội bộ',
      value: gioNoiBo || null,
      display: gioTong > 0 ? `${Math.round(gioNoiBo)} giờ` : '—',
      sub: gioTong > 0
        ? `${Math.round((gioNoiBo / gioTong) * 100)}% tổng thời gian chờ của kỳ`
        : 'chưa đủ dữ liệu',
      tone: gioTong === 0 ? 'neutral' : gioNoiBo > gioKhach ? 'critical' : 'stable',
      meter: gioTong > 0 ? gioNoiBo / gioTong : undefined,
    },
    {
      key: 'bottleneck',
      label: 'Nút thắt lớn nhất',
      value: bottleneck[0]?.gio ?? null,
      display: bottleneck[0] ? `${bottleneck[0].gio.toFixed(0)}h` : '—',
      sub: bottleneck[0] ? bottleneck[0].label : 'chưa đủ dữ liệu',
      tone: bottleneck[0] ? 'high' : 'neutral',
      meter: bottleneck[0] && bottleneck[0].gio > 0
        ? Math.min(bottleneck[0].gio / 72, 1) : undefined,
    },
    {
      key: 'sla_delta',
      label: 'Lệch SLA trung bình',
      value: lechTb,
      display: lechTb === null ? '—' : `${lechTb > 0 ? '+' : ''}${lechTb.toFixed(1)} ngày`,
      sub: slaCompare.length ? `trên ${slaCompare.length} kỳ so với cam kết` : 'chưa đủ dữ liệu',
      tone: lechTb === null ? 'neutral' : lechTb <= 0 ? 'stable' : lechTb <= 2 ? 'high' : 'critical',
      meter: lechTb === null ? undefined : Math.min(Math.abs(lechTb) / 5, 1),
    },
  ];

  // =====================================================================
  // TẦNG 3 — cảnh báo cần hành động
  // =====================================================================

  // 8. Cận hạn: hạn rơi vào hôm nay hoặc ngày mai
  const atRisk = active.filter((r) => {
    if (!r.han_chap_nhan) return false;
    const con = daysBetween(today, r.han_chap_nhan);
    return con >= 0 && con <= 1;
  });

  // 9. Tỷ lệ leo thang sự cố
  const xuLyTay = kyRows.filter((r) => r.status === 'can_xu_ly_tay').length;
  const escalationPct = pct(xuLyTay, kyRows.length);

  // 10. Tần suất đẩy qua đẩy lại
  const soLanSua = logs.filter(
    (l) => kyTrackingIds.has(l.tracking_id) && l.status_moi === 'can_chinh_sua').length;
  const reworkRate = kyRows.length ? soLanSua / kyRows.length : null;

  const tier3: Metric[] = [
    {
      key: 'at_risk',
      label: 'Cận hạn trong 24 giờ',
      value: atRisk.length,
      display: String(atRisk.length),
      sub: active.length ? `trong ${active.length} kỳ đang xử lý` : 'không có kỳ đang xử lý',
      tone: atRisk.length === 0 ? 'stable' : atRisk.length <= 3 ? 'high' : 'critical',
      meter: active.length ? atRisk.length / active.length : undefined,
      href: '/tracking?loc=can_han',
    },
    {
      key: 'escalation',
      label: 'Tỷ lệ phải xử lý tay',
      value: escalationPct,
      display: fmtPct(escalationPct),
      sub: kyRows.length ? `${xuLyTay}/${kyRows.length} kỳ hệ thống phải dừng` : 'chưa có kỳ nào',
      tone: escalationPct === null ? 'neutral' : escalationPct === 0 ? 'stable' : escalationPct <= 5 ? 'high' : 'critical',
      meter: escalationPct === null ? undefined : escalationPct / 100,
      href: '/tracking?status=can_xu_ly_tay',
    },
    {
      key: 'rework',
      label: 'Số lần sửa mỗi bảng kê',
      value: reworkRate,
      display: reworkRate === null ? '—' : reworkRate.toFixed(2),
      sub: kyRows.length ? `${soLanSua} lượt sửa trên ${kyRows.length} bảng kê` : 'chưa có kỳ nào',
      tone: reworkRate === null ? 'neutral' : reworkRate < 0.5 ? 'stable' : reworkRate < 1 ? 'high' : 'critical',
      meter: reworkRate === null ? undefined : Math.min(reworkRate, 1),
      href: '/tracking?status=can_chinh_sua',
    },
  ];

  return {
    ky,
    tier1, tier2, tier3,
    bottleneck: bottleneck.slice(0, 6),
    rootCause,
    slaCompare: slaCompare.slice(0, 8),
    atRisk,
    overdue: quaHan.sort((a, b) =>
      daysBetween(b.han_chap_nhan, today) - daysBetween(a.han_chap_nhan, today)),
    tongActive: active.length,
    tongDaChot: daChot.length,
  };
}

/**
 * Câu tóm tắt điều hành, ghép từ các mệnh đề chỉ xuất hiện khi có gì để nói.
 * Đọc khác hẳn nhau giữa một kỳ khoẻ mạnh và một kỳ đang cháy.
 */
export function execSummary(d: DashboardData): string {
  const parts: string[] = [];
  const tong = d.tongActive + d.tongDaChot;

  if (tong === 0) {
    return `Kỳ ${d.ky} chưa có bảng kê nào được khởi tạo. Chạy workflow gửi bảng kê `
      + `hoặc tải tệp lên để bắt đầu.`;
  }

  parts.push(`Kỳ ${d.ky} đã chốt ${d.tongDaChot}/${tong} bảng kê`);

  const risk = d.tier1.find((m) => m.key === 'cashflow_risk')?.value;
  if (risk !== null && risk !== undefined && risk > 0) {
    parts.push(`${d.overdue.length} kỳ đang quá hạn xác nhận`);
  }

  if (d.atRisk.length > 0) {
    parts.push(`${d.atRisk.length} kỳ sẽ tới hạn trong 24 giờ tới`);
  }

  const leak = d.rootCause.find((r) => r.nguon === 'Nội bộ xperise');
  if (leak && leak.tyLe > 55) {
    parts.push(`phần lớn thời gian chờ (${Math.round(leak.tyLe)}%) đang nằm ở phía nội bộ`);
  } else if (leak && leak.tyLe > 0 && leak.tyLe < 45) {
    parts.push(`thời gian chờ chủ yếu nằm ở phía khách hàng`);
  }

  if (d.bottleneck[0] && d.bottleneck[0].gio >= 24) {
    parts.push(`nút thắt lớn nhất là "${d.bottleneck[0].label}" với ${d.bottleneck[0].gio.toFixed(0)} giờ trung bình`);
  }

  const zt = d.tier1.find((m) => m.key === 'zero_touch')?.value;
  if (zt !== null && zt !== undefined && d.tongDaChot >= 3) {
    if (zt >= 80) parts.push(`quy trình đang chạy gần như hoàn toàn tự động`);
    else if (zt < 40) parts.push(`chỉ ${Math.round(zt)}% chốt được mà không cần can thiệp tay`);
  }

  return parts.join(', ') + '.';
}
