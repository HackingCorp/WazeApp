import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Middleware for Route Protection
 *
 * NOTE: This is a placeholder for future cookie-based authentication.
 * Currently, auth tokens are stored in localStorage (client-side only),
 * so the middleware cannot validate authentication state.
 *
 * When migrating to cookie-based auth, update this middleware to:
 * 1. Check for auth cookie presence
 * 2. Validate token expiry
 * 3. Redirect unauthenticated users to /login
 */

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/auth/callback',
  '/auth/google/callback',
  '/auth/facebook/callback',
  '/auth/microsoft/callback',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow all public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow Next.js internals, static files, and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('/favicon.ico') ||
    pathname.includes('/robots.txt') ||
    pathname.includes('/sitemap.xml')
  ) {
    return NextResponse.next();
  }

  // TODO: When implementing cookie-based auth, add validation here:
  // const authToken = request.cookies.get('auth-token');
  // if (!authToken) {
  //   return NextResponse.redirect(new URL('/login', request.url));
  // }

  // For now, allow all routes (client-side auth handles protection)
  return NextResponse.next();
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, robots.txt, sitemap.xml (metadata files)
     * - Images and other static assets (jpg, jpeg, png, svg, gif, webp, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:jpg|jpeg|png|svg|gif|webp|ico|woff|woff2|ttf|eot)).*)',
  ],
};
