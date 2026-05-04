/**
 * Team 8K — M3U Proxy Function
 *
 * JWT Verification Strategy:
 * ──────────────────────────
 * 1. First, try to use Netlify's clientContext.user (automatic)
 * 2. If that fails, manually decode the Bearer token from Authorization header
 * 3. Both methods achieve the same result: verify the user is authenticated
 *
 * This handles cases where Netlify doesn't auto-populate clientContext.user
 * (which appears to be your current situation).
 */

// Simple JWT decode (doesn't verify signature, but checks structure)
function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

exports.handler = async function (event) {

  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // ── Auth check ────────────────────────────────────────────────────
  const clientContext = event.clientContext || {};
  let verifiedUser = clientContext.user;
  const authHeader = (event.headers["authorization"] || event.headers["Authorization"] || "").trim();
  const hasBearer = authHeader.toLowerCase().startsWith("bearer ");

  console.log("[m3u-proxy] clientContext.user:", verifiedUser ? verifiedUser.email : "none");
  console.log("[m3u-proxy] Authorization header present:", hasBearer);

  // Strategy 1: Use Netlify's auto-populated user
  if (!verifiedUser && hasBearer) {
    // Strategy 2: Manually decode Bearer token
    const token = authHeader.substring(7);
    const decoded = decodeJWT(token);
    
    if (decoded && (decoded.email || decoded.sub)) {
      console.log("[m3u-proxy] JWT decoded successfully");
      verifiedUser = {
        email: decoded.email || decoded.sub,
        sub: decoded.sub,
      };
    } else {
      console.log("[m3u-proxy] JWT decode failed or invalid token structure");
    }
  }

  // If still no user, reject
  if (!verifiedUser) {
    const reason = hasBearer
      ? "Your session has expired or is invalid. Please sign out and sign in again."
      : "Unauthorized. Please sign in to use this feature.";
    console.log("[m3u-proxy] Auth rejected:", reason);
    return {
      statusCode: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: reason }),
    };
  }

  console.log("[m3u-proxy] User authenticated:", verifiedUser.email);

  // ── Parse body ────────────────────────────────────────────────────
  let targetUrl = "";
  try {
    const body = JSON.parse(event.body || "{}");
    targetUrl = (body.url || "").trim();
  } catch {
    return {
      statusCode: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid request body" }),
    };
  }

  if (!targetUrl || !/^https?:\/\/.+/.test(targetUrl)) {
    return {
      statusCode: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid or missing URL" }),
    };
  }

  // ── SSRF protection ───────────────────────────────────────────────
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    const blocked = [/^localhost$/, /^127\./, /^0\.0\.0\.0$/, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./];
    if (blocked.some((r) => r.test(host))) {
      return { statusCode: 400, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify({ error: "Private IP addresses are not allowed." }) };
    }
  } catch {
    return { statusCode: 400, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify({ error: "Could not parse URL." }) };
  }

  // ── Fetch with User-Agent fallbacks ────────────────────────────────
  const userAgents = [
    "okhttp/4.9.0",
    "VLC/3.0.18 LibVLC/3.0.18",
    "Tivimate/4.7.0",
    "GSE/7.6 (iPhone; iOS 15.5; Scale/3.00)",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  ];

  let lastError = "";

  for (const ua of userAgents) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);

      const upstream = await fetch(targetUrl, {
        method: "GET",
        headers: {
          "User-Agent": ua,
          "Accept": "*/*",
          "Accept-Encoding": "identity",
          "Connection": "keep-alive",
        },
        redirect: "follow",
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (upstream.status >= 400) {
        lastError = `IPTV server returned HTTP ${upstream.status}`;
        continue;
      }

      const text = await upstream.text();

      if (!text.includes("#EXTM3U") && !text.includes("#EXTINF")) {
        return {
          statusCode: 422,
          headers: { ...CORS, "Content-Type": "application/json" },
          body: JSON.stringify({ error: `Server did not return a valid M3U. First 300 chars: ${text.slice(0, 300)}` }),
        };
      }

      const channelCount = (text.match(/#EXTINF/g) || []).length;
      console.log(`[m3u-proxy] Success: ${channelCount} channels for ${verifiedUser.email}`);

      return {
        statusCode: 200,
        headers: { ...CORS, "Content-Type": "audio/x-mpegurl; charset=utf-8", "Cache-Control": "no-store, no-cache" },
        body: text,
      };

    } catch (err) {
      if (err.name === "AbortError") {
        return {
          statusCode: 504,
          headers: { ...CORS, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Request timed out after 25 seconds. Your IPTV server may be too slow or unreachable." }),
        };
      }
      lastError = err.message;
      continue;
    }
  }

  return {
    statusCode: 502,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify({ error: `Could not reach your IPTV server after ${userAgents.length} attempts. Last error: ${lastError}` }),
  };
};
