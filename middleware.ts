import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession, roleCanAccess } from "@/lib/auth";

const STAFF_PREFIXES = ["/doctor", "/admin"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isStaffRoute = STAFF_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isStaffRoute) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!roleCanAccess(session.role, pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "forbidden");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/doctor/:path*", "/admin/:path*"],
};
