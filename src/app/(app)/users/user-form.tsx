'use client';
import { useState, useTransition } from 'react';
import {
  taoNguoiDung, doiTrangThaiNguoiDung, doiQuyenXemTab,
  doiMatKhauNguoiDung, xoaNguoiDung,
} from '@/app/actions';

/** Ô tick chọn tab được xem */
function TabCheckboxes({ xperise, mlx, dashboard, onChange, disabled, locked }: {
  xperise: boolean; mlx: boolean; dashboard: boolean;
  onChange: (x: boolean, m: boolean, d: boolean) => void;
  disabled?: boolean; locked?: boolean;
}) {
  const box = (label: string, checked: boolean, next: () => void) => (
    <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
      <input type="checkbox" checked={checked} disabled={disabled || locked} onChange={next} />
      {label}
    </label>
  );
  return (
    <div className="flex items-center gap-5">
      {box('Xperise', xperise, () => onChange(!xperise, mlx, dashboard))}
      {box('MLX', mlx, () => onChange(xperise, !mlx, dashboard))}
      {box('Dashboard', dashboard, () => onChange(xperise, mlx, !dashboard))}
    </div>
  );
}

export function CreateUser() {
  const [email, setEmail] = useState('');
  const [mk, setMk] = useState('');
  const [ten, setTen] = useState('');
  const [vaiTro, setVaiTro] = useState('ke_toan');
  const [xemXperise, setXemXperise] = useState(false);
  const [xemMlx, setXemMlx] = useState(false);
  const [xemDash, setXemDash] = useState(false);
  const [tb, setTb] = useState('');
  const [dangChay, start] = useTransition();

  const laAdmin = vaiTro === 'admin';
  const coTab = laAdmin || xemXperise || xemMlx || xemDash;

  function tao() {
    setTb('');
    start(async () => {
      try {
        await taoNguoiDung(email, mk, ten, vaiTro, laAdmin || xemXperise, laAdmin || xemMlx, laAdmin || xemDash);
        setTb(`Đã cấp tài khoản cho ${email}.`);
        setEmail(''); setMk(''); setTen('');
        setXemXperise(false); setXemMlx(false); setXemDash(false);
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
        <div className="sm:col-span-2">
          <span className="label">Được xem tab</span>
          <TabCheckboxes
            xperise={laAdmin || xemXperise}
            mlx={laAdmin || xemMlx}
            dashboard={laAdmin || xemDash}
            locked={laAdmin}
            onChange={(x, m, d) => { setXemXperise(x); setXemMlx(m); setXemDash(d); }}
          />
          <div className="text-xs text-[var(--ink-3)] mt-1">
            {laAdmin
              ? 'Quản trị luôn xem được cả 3 tab.'
              : coTab
                ? 'Ba quyền độc lập — cấp mỗi Dashboard cũng được.'
                : 'Chọn ít nhất 1 phần.'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={tao} disabled={dangChay || !email || mk.length < 8 || !coTab}>
          Cấp tài khoản
        </button>
        {tb && <span className="text-sm text-[var(--accent-deep)]">{tb}</span>}
      </div>
    </div>
  );
}

/** Ô tick quyền xem tab trong bảng người dùng — lưu ngay khi đổi */
export function AccessToggle({ id, xperise, mlx, dashboard, isAdmin }: {
  id: string; xperise: boolean; mlx: boolean; dashboard: boolean; isAdmin: boolean;
}) {
  const [x, setX] = useState(xperise);
  const [m, setM] = useState(mlx);
  const [d, setD] = useState(dashboard);
  const [loi, setLoi] = useState('');
  const [dangChay, start] = useTransition();

  if (isAdmin) return <span className="text-xs text-[var(--ink-3)]">Cả 3 (Quản trị)</span>;

  function doi(nx: boolean, nm: boolean, nd: boolean) {
    if (!nx && !nm && !nd) { setLoi('Giữ ít nhất 1 phần'); return; }
    const [cx, cm, cd] = [x, m, d];
    setX(nx); setM(nm); setD(nd); setLoi('');
    start(async () => {
      try { await doiQuyenXemTab(id, nx, nm, nd); }
      catch (e) { setX(cx); setM(cm); setD(cd); setLoi(e instanceof Error ? e.message : 'Không lưu được'); }
    });
  }

  return (
    <div>
      <TabCheckboxes xperise={x} mlx={m} dashboard={d} onChange={doi} disabled={dangChay} />
      {loi && <div className="text-xs text-[var(--critical)] mt-1">{loi}</div>}
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

/** Đặt lại mật khẩu: bấm nút mới hiện ô nhập, tránh lộ ô mật khẩu trên cả bảng */
export function DoiMatKhau({ id, email }: { id: string; email: string }) {
  const [mo, setMo] = useState(false);
  const [mk, setMk] = useState('');
  const [tb, setTb] = useState<{ ok: boolean; text: string } | null>(null);
  const [dangChay, start] = useTransition();

  if (!mo) {
    return (
      <button className="btn btn-sm" onClick={() => { setMo(true); setTb(null); }}>
        Đổi mật khẩu
      </button>
    );
  }

  function luu() {
    setTb(null);
    start(async () => {
      try {
        await doiMatKhauNguoiDung(id, mk);
        setTb({ ok: true, text: 'Đã đổi mật khẩu.' });
        setMk(''); setMo(false);
      } catch (e) {
        setTb({ ok: false, text: e instanceof Error ? e.message : 'Không đổi được mật khẩu.' });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          className="field mono !h-8 !w-44"
          type="text"
          autoComplete="new-password"
          placeholder="Mật khẩu mới"
          value={mk}
          onChange={(e) => setMk(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && mk.length >= 8) luu(); }}
        />
        <button className="btn btn-sm btn-primary" disabled={dangChay || mk.length < 8} onClick={luu}>
          Lưu
        </button>
        <button className="btn btn-sm" disabled={dangChay} onClick={() => { setMo(false); setMk(''); }}>
          Huỷ
        </button>
      </div>
      <div className="text-[11px] text-[var(--ink-3)]">
        {tb ? tb.text : `Tối thiểu 8 ký tự — cho ${email}`}
      </div>
    </div>
  );
}

/** Xoá hẳn tài khoản, có hộp xác nhận */
export function XoaUser({ id, email }: { id: string; email: string }) {
  const [loi, setLoi] = useState('');
  const [dangChay, start] = useTransition();

  function xoa() {
    if (!window.confirm(`Xoá hẳn tài khoản ${email}?\n\nNgười này sẽ không đăng nhập được nữa. Nhật ký thao tác cũ vẫn giữ lại. Thao tác không hoàn tác được.`)) return;
    setLoi('');
    start(async () => {
      try { await xoaNguoiDung(id); }
      catch (e) { setLoi(e instanceof Error ? e.message : 'Không xoá được.'); }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn btn-sm btn-danger" disabled={dangChay} onClick={xoa}>Xoá</button>
      {loi && <div className="text-[11px] text-[var(--critical)] max-w-[260px] text-right">{loi}</div>}
    </div>
  );
}
