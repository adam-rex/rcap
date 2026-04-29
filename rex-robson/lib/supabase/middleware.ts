import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Refreshes the Supabase session from cookies and protects page routes.
 * API routes are not redirected here so webhooks (e.g. SendGrid) keep working.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;

  if (
    path === "/manifest.json" ||
    path === "/sw.js" ||
    path === "/icon" ||
    path === "/apple-icon" ||
    path.startsWith("/pwa-icon/")
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !path.startsWith("/login") && !path.startsWith("/auth")) {
    if (!path.startsWith("/api/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      const next =
        path + (request.nextUrl.searchParams.toString() ? request.nextUrl.search : "");
      url.searchParams.set("next", next || "/");
      return NextResponse.redirect(url);
    }
  }

  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
