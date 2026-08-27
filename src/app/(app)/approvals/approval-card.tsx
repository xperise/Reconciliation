'use client';

import { useState, useTransition } from 'react';
import { duyetPhanHoi, chotMacDinh, QuyetDinh } from '@/app/actions';

const AI_LABEL: Record<string, string> = {
  dong_y: 'Khách đồng ý',
  tu_choi: 'Khách từ chối',
  trao_doi_them: 'Khách muốn trao đổi thêm',
  review: 'Khách mới xác nhận đã nhận',
  het_vong_escalate: 'Hết vòng nhắc, khách không trả lời',
};

/** Gợi ý nút nào nên bấm dựa trên phân loại — vẫn để người quyết định. */
const GOI_Y: Record<string, QuyetDinh> = {
  dong_y: 'dong_y',
  trao_doi_them: 'can_sua',
  tu_choi: 'tu_choi',
};

export function ApprovalCard({ row }: { row: any }) {
  const [ghiChu, setGhiChu] = useState('');
  const [loi, setLoi] = useState('');
  const [dangChay, startTransition] = useTransition();

  const hetVong = row.ai_de_xuat === 'het_vong_escalate';
  const goiY = GOI_Y[row.ai_de_xuat as string];
  const tinCay = row.ai_do_tin_cay != null ? Math.round(row.ai_do_tin_cay * 100) : null;

  function quyetDinh(q: QuyetDinh) {
    setLoi('');
    startTransition(async () => {
      try { await duyetPhanHoi(row.id, q, ghiChu); }
      catch (e) { setLoi(e instanceof Error ? e.message : 'Không lưu được quyết định.'); }
    });
  }

  function chot() {
    setLoi('');
    startTransition(async () => {
      try { await chotMacDinh(row.id); }
      catch (e) { setLoi(e instanceof Error ? e.message : 'Không chốt được.'); }
    });
  }

  return (
    <article className="card overflow-hidden">
      <header className="px-4 py-3 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-bold">{row.ten_nhom}</span>
          <span className="mono text-[var(--ink-3)] ml-2">{row.ky_doi_soat}</span>
        </div>
        <span className={`badge ${hetVong ? 'badge-red' : 'badge-violet'}`}>
          {AI_LABEL[row.ai_de_xuat] ?? 'Cần xem xét'}
          {tinCay != null && !hetVong && ` · ${tinCay}%`}
        </span>
      </header>

      <div className="p-4 space-y-4">
        {row.ai_pham_vi && (
          <p className="text-sm m-0">
            <span className="eyebrow">Phạm vi</span>
            <span className="block mt-1">{row.ai_pham_vi}</span>
          </p>
        )}

        {row.ghi_chu && (
          <div>
            <p className="eyebrow m-0 mb-1">Tóm tắt</p>
            <p className="text-sm m-0 whitespace-pre-line leading-relaxed">{row.ghi_chu}</p>
          </div>
        )}

        {row.email_khach_goc && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-[var(--accent-deep)] select-none">
              Xem nguyên văn email khách
            </summary>
            <pre className="mt-2 p-3 bg-[var(--paper)] rounded-[var(--r-sm)] text-xs leading-relaxed
              whitespace-pre-wrap font-[inherit] max-h-72 overflow-auto m-0">
              {row.email_khach_goc}
            </pre>
          </details>
        )}

        {row.link_file_bang_ke && (
          <a href={row.link_file_bang_ke} target="_blank" rel="noreferrer"
             className="text-sm font-semibold text-[var(--accent-deep)] no-underline inline-block">
            Mở bảng kê đã gửi (bản {row.version_bang_ke}) ↗
          </a>
        )}

        <div>
          <label className="label" htmlFor={`gc-${row.id}`}>Ghi chú của bạn (không bắt buộc)</label>
          <textarea
            id={`gc-${row.id}`} className="field" rows={2} value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            placeholder="Lý do quyết định, nội dung cần sửa, hoặc điều đã trao đổi ngoài email."
          />
        </div>

        {loi && (
          <p role="alert" className="text-sm text-[var(--critical)] bg-[var(--critical-soft)] px-3 py-2 rounded-[var(--r-sm)] m-0">
            {loi}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {hetVong ? (
            <>
              <button onClick={chot} disabled={dangChay} className="btn btn-primary">
                Chốt mặc định và báo khách
              </button>
              <button onClick={() => quyetDinh('tu_choi')} disabled={dangChay} className="btn btn-danger">
                Chuyển xử lý tay
              </button>
            </>
          ) : (
            <>
              <button onClick={() => quyetDinh('dong_y')} disabled={dangChay}
                      className={`btn ${goiY === 'dong_y' ? 'btn-primary' : ''}`}>
                Đồng ý — chốt bảng kê
              </button>
              <button onClick={() => quyetDinh('can_sua')} disabled={dangChay}
                      className={`btn ${goiY === 'can_sua' ? 'btn-primary' : ''}`}>
                Cần sửa — gửi lại bản mới
              </button>
              <button onClick={() => quyetDinh('tu_choi')} disabled={dangChay} className="btn btn-danger">
                Từ chối — xử lý tay
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-[var(--ink-3)] m-0 leading-relaxed">
          {hetVong
            ? 'Nhóm khách này không tự động chốt. Chọn một trong hai hành động để hệ thống tiếp tục.'
            : 'Chọn "Cần sửa", rồi vào trang Tệp bảng kê tải bản chỉnh sửa lên — hệ thống gửi cho khách ngay.'}
        </p>
      </div>
    </article>
  );
}
