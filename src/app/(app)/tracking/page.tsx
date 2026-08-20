import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { SlaRail } from '@/components/SlaRail';
import { FilterBar } from '@/components/Toolbar';
import { STATUS_LABEL, TrackingStatus } from '@/lib/types';
import { OverrideForm } from './override-form';

export const dynamic = 'force-dynamic';

export default async function TrackingPage({
  searchParams,
}: { searchParams: { ky?: string; status?: string; nhom?: string } }) {
  const sb = supabaseAdmin();

  let q = sb.from('tracking')
    .select('*, billing_groups!inner(nhom_escalate)')
    .order('ky_doi_soat', { ascending: false })
    .order('ten_nhom');

  if (searchParams.ky) q = q.eq('ky_doi_soat', searchParams.ky);
  if (searchParams.status) q = q.eq('status', searchParams.status);
  if (searchParams.nhom) q = q.ilike('ten_nhom', `%${searchParams.nhom}%`);

  const [{ data: rows }, { data: kyList }] = await Promise.all([
    q.limit(300),
    sb.from('tracking').select('ky_doi_soat').order('ky_doi_soat', { ascending: false }),
  ]);

  const kyOptions = Array.from(new Set((kyList ?? []).map((r) => r.ky_doi_soat)))
    .map((k) => ({ value: k, label: k }));

  return (
    <>
      <PageHeader
        eyebrow="Nhật ký vận hành"
        title="Theo dõi kỳ"
        description="Mỗi dòng là một nhóm khách trong một kỳ. Thanh màu cho biết đã nhắc tới cấp nào và lặp mấy vòng."
      />

      <div className="card p-4 mb-4">
        <FilterBar fields={[
          { name: 'ky', label: 'Kỳ đối soát', options: kyOptions },
          { name: 'status', label: 'Trạng thái',
            options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })) },
          { name: 'nhom', label: 'Tên nhóm' },
        ]} />
      </div>

      <div className="card overflow-hidden">
        {rows?.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nhóm</th><th>Kỳ</th><th>Trạng thái</th><th>Escalate</th>
                  <th>Hạn xác nhận</th><th>Gửi gần nhất</th><th>File</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const treHan = r.han_chap_nhan && new Date(r.han_chap_nhan) < new Date()
                    && !['da_chot', 'hoan_tat_cho_thanh_toan', 'mac_dinh_chap_thuan'].includes(r.status);
                  return (
                    <tr key={r.id}>
                      <td className="font-semibold whitespace-nowrap">
                        {r.ten_nhom}
                        <span className="mono text-[var(--muted)] block text-[0.6875rem]">{r.ma_he_thong}</span>
                      </td>
                      <td className="mono whitespace-nowrap">{r.ky_doi_soat}</td>
                      <td><StatusBadge status={r.status as TrackingStatus} /></td>
                      <td>
                        <SlaRail level={r.escalate_level} loops={r.so_vong_remind}
                                 maxLevel={r.billing_groups.nhom_escalate === 1 ? 2 : 3} />
                      </td>
                      <td className="tnum whitespace-nowrap"
                          style={treHan ? { color: 'var(--red)', fontWeight: 600 } : undefined}>
                        {r.han_chap_nhan ?? '—'}
                      </td>
                      <td className="tnum whitespace-nowrap text-[var(--muted)]">{r.ngay_gui_gan_nhat ?? '—'}</td>
                      <td>
                        {r.link_file_bang_ke ? (
                          <a href={r.link_file_bang_ke} target="_blank" rel="noreferrer"
                             className="mono text-[var(--teal-deep)] no-underline">
                            v{r.version_bang_ke} ↗
                          </a>
                        ) : <span className="text-[var(--muted)]">—</span>}
                      </td>
                      <td className="text-right"><OverrideForm row={r} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            <strong>Chưa có dòng nào khớp bộ lọc.</strong>
            Dòng tracking được tạo tự động khi workflow gửi bảng kê đầu tiên của kỳ.
          </p>
        )}
      </div>
    </>
  );
}
