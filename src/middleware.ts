import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { coQuyen, isDashboardPath, isMlxPath, tabAccess, trangChu } from '@/lib/access';

/** Làm mới phiên đăng nhập và chặn truy cập khi chưa đăng nhập. */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: ((list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        }) satisfies SetAllCookies,
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;

  /**
   * Chuyển hướng phải mang theo cookie phiên vừa được làm mới. Thiếu bước này,
   * token mới bị vứt đi trong khi refresh token cũ đã dùng một lần → mất phiên
   * và bị đá về trang đăng nhập. Tài khoản chỉ xem được một tab dính nặng nhất
   * vì gần như request nào cũng bị chuyển hướng.
   */
  const chuyenHuong = (to: string) => {
    if (to === path) return res; // không bao giờ tự chuyển về chính nó
    const r = NextResponse.redirect(new URL(to, req.url));
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!user) {
    return path === '/login' ? res : chuyenHuong('/login');
  }

  const { data: profile, error: loiHoSo } = await supabase
    .from('profiles').select('*').eq('id', user.id).maybeSingle();

  /**
   * Không đọc được hồ sơ, chưa có hồ sơ, hoặc tài khoản đã khoá: đưa về trang
   * đăng nhập kèm lý do. Không áp luật phân quyền tab trong trường hợp này —
   * hồ sơ rỗng nghĩa là không có quyền nào, hai nhánh chuyển hướng sẽ đá qua
   * đá lại vô tận và trình duyệt báo ERR_TOO_MANY_REDIRECTS.
   */
  if (loiHoSo || !profile || profile.is_active === false) {
    if (path === '/login') return res;
    const to = new URL('/login', req.url);
    to.searchParams.set('loi', profile && profile.is_active === false ? 'khoa' : 'ho_so');
    const r = NextResponse.redirect(to);
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  }

  // Quyền xem tab: không có quyền thì chuyển sang tab còn lại
  const access = tabAccess(profile);

  // Không được cấp phần nào: đưa về trang đăng nhập kèm lý do, nếu không
  // mọi nhánh chuyển hướng bên dưới sẽ đá qua đá lại vô tận.
  if (!coQuyen(access)) {
    if (path === '/login') return res;
    const to = new URL('/login', req.url);
    to.searchParams.set('loi', 'khong_quyen');
    const r = NextResponse.redirect(to);
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  }
  const home = trangChu(access) ?? '/login';

  if (path === '/login') {
    // Có ?loi= nghĩa là trang trong ứng dụng vừa đẩy ra vì phiên không dùng được;
    // để trang đăng nhập hiện ra (và tự đăng xuất) thay vì đá ngược vào trong.
    if (req.nextUrl.searchParams.has('loi')) return res;
    return chuyenHuong(home);
  }
  if (path.startsWith('/api/dashboard') && !access.dashboard) {
    return NextResponse.json({ error: 'Tài khoản không có quyền xem Dashboard' }, { status: 403 });
  }
  if (isDashboardPath(path)) {
    if (!access.dashboard) return chuyenHuong(home);
    return res;
  }
  if (!path.startsWith('/api/')) {
    if (isMlxPath(path) && !access.mlx) return chuyenHuong(home);
    if (!isMlxPath(path) && !access.xperise) return chuyenHuong(home);
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron|api/google|.*\\.png$).*)'],
};
