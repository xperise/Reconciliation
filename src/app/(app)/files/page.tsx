import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { PageHeader } from '@/components/PageHeader';
import { UploadPanel } from './upload-panel';
import { FileActions } from './file-row';
import { FILE_KIND_LABEL, FileKind } from '@/lib/types';

export const dynamic = 'force-dynamic';

function kichCo(bytes: number | null): string {
  if (!bytes) return '—';
  return bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

export default async function FilesPage() {
  const user = await currentUser();
  const laKeToan = user?.role === 'admin' || user?.role === 'ke_toan';

  const [{ data: groups }, { data: files }] = await Promise.all([
    supabaseAdmin().from('billing_groups')
      .select('id, ten_nhom, ma_he_thong').eq('ngung_hop_tac', false).order('ten_nhom'),
    supabaseAdmin().from('statement_files')
      .select('*, profiles(full_name, email)')
      .order('uploaded_at', { ascending: false }).limit(200),
  ]);

  const choGui = (files ?? []).filter((f) => !f.sent_at);

  return (
    <>
      <PageHeader
        eyebrow={choGui.length ? `${choGui.length} tệp chờ gửi` : 'Kho tệp'}
        title="Tệp bảng kê"
        description="Tải bảng kê và hồ sơ thanh toán lên đây. Hệ thống đính kèm vào email và gửi cho khách."
      />

      {laKeToan && <div className="mb-5"><UploadPanel groups={groups ?? []} /></div>}

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)]">
          <h2 className="text-sm font-bold m-0">Tệp đã tải lên</h2>
        </div>

        {files?.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nhóm</th><th>Kỳ</th><th>Loại</th><th className="text-right">Bản</th>
                  <th>Tên tệp</th><th className="text-right">Dung lượng</th>
                  <th>Người tải</th><th>Trạng thái</th><th></th>
                </tr>
              </thead>
              <tbody>
                {files.map((f: any) => (
                  <tr key={f.id}>
                    <td className="mono font-medium whitespace-nowrap">{f.ma_he_thong}</td>
                    <td className="mono whitespace-nowrap">{f.ky_doi_soat}</td>
                    <td className="text-xs">{FILE_KIND_LABEL[f.kind as FileKind]}</td>
                    <td className="text-right tnum">{f.kind === 'hstt' ? '—' : f.version}</td>
                    <td className="max-w-[240px] truncate" title={f.file_name}>{f.file_name}</td>
                    <td className="text-right tnum text-[var(--muted)]">{kichCo(f.size_bytes)}</td>
                    <td className="text-xs text-[var(--muted)]">
                      {f.profiles?.full_name || f.profiles?.email || '—'}
                    </td>
                    <td>
                      {f.sent_at ? (
                        <span className="badge badge-teal">
                          Đã gửi {new Date(f.sent_at).toLocaleDateString('vi-VN')}
                        </span>
                      ) : (
                        <span className="badge badge-amber">Chờ gửi</span>
                      )}
                    </td>
                    <td><FileActions file={f} laKeToan={laKeToan} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            <strong>Chưa có tệp nào.</strong>
            Tải bảng kê đầu tiên lên bằng ô phía trên.
          </p>
        )}
      </div>
    </>
  );
}
