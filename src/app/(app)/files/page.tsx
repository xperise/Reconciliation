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
  if (f.kind === 'trao_doi') return { nhan: 'Tệp trao đổi', tone: 'pill-neutral' };
  if (f.kind === 'hstt') return { nhan: 'Hồ sơ thanh toán', tone: 'pill-watch' };
  if (f.kind === 'trao_doi') return { nhan: 'Trao đổi', tone: 'pill-neutral' };
  if (f.version > 1) return { nhan: `Bảng kê chỉnh sửa (bản ${f.version})`, tone: 'pill-high' };
  return { nhan: 'Bảng kê', tone: 'pill-stable' };
}

export default async function FilesPage({ searchParams }: {
  searchParams: { loai?: string };
}) {
  const [user, { data: groups }, { data: files }, { data: dangCho }] = await Promise.all([
    currentUser(),
    supabaseAdmin().from('billing_groups')
      .select('id, ten_nhom, ma_he_thong').eq('ngung_hop_tac', false).order('ten_nhom'),
    supabaseAdmin().from('statement_files')
      .select('*, profiles(full_name, email)')
      .order('uploaded_at', { ascending: false }).limit(200),
    // Những kỳ đang đợi kế toán tải tệp lên. Người vào trang này để tải tệp
    // nên thấy ngay khách nào đang chờ, thay vì phải nhớ hoặc mở tab khác.
    supabaseAdmin().from('tracking')
      .select('id, ten_nhom, ma_he_thong, ky_doi_soat, dot, status, ngay_bat_dau_cho_file')
      .in('status', ['chua_gui', 'cho_file_da_nhac_noi_bo', 'can_chinh_sua'])
      .order('ngay_bat_dau_cho_file', { ascending: true }),
  ]);

  const laKeToan = user?.role === 'admin' || user?.role === 'ke_toan';
  let rows = files ?? [];

  const loc = searchParams.loai;
  if (loc === 'bang_ke') rows = rows.filter((f: any) => f.kind === 'bang_ke' && f.version === 1);
  else if (loc === 'sua') rows = rows.filter((f: any) => f.kind === 'bang_ke' && f.version > 1);
  else if (loc === 'hstt') rows = rows.filter((f: any) => f.kind === 'hstt');
  else if (loc === 'trao_doi') rows = rows.filter((f: any) => f.kind === 'trao_doi');
  else if (loc === 'cho_gui') rows = rows.filter((f: any) => !f.sent_at);

  const dem = {
    bang_ke: (files ?? []).filter((f: any) => f.kind === 'bang_ke' && f.version === 1).length,
    sua: (files ?? []).filter((f: any) => f.kind === 'bang_ke' && f.version > 1).length,
    hstt: (files ?? []).filter((f: any) => f.kind === 'hstt').length,
    trao_doi: (files ?? []).filter((f: any) => f.kind === 'trao_doi').length,
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

      {laKeToan && (dangCho?.length ?? 0) > 0 && (
        <section className="card mb-4" data-status="high">
          <div className="card-pad">
            <p className="eyebrow" style={{ color: 'var(--high)' }}>Đang chờ bạn</p>
            <h2 className="card-title mt-0.5 mb-2">
              {dangCho!.length} kỳ chưa có tệp
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {dangCho!.map((t: any) => (
                <span key={t.id} className={`pill ${
                  t.status === 'can_chinh_sua' ? 'pill-high' : 'pill-neutral'}`}>
                  {t.ten_nhom} · {t.ky_doi_soat}
                  {t.dot > 1 ? ` · Đợt ${t.dot}` : ''}
                  {t.status === 'can_chinh_sua' ? ' · cần bản sửa' : ''}
                </span>
              ))}
            </div>
            <p className="card-note m-0 mt-2">
              Chọn khách và kỳ tương ứng ở ô tải lên bên dưới. Kỳ ở trạng thái
              cần bản sửa thì chọn loại tệp <strong>Bảng kê chỉnh sửa</strong>.
            </p>
          </div>
        </section>
      )}

      {laKeToan && <div className="mb-4"><UploadPanel groups={groups ?? []} /></div>}

      <div className="card card-pad mb-3 no-print">
        <div className="flex flex-wrap gap-2">
          <Chip nhan="Tất cả" so={(files ?? []).length} />
          <Chip v="bang_ke" nhan="Bảng kê" so={dem.bang_ke} />
          <Chip v="sua" nhan="Bảng kê chỉnh sửa" so={dem.sua} />
          <Chip v="hstt" nhan="Hồ sơ thanh toán" so={dem.hstt} />
          <Chip v="trao_doi" nhan="Tệp trao đổi" so={dem.trao_doi} />
          <Chip v="trao_doi" nhan="Trao đổi" so={dem.trao_doi} />
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
