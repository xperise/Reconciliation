import { supabaseAdmin } from '@/lib/supabase/admin';
import { nowInVN, daysBetween } from '@/lib/period';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { SlaRail } from '@/components/SlaRail';
import { STATUS_LABEL, TrackingStatus } from '@/lib/types';
import { OverrideForm } from './override-form';
import { RowDetail } from './row-detail';
import { Filters } from './filters';

export const dynamic = 'force-dynamic';

export default async function TrackingPage({ searchParams }: {
  searchParams: { ky?: string; status?: string; nhom?: string; loc?: string };
}) {
  const sb = supabaseAdmin();
  const today = nowInVN().isoDate;

  let q = sb.from('tracking')
    .select('*, billing_groups!inner(nhom_escalate, ma_he_thong)')
    .order('ky_doi_soat', { ascending: false })
    .order('ten_nhom');

  if (searchParams.ky) q = q.eq('ky_doi_soat', searchParams.ky);
  if (searchParams.status) q = q.eq('status', searchParams.status);
  if (searchParams.nhom) q = q.ilike('ten_nhom', `%${searchParams.nhom}%`);

  const [{ data: raw }, { data: kyList }, { data: phapNhan }] = await Promise.all([
    q.limit(400),
    sb.from('tracking').select('ky_doi_soat').order('ky_doi_soat', { ascending: false }),
    sb.from('customers').select('group_id, ten_khach_hang, ten_viet_tat, code'),
  ]);

  // Gắn pháp nhân vào từng nhóm để hiện được cột Tên khách hàng và Code
  const byGroup = new Map<string, any[]>();
  for (const c of phapNhan ?? []) {
    const arr = byGroup.get(c.group_id) ?? [];
    arr.push(c);
    byGroup.set(c.group_id, arr);
  }

  let rows = (raw ?? []) as any[];

  // Bộ lọc phái sinh, tính trên ngày nên phải lọc sau khi lấy dữ liệu
  const DONE = ['da_chot', 'hoan_tat_cho_thanh_toan', 'mac_dinh_chap_thuan', 'da_gui_ho_so_thanh_toan'];
  const CHO_NOI_BO = ['cho_file_da_nhac_noi_bo', 'cho_duyet_phan_loai',
    'can_chinh_sua', 'cho_ho_so_thanh_toan'];

  if (searchParams.loc === 'da_chot') {
    rows = rows.filter((r) => DONE.includes(r.status));
  } else if (searchParams.loc === 'cho_noi_bo') {
    rows = rows.filter((r) => CHO_NOI_BO.includes(r.status));
  } else if (searchParams.loc === 'dang_xu_ly') {
    rows = rows.filter((r) => !DONE.includes(r.status) && r.status !== 'can_xu_ly_tay');
  } else if (searchParams.loc === 'qua_han') {
    rows = rows.filter((r) => r.han_chap_nhan && !DONE.includes(r.status)
      && daysBetween(r.han_chap_nhan, today) > 0);
  } else if (searchParams.loc === 'can_han') {
    rows = rows.filter((r) => {
      if (!r.han_chap_nhan || DONE.includes(r.status)) return false;
      const con = daysBetween(today, r.han_chap_nhan);
      return con >= 0 && con <= 1;
    });
  }

  const kyOptions = Array.from(new Set((kyList ?? []).map((r) => r.ky_doi_soat)));
  const dem = {
    qua_han: (raw ?? []).filter((r: any) => r.han_chap_nhan && !DONE.includes(r.status)
      && daysBetween(r.han_chap_nhan, today) > 0).length,
    can_han: (raw ?? []).filter((r: any) => {
      if (!r.han_chap_nhan || DONE.includes(r.status)) return false;
      const con = daysBetween(today, r.han_chap_nhan);
      return con >= 0 && con <= 1;
    }).length,
    xu_ly_tay: (raw ?? []).filter((r: any) => r.status === 'can_xu_ly_tay').length,
    cho_noi_bo: (raw ?? []).filter((r: any) => CHO_NOI_BO.includes(r.status)).length,
    da_chot: (raw ?? []).filter((r: any) => DONE.includes(r.status)).length,
  };

  return (
    <>
      <PageHeader
        eyebrow="Nhật ký vận hành"
        title="Theo dõi kỳ"
        description="Mỗi dòng là một nhóm khách trong một kỳ. Bấm vào dòng để xem đủ trường, bấm Can thiệp để sửa."
      />

      <Filters kyOptions={kyOptions} statusOptions={Object.entries(STATUS_LABEL)} dem={dem} />

      <div className="card overflow-hidden">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nhóm / Mã</th>
                  <th>Kỳ</th>
                  <th>Trạng thái</th>
                  <th>Escalate</th>
                  <th className="text-right">Hạn chấp nhận</th>
                  <th className="text-right">Gửi gần nhất</th>
                  <th className="text-right">Ngày chốt</th>
                  <th>Bảng kê</th>
                  <th>Kết quả duyệt</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const tre = r.han_chap_nhan && !DONE.includes(r.status)
                    ? daysBetween(r.han_chap_nhan, today) : null;
                  return (
                    <RowDetail
                      key={r.id}
                      row={r}
                      phapNhan={byGroup.get(r.group_id) ?? []}
                      tre={tre}
                      action={<OverrideForm row={r} />}
                      badge={<StatusBadge status={r.status as TrackingStatus} />}
                      rail={
                        <SlaRail
                          level={r.escalate_level}
                          loops={r.so_vong_remind}
                          maxLevel={r.billing_groups.nhom_escalate === 1 ? 2 : 3}
                        />
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            <strong>
              {searchParams.ky || searchParams.status || searchParams.nhom || searchParams.loc
                ? 'Không có dòng nào khớp bộ lọc.'
                : 'Chưa có kỳ đối soát nào.'}
            </strong>
            {searchParams.ky || searchParams.status || searchParams.nhom || searchParams.loc
              ? 'Thử bỏ bớt điều kiện lọc.'
              : 'Dòng tracking được tạo khi workflow gửi bảng kê đầu tiên của kỳ.'}
          </p>
        )}
      </div>
    </>
  );
}
