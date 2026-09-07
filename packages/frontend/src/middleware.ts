import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/session-cookie';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const isAuthenticated = sessionCookie?.value === '1';

  if (!isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    const destination = `${pathname}${search}`;
    loginUrl.searchParams.set('from', destination);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/super-admin',
    '/super-admin/:path*',
  ],
};
