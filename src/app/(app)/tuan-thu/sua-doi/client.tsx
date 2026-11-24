'use client';
import { useState } from 'react';
import { FormHanhDong, Nut } from '../ui';
import { deXuatSuaDoi, duyetSuaDoi } from '../actions';
import type { PhongBan } from '@/lib/tuan-thu/types';

type QT = { ma: string; noi_dung: string; gia_tri: string | null; phong_ban: string };

export function FormDeXuat({ hopDong, quyTac, maChon, hdChon, canChonPb }: {
  hopDong: { id: string; ten: string }[]; quyTac: Record<string, QT[]>; maChon?: string; hdChon?: string; canChonPb: boolean;
}) {
  const [hd, setHd] = useState(hdChon ?? hopDong[0]?.id ?? '');
  const [ma, setMa] = useState(maChon ?? '');
  const [loai, setLoai] = useState('');
  const qt = (quyTac[hd] ?? []).find((q) => q.ma === ma);
  const d = new Date(); d.setMonth(d.getMonth() + 1);
  const thangSau = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return (
    <FormHanhDong action={deXuatSuaDoi} nhanNut="Gửi đề xuất cho 4 head">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-[12px]">Hợp đồng
          <select name="hop_dong_id" className="field" value={hd} onChange={(e) => setHd(e.target.value)}>
            {hopDong.map((h) => <option key={h.id} value={h.id}>{h.ten}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px]">Quy tắc cần sửa
          <select name="ma_quy_tac" className="field" value={ma} onChange={(e) => setMa(e.target.value)} required>
            <option value="">— Chọn —</option>
            {(quyTac[hd] ?? []).map((q) => <option key={q.ma} value={q.ma}>{q.ma} · {q.noi_dung.slice(0, 60)}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px]">Hiệu lực từ kỳ
          <input type="month" name="hieu_luc_tu" className="field" defaultValue={thangSau} required /></label>
      </div>
      {canChonPb && (
        <label className="flex flex-col gap-1 text-[12px] max-w-xs">Phòng ban đề xuất (admin làm thay)
          <select name="phong_ban" className="field" defaultValue={qt?.phong_ban ?? 'ke_toan'}>
            <option value="ke_toan">Kế toán</option><option value="demand">Demand</option><option value="supply">Supply</option><option value="ceo">CEO</option></select></label>
      )}
      {qt && <div className="callout callout-accent text-[12px]"><b>Đang áp dụng:</b> {qt.noi_dung}{qt.gia_tri ? ` — ${qt.gia_tri}` : ''}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px]">Nội dung quy tắc mới
          <textarea name="noi_dung_moi" className="field" rows={3} required /></label>
        <label className="flex flex-col gap-1 text-[12px]">Giá trị / ngưỡng mới
          <textarea name="gia_tri_moi" className="field" rows={3} /></label>
        <label className="flex flex-col gap-1 text-[12px]">Lý do
          <textarea name="ly_do" className="field" rows={2} required /></label>
        <label className="flex flex-col gap-1 text-[12px]">Căn cứ (phụ lục, email khách đồng ý…)
          <textarea name="can_cu" className="field" rows={2} placeholder="Điều 12 HĐ: sửa đổi cần văn bản ký dưới dạng phụ lục" /></label>
      </div>
      <div className="card card-pad">
        <label className="flex flex-col gap-1 text-[12px] max-w-md">Thay đổi tham số máy (để app tự áp vào bảng kê)
          <select name="loai_tham_so" className="field" value={loai} onChange={(e) => setLoai(e.target.value)}>
            <option value="">Không đổi tham số (chỉ đổi quy tắc dạng chữ)</option>
            <option value="ky_hai_dot">Kỳ bảng kê: chia 2 đợt</option><option value="ky_thang">Kỳ bảng kê: 1 kỳ/tháng</option>
            <option value="chiet_khau">Tỷ lệ chiết khấu</option><option value="phi">Phí dịch vụ</option>
            <option value="tai_khoan">Tài khoản nhận tiền</option><option value="han_muc">Hạn mức tháng</option>
            <option value="json">Nâng cao (JSON)</option></select></label>
        <div className="grid gap-3 md:grid-cols-3 mt-2">
          {loai === 'ky_hai_dot' && <label className="flex flex-col gap-1 text-[12px]">Ngày cuối của đợt 1<input name="ngay_cat" className="field" defaultValue="15" /></label>}
          {loai === 'chiet_khau' && <><label className="flex flex-col gap-1 text-[12px]">Khách sạn (%)<input name="ck_ks" className="field" defaultValue="0" /></label>
            <label className="flex flex-col gap-1 text-[12px]">Vé máy bay (%)<input name="ck_vmb" className="field" defaultValue="0" /></label></>}
          {loai === 'phi' && <><label className="flex flex-col gap-1 text-[12px]">Phí/dòng khách sạn (đ, chưa VAT)<input name="phi_ks" className="field" defaultValue="0" /></label>
            <label className="flex flex-col gap-1 text-[12px]">Phí/dòng vé (đ, chưa VAT)<input name="phi_vmb" className="field" defaultValue="0" /></label></>}
          {loai === 'tai_khoan' && <><label className="flex flex-col gap-1 text-[12px]">Số tài khoản<input name="tk_so" className="field" /></label>
            <label className="flex flex-col gap-1 text-[12px]">Ngân hàng, chi nhánh<input name="tk_ngan_hang" className="field" /></label></>}
          {loai === 'han_muc' && <label className="flex flex-col gap-1 text-[12px]">Hạn mức (đ/tháng)<input name="han_muc" className="field" /></label>}
          {loai === 'json' && <label className="flex flex-col gap-1 text-[12px] md:col-span-3">JSON gộp vào bộ tham số<textarea name="json" className="field mono" rows={4} defaultValue="{}" /></label>}
        </div>
      </div>
    </FormHanhDong>
  );
}

export function DuyetSuaDoi({ id, pb }: { id: string; pb: PhongBan }) {
  const [y, setY] = useState('');
  return (
    <div className="flex flex-col gap-1">
      <input className="field !py-1 text-[12px]" placeholder="Ý kiến" value={y} onChange={(e) => setY(e.target.value)} />
      <div className="flex gap-1">
        <Nut chay={() => duyetSuaDoi(id, pb, 'dong_y', y)} nhan="Đồng ý" kieu="btn-primary" />
        <Nut chay={() => duyetSuaDoi(id, pb, 'khong_dong_y', y)} nhan="Không đồng ý" kieu="btn-danger" />
      </div>
    </div>
  );
}
