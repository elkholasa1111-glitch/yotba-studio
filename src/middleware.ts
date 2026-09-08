import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets, Next internal files, and public branding
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/branding') ||
    pathname === '/favicon.ico' ||
    pathname === '/login' ||
    pathname === '/admin/login' ||
    pathname === '/api/v1/admin/auth/login'
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get('yotba_admin_session')?.value;

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'غير مصرح بالوصول إلى لوحة الإدارة' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
