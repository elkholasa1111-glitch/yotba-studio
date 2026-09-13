import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets, Next internal files, public branding, and public media assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/branding') ||
    pathname.startsWith('/uploads') ||
    pathname.startsWith('/api/v1/media') ||
    pathname === '/favicon.ico' ||
    pathname === '/login' ||
    pathname === '/admin/login' ||
    pathname === '/api/v1/admin/auth/login' ||
    pathname === '/api/v1/admin/auth/logout'
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
