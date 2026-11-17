import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";
import { authForProxy } from "../auth";
import { UserRole } from "@/generated/prisma/enums";
import { getRoleHomePath, sanitizeCallbackUrl } from "@/lib/role-home";
import { drawingAccessRoles } from "@/lib/user-access";
import { isMarkdownPreferred } from "@/lib/accept-markdown";
import { createMarkdownResponse } from "@/lib/public-markdown";

const PUBLIC_INFO_PATHS = new Set([
  "/",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
]);

const MARKDOWN_NEGOTIABLE_PATHS = new Set([
  "/",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
  "/auth/login",
]);

const projectRoles = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.KOORDINATOR,
  UserRole.FIELD_TEAM,
  UserRole.DRAFTER,
];

const financeRoles = [UserRole.FINANCE, UserRole.ADMINISTRATIONS];
const approvalRoles = [UserRole.DIRECTOR, UserRole.DEPUTY_DIRECTOR];
const logisticsRoles = [
  UserRole.LOGISTICS,
  UserRole.MOVER,
  UserRole.DIRECTOR,
  UserRole.ADMINISTRATIONS,
];
const logisticsManagementRoles = logisticsRoles.filter(
  (role) => role !== UserRole.MOVER,
);
const userManagementRoles = [UserRole.ADMINISTRATIONS, UserRole.DIRECTOR];
const orderRoles = [
  UserRole.LOGISTICS,
  UserRole.ADMINISTRATIONS,
  UserRole.FINANCE,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.FIELD_TEAM,
  UserRole.KOORDINATOR,
];

function rolesForPath(pathname: string): readonly UserRole[] | null {
  if (pathname === "/apps/projects" || pathname.startsWith("/apps/projects/")) {
    return projectRoles;
  }
  if (pathname === "/apps/project" || pathname.startsWith("/apps/project/")) {
    return projectRoles;
  }
  if (pathname === "/apps/blueprints" || pathname.startsWith("/apps/blueprints/")) {
    return projectRoles;
  }
  if (pathname === "/apps/drafter" || pathname.startsWith("/apps/drafter/")) {
    return drawingAccessRoles;
  }
  if (pathname === "/apps/finance" || pathname.startsWith("/apps/finance/")) {
    return financeRoles;
  }
  if (pathname === "/apps/approvals" || pathname.startsWith("/apps/approvals/")) {
    return approvalRoles;
  }
  if (
    pathname === "/apps/logistics/stock" ||
    pathname.startsWith("/apps/logistics/stock/")
  ) {
    return logisticsManagementRoles;
  }
  if (pathname === "/apps/logistics" || pathname.startsWith("/apps/logistics/")) {
    return logisticsRoles;
  }
  if (pathname === "/apps/tickets" || pathname.startsWith("/apps/tickets/")) {
    return Object.values(UserRole).filter((role) => role !== UserRole.MOVER);
  }
  if (
    pathname === "/apps/documents" ||
    pathname.startsWith("/apps/documents/") ||
    pathname === "/apps/templates" ||
    pathname.startsWith("/apps/templates/") ||
    pathname === "/auth/register" ||
    pathname === "/dashboard/templates/new" ||
    pathname.startsWith("/dashboard/templates/")
  ) {
    return userManagementRoles;
  }
  if (pathname === "/apps/orders" || pathname.startsWith("/apps/orders/")) {
    return orderRoles;
  }
  return null;
}

const authMiddleware = authForProxy((request, event: NextFetchEvent) => {
  void event;
  const { pathname } = request.nextUrl;
  const session = request.auth;
  const user = session?.user;

  if (PUBLIC_INFO_PATHS.has(pathname)) {
    const response = NextResponse.next();
    response.headers.set("Vary", "Accept");
    return response;
  }

  if (pathname === "/login" || pathname === "/auth/login") {
    if (user?.role) {
      const callbackUrl = sanitizeCallbackUrl(
        request.nextUrl.searchParams.get("callbackUrl"),
      );
      const callbackPath = callbackUrl
        ? new URL(callbackUrl, request.url).pathname
        : null;
      const allowedCallbackRoles = callbackPath ? rolesForPath(callbackPath) : null;
      const canUseCallback =
        callbackUrl !== null &&
        (!allowedCallbackRoles || allowedCallbackRoles.includes(user.role));
      return NextResponse.redirect(
        new URL(
          canUseCallback ? callbackUrl : getRoleHomePath(user.role),
          request.url,
        ),
      );
    }
    if (pathname === "/login") {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.search = request.nextUrl.search;
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  if (!user?.id || !user.role) {
    const loginUrl = new URL("/auth/login", request.url);
    const requestedTarget = `${pathname}${request.nextUrl.search}`;
    const safeCallback = sanitizeCallbackUrl(requestedTarget);
    if (safeCallback && safeCallback !== "/") {
      loginUrl.searchParams.set("callbackUrl", safeCallback);
    }
    return NextResponse.redirect(loginUrl);
  }

  const allowedRoles = rolesForPath(pathname);
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const unauthorizedUrl = new URL("/auth/unauthorized", request.url);
    unauthorizedUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(unauthorizedUrl);
  }

  return NextResponse.next();
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  if (
    MARKDOWN_NEGOTIABLE_PATHS.has(pathname) &&
    isMarkdownPreferred(request.headers.get("accept"))
  ) {
    const markdownResponse = createMarkdownResponse(pathname);
    if (markdownResponse) {
      return markdownResponse;
    }
  }

  return authMiddleware(request, event);
}

export const config = {
  matcher: [
    "/",
    "/about",
    "/contact",
    "/terms",
    "/privacy",
    "/login",
    "/auth/login",
    "/auth/register",
    "/auth/unauthorized",
    "/apps/:path*",
    "/dashboard/:path*",
    "/user-profile/:path*",
    "/utilities/:path*",
    "/sample-page",
    "/d/:path*",
  ],
};
