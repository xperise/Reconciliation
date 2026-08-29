'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { duyetPhanHoi, chotMacDinh, QuyetDinh, CanSua } from '@/app/actions';
import { ReplyBox } from './reply-box';

const AI_LABEL: Record<string, string> = {
  dong_y: 'Khách đồng ý',
  tu_choi: 'Khách từ chối',
  trao_doi_them: 'Khách muốn trao đổi thêm',
  review: 'Khách mới báo đã nhận',
  het_vong_escalate: 'Hết vòng nhắc, khách không trả lời',
};

const AI_TONE: Record<string, string> = {
  dong_y: 'pill-stable',
  tu_choi: 'pill-critical',
  trao_doi_them: 'pill-high',
  review: 'pill-neutral',
  het_vong_escalate: 'pill-critical',
};

const GOI_Y: Record<string, QuyetDinh> = {
  dong_y: 'dong_y', trao_doi_them: 'can_sua', tu_choi: 'tu_choi', review: 'bo_qua',
};

const NHAN_QD: Record<QuyetDinh, string> = {
  dong_y: 'Đồng ý — chốt bảng kê',
  can_sua: 'Cần sửa — gửi lại bản mới',
  tu_choi: 'Từ chối — chuyển xử lý tay',
  bo_qua: 'Bỏ qua — chưa cần hành động',
};

