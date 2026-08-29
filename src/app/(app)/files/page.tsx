import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { PageHeader } from '@/components/PageHeader';
import { UploadPanel } from './upload-panel';
import { FileActions } from './file-row';

export const dynamic = 'force-dynamic';

function kichCo(bytes: number | null): string {
  if (!bytes) return '—';
  return bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * Ba loại tệp phân biệt rõ trên giao diện. Bảng kê bản 1 và bản chỉnh sửa
 * cùng nằm ở kind 'bang_ke' trong database, khác nhau ở số version — người
 * dùng cần thấy hai thứ đó là hai việc khác nhau.
 */
function nhanLoai(f: any): { nhan: string; tone: string } {
  if (f.kind === 'hstt') return { nhan: 'Hồ sơ thanh toán', tone: 'pill-watch' };
  if (f.version > 1) return { nhan: `Bảng kê chỉnh sửa (bản ${f.version})`, tone: 'pill-high' };
  return { nhan: 'Bảng kê', tone: 'pill-stable' };
}

export default async function FilesPage({ searchParams }: {
  searchParams: { loai?: string };
}) {
  const [user, { data: groups }, { data: files }] = await Promise.all([
    currentUser(),
    supabaseAdmin().from('billing_groups')
      .select('id, ten_nhom, ma_he_thong').eq('ngung_hop_tac', false).order('ten_nhom'),
    supabaseAdmin().from('statement_files')
      .select('*, profiles(full_name, email)')
      .order('uploaded_at', { ascending: false }).limit(200),
  ]);

  const laKeToan = user?.role === 'admin' || user?.role === 'ke_toan';
  let rows = files ?? [];

  const loc = searchParams.loai;
  if (loc === 'bang_ke') rows = rows.filter((f: any) => f.kind === 'bang_ke' && f.version === 1);
  else if (loc === 'sua') rows = rows.filter((f: any) => f.kind === 'bang_ke' && f.version > 1);
  else if (loc === 'hstt') rows = rows.filter((f: any) => f.kind === 'hstt');
  else if (loc === 'cho_gui') rows = rows.filter((f: any) => !f.sent_at);

  const dem = {
    bang_ke: (files ?? []).filter((f: any) => f.kind === 'bang_ke' && f.version === 1).length,
    sua: (files ?? []).filter((f: any) => f.kind === 'bang_ke' && f.version > 1).length,
    hstt: (files ?? []).filter((f: any) => f.kind === 'hstt').length,
    cho_gui: (files ?? []).filter((f: any) => !f.sent_at).length,
  };

  const Chip = ({ v, nhan, so }: { v?: string; nhan: string; so?: number }) => (
    <a href={v ? `/files?loai=${v}` : '/files'} className="chip"
       data-on={loc === v || (!loc && !v)} data-zero={so === 0}>
      {nhan}{so !== undefined && <span className="chip-count">{so}</span>}
    </a>
  );

  return (
    <>
      <PageHeader
        eyebrow={dem.cho_gui ? `${dem.cho_gui} tệp chờ gửi` : 'Kho tệp'}
        title="Tệp bảng kê"
        description="Tải bảng kê và hồ sơ thanh toán lên đây. Hệ thống đính kèm vào email và gửi cho khách."
      />

      {laKeToan && <div className="mb-4"><UploadPanel groups={groups ?? []} /></div>}

      <div className="card card-pad mb-3 no-print">
        <div className="flex flex-wrap gap-2">
          <Chip nhan="Tất cả" so={(files ?? []).length} />
          <Chip v="bang_ke" nhan="Bảng kê" so={dem.bang_ke} />
          <Chip v="sua" nhan="Bảng kê chỉnh sửa" so={dem.sua} />
          <Chip v="hstt" nhan="Hồ sơ thanh toán" so={dem.hstt} />
          <Chip v="cho_gui" nhan="Chờ gửi" so={dem.cho_gui} />
        </div>
      </div>

      <div className="card overflow-hidden">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Loại tệp</th><th>Nhóm</th><th>Kỳ</th><th>Tên tệp</th>
                  <th className="text-right">Dung lượng</th><th>Người tải</th>
                  <th>Trạng thái</th><th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f: any) => {
                  const l = nhanLoai(f);
                  return (
                    <tr key={f.id}>
                      <td><span className={`pill ${l.tone}`}>{l.nhan}</span></td>
                      <td className="mono text-[12px] whitespace-nowrap">{f.ma_he_thong}</td>
                      <td className="mono text-[12px] whitespace-nowrap">
                        {f.ky_doi_soat}
                        {f.dot > 1 && <span className="sub">Đợt {f.dot}</span>}
                      </td>
                      <td className="max-w-[240px] truncate text-[12.5px]" title={f.file_name}>
                        {f.file_name}
                      </td>
                      <td className="text-right mono text-[12px] text-[var(--ink-3)]">
                        {kichCo(f.size_bytes)}
                      </td>
                      <td className="text-[12px] text-[var(--ink-3)]">
                        {f.profiles?.full_name || f.profiles?.email || '—'}
                      </td>
                      <td>
                        {f.sent_at ? (
                          <span className="pill pill-stable">
                            Đã gửi {new Date(f.sent_at).toLocaleDateString('vi-VN')}
                          </span>
                        ) : (
                          <span className="pill pill-high">Chờ gửi</span>
                        )}
                      </td>
                      <td><FileActions file={f} laKeToan={laKeToan} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            <strong>{files?.length ? 'Không có tệp nào thuộc loại này.' : 'Chưa có tệp nào.'}</strong>
            {files?.length ? 'Chọn bộ lọc khác ở trên.' : 'Tải bảng kê đầu tiên lên bằng ô phía trên.'}
          </p>
        )}
      </div>
    </>
  );
}
