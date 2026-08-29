'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [loi, setLoi] = useState('');
  const [dangGui, setDangGui] = useState(false);

  async function dangNhap(e: React.FormEvent) {
    e.preventDefault();
    setLoi('');
    setDangGui(true);

    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: matKhau });
    if (error) {
      setLoi('Email hoặc mật khẩu không đúng. Nếu chưa có tài khoản, liên hệ quản trị viên để được cấp.');
      setDangGui(false);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-7">
          <p className="eyebrow mb-2">xperise</p>
          <h1 className="text-2xl font-bold leading-tight m-0">Đối soát bảng kê</h1>
          <p className="text-sm text-[var(--ink-3)] mt-2">
            Đăng nhập bằng tài khoản do quản trị viên cấp.
          </p>
        </div>

        <form onSubmit={dangNhap} className="card p-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required className="field" autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="mk">Mật khẩu</label>
            <input id="mk" type="password" required className="field" autoComplete="current-password"
              value={matKhau} onChange={(e) => setMatKhau(e.target.value)} />
          </div>

          {loi && (
            <p role="alert" className="text-sm text-[var(--critical)] bg-[var(--critical-soft)] px-3 py-2 rounded-[var(--r-sm)] m-0">
              {loi}
            </p>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={dangGui}>
            {dangGui ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </main>
  );
}