export function ApprovalRow({ row }: { row: any }) {
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const [hoi, setHoi] = useState<QuyetDinh | null>(null);
  const [ghiChu, setGhiChu] = useState('');
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState<{ canHstt: boolean; hoSo: string | null } | null>(null);
  const [canSua, setCanSua] = useState<CanSua>('bang_ke');
  const [dangChay, start] = useTransition();

  // Khách đang góp ý về hồ sơ thanh toán hay về bảng kê
  const veHstt = row.doi_tuong_duyet === 'hstt';

  const hetVong = row.ai_de_xuat === 'het_vong_escalate';
  const chiMoiNhan = row.ai_de_xuat === 'review';
  const goiY = GOI_Y[row.ai_de_xuat as string];
  const tinCay = row.ai_do_tin_cay != null ? Math.round(row.ai_do_tin_cay * 100) : null;

  const batBuocGhiChu = hoi === 'tu_choi';
  const canCanhBao = chiMoiNhan && hoi !== null && hoi !== 'bo_qua';

  function xacNhan() {
    if (!hoi) return;
    if (batBuocGhiChu && !ghiChu.trim()) {
      setLoi('Từ chối bắt buộc phải ghi lý do.');
      return;
    }
    setLoi('');
    start(async () => {
      try {
        const kq = await duyetPhanHoi(row.id, hoi, ghiChu, hoi === 'can_sua' ? canSua : undefined);
        setHoi(null);
        setGhiChu('');
        if (hoi === 'dong_y' && kq?.canHstt) {
          setXong({ canHstt: true, hoSo: kq.hoSo });
        } else {
          router.refresh();
        }
      } catch (e) {
        setLoi(e instanceof Error ? e.message : 'Không lưu được quyết định.');
      }
    });
  }

  function chot() {
    setLoi('');
    start(async () => {
      try { await chotMacDinh(row.id); router.refresh(); }
      catch (e) { setLoi(e instanceof Error ? e.message : 'Không chốt được.'); }
    });
  }

  const ngayNhan = row.updated_at
    ? new Date(row.updated_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : '—';

  return (
    <>
      <tr onClick={() => setMo(!mo)} style={{ cursor: 'pointer' }} aria-expanded={mo}>
        <td>
          <span className="font-semibold">{row.ten_nhom}</span>
          <span className="sub mono">{row.ma_he_thong}</span>
        </td>
        <td className="mono text-[12px] whitespace-nowrap">{row.ky_doi_soat}</td>
        <td className="mono text-[11.5px] whitespace-nowrap text-[var(--ink-3)]">{ngayNhan}</td>
        <td>
          <span className={`pill pill-dot ${AI_TONE[row.ai_de_xuat] ?? 'pill-neutral'}`}>
            {AI_LABEL[row.ai_de_xuat] ?? 'Cần xem xét'}
          </span>
          <span className="sub">
            về {veHstt ? 'hồ sơ thanh toán' : 'bảng kê'}
          </span>
          {tinCay !== null && !hetVong && (
            <span className="sub mono">độ tin cậy {tinCay}%</span>
          )}
        </td>
        <td className="text-[12px] max-w-[280px] truncate" title={row.ghi_chu ?? ''}>
          {row.ghi_chu?.split('\n')[0] ?? '—'}
        </td>
        <td className="text-right no-print" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-sm" onClick={() => setMo(!mo)}>
            {mo ? 'Thu gọn' : 'Xem chi tiết'}
          </button>
        </td>
      </tr>

      {mo && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--surface-2)', padding: '16px 20px' }}>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,7fr) minmax(0,5fr)' }}>
              {/* Nguyên văn email khách */}
              <div>
                <p className="label !mb-1.5">Nguyên văn email khách</p>
                {row.email_khach_goc ? (
                  <div className="mail-body">{row.email_khach_goc}</div>
                ) : (
                  <p className="text-[12px] text-[var(--ink-3)] m-0">
                    Không lưu được nội dung thư. Mở thread trên Gmail để đọc.
                  </p>
                )}
              </div>

              {/* Thông tin và hành động */}
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="label !mb-0.5">Phạm vi khách nêu</p>
                    <p className="text-[12.5px] m-0">{row.ai_pham_vi || '—'}</p>
                  </div>
                  <div>
                    <p className="label !mb-0.5">Bản bảng kê đã gửi</p>
                    <p className="text-[12.5px] m-0 mono">bản {row.version_bang_ke}</p>
                  </div>
                </div>

                {row.ghi_chu && (
                  <div>
                    <p className="label !mb-0.5">Tóm tắt và ghi chú</p>
                    <p className="text-[12.5px] m-0 whitespace-pre-line leading-relaxed">{row.ghi_chu}</p>
                  </div>
                )}

                <p className="text-[11px] text-[var(--ink-3)] m-0 leading-relaxed">
                  Phân loại do mô hình ngôn ngữ đọc nội dung thư sinh ra, chỉ là gợi ý.
                  Quyết định cuối vẫn thuộc về bạn.
                </p>

                {loi && <p role="alert" className="callout callout-critical m-0">{loi}</p>}

                {/* Trả lời khách — độc lập với quyết định */}
                {!hoi && !xong && <ReplyBox row={row} />}

                {/* Bước 1: chọn hành động */}
                {!hoi && !xong && (
                  <div className="flex flex-wrap gap-2">
                    {hetVong ? (
                      <>
                        <button className="btn btn-primary btn-sm" onClick={chot} disabled={dangChay}>
                          Chốt mặc định và báo khách
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setHoi('tu_choi')}
                                disabled={dangChay}>
                          Chuyển xử lý tay
                        </button>
                      </>
                    ) : (
                      <>
                        {chiMoiNhan && (
                          <button className="btn btn-primary btn-sm" onClick={() => setHoi('bo_qua')}
                                  disabled={dangChay}>
                            Bỏ qua — chưa cần hành động
                          </button>
                        )}
                        <button className={`btn btn-sm ${goiY === 'dong_y' && !chiMoiNhan ? 'btn-primary' : ''}`}
                                onClick={() => setHoi('dong_y')} disabled={dangChay}>
                          Đồng ý
                        </button>
                        <button className={`btn btn-sm ${goiY === 'can_sua' ? 'btn-primary' : ''}`}
                                onClick={() => setHoi('can_sua')} disabled={dangChay}>
                          Cần sửa
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setHoi('tu_choi')}
                                disabled={dangChay}>
                          Từ chối
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Bước 2: ghi chú và xác nhận */}
                {hoi && (
                  <div className="card card-pad">
                    <p className="eyebrow mb-1.5">{NHAN_QD[hoi]}</p>

                    {hoi === 'can_sua' && !veHstt && (
                      <div className="mb-2.5">
                        <label className="label" htmlFor={`cs-${row.id}`}>Cần chỉnh sửa gì</label>
                        <select id={`cs-${row.id}`} className="field" value={canSua}
                                onChange={(e) => setCanSua(e.target.value as CanSua)}>
                          <option value="bang_ke">Bảng kê</option>
                          <option value="hoa_don">Hóa đơn điều chỉnh</option>
                          <option value="ca_hai">Cả bảng kê và hóa đơn</option>
                        </select>
                        <p className="text-[11px] text-[var(--ink-3)] mt-1 mb-0 leading-snug">
                          Nội dung này vào thư nhắc nội bộ và hiện trên Theo dõi kỳ, để người
                          chuẩn bị chứng từ biết phải làm gì mà không cần hỏi lại.
                        </p>
                      </div>
                    )}

                    {hoi === 'can_sua' && veHstt && (
                      <p className="callout callout-accent m-0 mb-2.5">
                        Kỳ sẽ chuyển sang <strong>HSTT cần chỉnh sửa</strong>. Tải bản hồ sơ
                        thanh toán mới lên là hệ thống gửi lại và đợi khách xác nhận tiếp.
                      </p>
                    )}

                    {canCanhBao && (
                      <p className="callout callout-high m-0 mb-2.5">
                        Khách chỉ mới phản hồi đã nhận thông tin, chưa có ý kiến thực chất.
                        Bạn có chắc chắn muốn hành động?
                      </p>
                    )}

                    <label className="label" htmlFor={`gc-${row.id}`}>
                      Ghi chú {batBuocGhiChu
                        ? <span style={{ color: 'var(--critical)' }}>— bắt buộc</span>
                        : '— không bắt buộc'}
                    </label>
                    <textarea
                      id={`gc-${row.id}`} className="field" rows={3} value={ghiChu}
                      onChange={(e) => setGhiChu(e.target.value)}
                      placeholder={batBuocGhiChu
                        ? 'Vì sao từ chối, và bước xử lý tiếp theo là gì'
                        : 'Lý do quyết định, nội dung cần sửa, hoặc điều đã trao đổi ngoài email'}
                    />

                    <div className="flex gap-2 mt-2.5">
                      <button className="btn btn-primary btn-sm" onClick={xacNhan} disabled={dangChay}>
                        {dangChay ? 'Đang lưu…' : 'Xác nhận'}
                      </button>
                      <button className="btn btn-sm" onClick={() => { setHoi(null); setLoi(''); }}
                              disabled={dangChay}>
                        Quay lại
                      </button>
                    </div>
                  </div>
                )}

                {/* Bước 3: nhắc chuẩn bị hồ sơ thanh toán */}
                {xong?.canHstt && (
                  <div className="card card-pad" data-status="high">
                    <p className="eyebrow mb-1.5">Đã chốt — còn một việc nữa</p>
                    <p className="text-[12.5px] m-0 mb-2 leading-relaxed">
                      Khách này yêu cầu hồ sơ thanh toán gồm:
                    </p>
                    <ul className="m-0 mb-2.5 pl-5 text-[12.5px] leading-relaxed">
                      {(xong.hoSo ?? '').split(/[,;]/).map((x) => x.trim()).filter(Boolean)
                        .map((x) => <li key={x}><strong>{x}</strong></li>)}
                    </ul>
                    <p className="text-[12px] text-[var(--ink-2)] m-0 mb-2.5 leading-relaxed">
                      Vào mục <strong>Chờ hồ sơ thanh toán</strong>, chọn đúng nhóm và kỳ,
                      đổi loại tệp sang <strong>Hồ sơ thanh toán</strong> rồi tải lên.
                      Tên tệp đặt thế nào cũng được. Một thư nhắc đã gửi tới hộp thư kế toán.
                    </p>
                    <div className="flex gap-2">
                      <a href="/hstt" className="btn btn-primary btn-sm">Mở Chờ hồ sơ thanh toán</a>
                      <button className="btn btn-sm" onClick={() => { setXong(null); router.refresh(); }}>
                        Để sau
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}

    </>
  );
}
