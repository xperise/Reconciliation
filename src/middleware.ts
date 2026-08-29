import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

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

  if (!user && path !== '/login') {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (user && path === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron|api/google|.*\\.png$).*)'],
};
