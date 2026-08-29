'use client';
import { useState, useTransition } from 'react';
import { taoNguoiDung, doiTrangThaiNguoiDung } from '@/app/actions';

export function CreateUser() {
  const [email, setEmail] = useState('');
  const [mk, setMk] = useState('');
  const [ten, setTen] = useState('');
  const [vaiTro, setVaiTro] = useState('ke_toan');
  const [tb, setTb] = useState('');
  const [dangChay, start] = useTransition();

  function tao() {
    setTb('');
    start(async () => {
      try {
        await taoNguoiDung(email, mk, ten, vaiTro);
        setTb(`Đã cấp tài khoản cho ${email}.`);
        setEmail(''); setMk(''); setTen('');
      } catch (e) { setTb(e instanceof Error ? e.message : 'Không tạo được tài khoản.'); }
    });
  }

  return (
    <div className="p-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="u-ten">Họ tên</label>
          <input id="u-ten" className="field" value={ten} onChange={(e) => setTen(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="u-email">Email</label>
          <input id="u-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="u-mk">Mật khẩu tạm</label>
          <input id="u-mk" className="field mono" value={mk} onChange={(e) => setMk(e.target.value)}
                 placeholder="Tối thiểu 8 ký tự" />
        </div>
        <div>
          <label className="label" htmlFor="u-vt">Vai trò</label>
          <select id="u-vt" className="field" value={vaiTro} onChange={(e) => setVaiTro(e.target.value)}>
            <option value="ke_toan">Kế toán — duyệt phản hồi, sửa Master Data</option>
            <option value="pm">PM — can thiệp tracking</option>
            <option value="high_level">Cấp quản lý — chỉ xem</option>
            <option value="admin">Quản trị — toàn quyền</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={tao} disabled={dangChay || !email || mk.length < 8}>
          Cấp tài khoản
        </button>
        {tb && <span className="text-sm text-[var(--accent-deep)]">{tb}</span>}
      </div>
    </div>
  );
}

export function ToggleUser({ id, active }: { id: string; active: boolean }) {
  const [dangChay, start] = useTransition();
  return (
    <button className={`btn btn-sm ${active ? 'btn-danger' : ''}`} disabled={dangChay}
            onClick={() => start(() => doiTrangThaiNguoiDung(id, !active))}>
      {active ? 'Khóa' : 'Mở khóa'}
    </button>
  );
}
