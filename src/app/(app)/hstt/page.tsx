import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { nowInVN, daysBetween } from '@/lib/period';
import { PageHeader } from '@/components/PageHeader';
import { UploadPanel } from '../files/upload-panel';
import { StatusBadge } from '@/components/StatusBadge';

export const dynamic = 'force-dynamic';

export default async function HsttPage() {
  const sb = supabaseAdmin();
  const today = nowInVN().isoDate;

  const [user, { data: cho }, { data: daGui }] = await Promise.all([
    currentUser(),
    sb.from('tracking')
      .select('*, billing_groups!inner(id, ten_nhom, ma_he_thong, ho_so_thanh_toan, sla_hstt)')
      .in('status', ['cho_ho_so_thanh_toan', 'can_chinh_sua_hstt'])
      .order('ngay_bat_dau_cho_file', { ascending: true }),
    sb.from('tracking')
      .select('*, billing_groups!inner(ten_nhom, ho_so_thanh_toan)')
      .in('status', ['da_gui_ho_so_thanh_toan', 'cho_xac_nhan_hstt',
        'can_chinh_sua_hstt', 'hoan_tat_cho_thanh_toan'])
      .not('ten_file_hstt_da_gui', 'is', null)
      .order('ngay_gui_gan_nhat', { ascending: false })
      .limit(30),
  ]);

  const laKeToan = user?.role === 'admin' || user?.role === 'ke_toan';
  const rows = (cho ?? []) as any[];

  // Chỉ cho chọn đúng những nhóm đang thực sự chờ hồ sơ
  const groups = rows.map((r) => ({
    id: r.billing_groups.id,
    ten_nhom: r.billing_groups.ten_nhom,
    ma_he_thong: r.billing_groups.ma_he_thong,
  }));

  return (
    <>
      <PageHeader
        eyebrow={rows.length ? `${rows.length} nhóm đang chờ` : 'Không còn nhóm nào chờ'}
        title="Chờ hồ sơ thanh toán"
        description="Các kỳ đã chốt bảng kê và đang đợi hồ sơ thanh toán. Tải lên ngay tại đây, không phải sang mục khác."
      />

      <section className="card overflow-hidden mb-4">
        <div className="card-hd">
          <p className="eyebrow">Việc cần làm</p>
          <h2 className="card-title mt-0.5">Nhóm đang chờ hồ sơ</h2>
          <p className="card-note m-0 mt-1">
            Cột Giấy tờ lấy từ Master Data — đúng những gì khách yêu cầu trong hợp đồng.
          </p>
        </div>

        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Khách hàng</th><th>Kỳ</th>
                  <th>Trạng thái</th>
                  <th>Giấy tờ cần chuẩn bị</th>
                  <th className="text-right">Chốt ngày</th>
                  <th className="text-right">Đã chờ</th>
                  <th className="text-right">Hạn HSTT</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const moc = r.ngay_bat_dau_cho_file ?? r.ngay_chot;
                  const daCho = moc ? daysBetween(moc, today) : null;
                  const sla = r.billing_groups.sla_hstt;
                  const treHan = sla != null && daCho != null && daCho > sla;
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="font-semibold">{r.ten_nhom}</span>
                        <span className="sub mono">{r.ma_he_thong}</span>
                      </td>
                      <td className="mono text-[12px]">{r.ky_doi_soat}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="text-[12.5px]">
                        {r.billing_groups.ho_so_thanh_toan
                          ? (
                            <span className="flex flex-wrap gap-1">
                              {String(r.billing_groups.ho_so_thanh_toan)
                                .split(/[,;]/).map((x: string) => x.trim()).filter(Boolean)
                                .map((x: string) => (
                                  <span key={x} className="pill pill-neutral !text-[11px]">{x}</span>
                                ))}
                            </span>
                          )
                          : <span className="text-[var(--ink-3)]">chưa khai trong Master Data</span>}
                      </td>
                      <td className="text-right mono text-[12px] text-[var(--ink-3)]">
                        {r.ngay_chot ?? '—'}
                      </td>
                      <td className="text-right mono text-[12px] font-semibold"
                          style={treHan ? { color: 'var(--critical)' } : undefined}>
                        {daCho === null ? '—' : `${daCho} ngày`}
                      </td>
                      <td className="text-right mono text-[12px] text-[var(--ink-3)]">
                        {sla != null ? `${sla} ngày` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            <strong>Không có nhóm nào đang chờ hồ sơ thanh toán.</strong>
            Kỳ nào chốt xong mà khách yêu cầu hồ sơ sẽ tự xuất hiện ở đây.
          </p>
        )}
      </section>

      {laKeToan && rows.length > 0 && (
        <div className="mb-4">
          <UploadPanel
            groups={groups}
            macDinhKind="hstt"
            tieuDe="Tải hồ sơ thanh toán lên"
          />
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="card-hd">
          <p className="eyebrow">Lịch sử</p>
          <h2 className="card-title mt-0.5">Đã gửi hồ sơ gần đây</h2>
          <p className="card-note m-0 mt-1">
            Kỳ ở trạng thái <strong>Chờ khách xác nhận HSTT</strong> vẫn đang chạy đồng hồ SLA;
            khách phản hồi sẽ xuất hiện ở mục Chờ duyệt.
          </p>
        </div>
        {daGui?.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Khách hàng</th><th>Kỳ</th><th>Tệp đã gửi</th>
                  <th className="text-right">Bản</th>
                  <th>Trạng thái</th>
                  <th className="text-right">Gửi ngày</th>
                </tr>
              </thead>
              <tbody>
                {daGui.map((r: any) => (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.ten_nhom}</td>
                    <td className="mono text-[12px]">{r.ky_doi_soat}</td>
                    <td className="text-[12.5px] max-w-[220px] truncate"
                        title={r.ten_file_hstt_da_gui ?? ''}>
                      {r.ten_file_hstt_da_gui ?? '—'}
                    </td>
                    <td className="text-right mono text-[12px]">{r.version_hstt ?? 1}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="text-right mono text-[12px] text-[var(--ink-3)]">
                      {r.ngay_gui_gan_nhat ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            <strong>Chưa gửi hồ sơ thanh toán nào.</strong>
            Danh sách này giúp đối chiếu nhanh khi khách hỏi lại.
          </p>
        )}
      </section>
    </>
  );
}
