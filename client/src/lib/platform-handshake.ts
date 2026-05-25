/**
 * Cross-platform redirect handshake.
 *
 * When another platform (e.g. Pinescript AI) sends a user to EdgeFlow's
 * /login page with `?platform=<slug>&returnUrl=<url>`, we log the user in
 * here and bounce them back to the originating platform with their JWT in
 * the URL.
 *
 * This is intentionally a small helper, not a hook — it's called once on
 * "login succeeded" and once when an already-logged-in user lands on the
 * page. Both call sites just want the side-effect "redirect away".
 *
 * Security: an open-redirect is the obvious risk. We require returnUrl's
 * origin to appear in `VITE_TRUSTED_RETURN_ORIGINS` (comma-separated). In
 * dev we additionally allow any `http://localhost:*` so devs don't have
 * to wire env vars to test the flow.
 */

function getTrustedOrigins(): Set<string> {
  const raw = (import.meta.env.VITE_TRUSTED_RETURN_ORIGINS as string | undefined) ?? "";
  const trusted = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const optionsFlowUrl = (import.meta.env.VITE_OPTIONS_TRADING_URL as string | undefined)?.trim();
  if (optionsFlowUrl) {
    try {
      trusted.push(new URL(optionsFlowUrl).origin);
    } catch {
      // Ignore invalid optional config; explicit trusted origins still apply.
    }
  }
  return new Set(trusted);
}

function isSameHostOptionsFlow(origin: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(origin);
    return url.hostname === window.location.hostname && url.port === "8088";
  } catch {
    return false;
  }
}

function isLocalhost(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function isTrustedReturnUrl(returnUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(returnUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const trusted = getTrustedOrigins();
  if (trusted.has(url.origin)) return true;
  if (isSameHostOptionsFlow(url.origin)) return true;
  if (import.meta.env.DEV && isLocalhost(url.origin)) return true;
  return false;
}

/**
 * If the current URL contains `?platform=&returnUrl=` and returnUrl points
 * at a trusted external origin, redirect there with the auth tokens
 * appended as query params. Returns `true` if it kicked off a redirect
 * (caller should bail out / not also call wouter navigate).
 */
export function maybeRedirectToCallingPlatform(
  token: string | null,
  refreshToken: string | null,
): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const platform = params.get("platform");
  const returnUrl = params.get("returnUrl");
  if (!platform || !returnUrl) return false;

  // returnUrl is already URL-decoded by URLSearchParams.get()
  if (!isTrustedReturnUrl(returnUrl)) {
    console.warn(
      "[platform-handshake] returnUrl origin not trusted; falling back to internal navigation",
      returnUrl,
    );
    return false;
  }

  if (!token) {
    // Not logged in yet — nothing to forward. Caller stays on /login.
    return false;
  }

  const target = new URL(returnUrl);
  target.searchParams.set("token", token);
  if (refreshToken) target.searchParams.set("refreshToken", refreshToken);

  window.location.href = target.toString();
  return true;
}
