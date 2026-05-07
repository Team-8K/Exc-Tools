/**
 * Team 8K — M3U Proxy Function
 *
 * Fetches M3U/Xtream playlists server-side to bypass CORS restrictions.
 * Tries multiple URL variants and User-Agent strings for maximum compatibility.
 */

function decodeJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // Fix base64url padding
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Build URL variants to try for Xtream Codes compatibility.
 * Different providers require different type/output combinations.
 */
function buildUrlVariants(originalUrl) {
  try {
    const u = new URL(originalUrl);

    // If this doesn't look like a get.php Xtream URL, just return as-is
    if (!u.pathname.includes("get.php") && !u.searchParams.has("username")) {
      return [originalUrl];
    }

    const base = `${u.protocol}//${u.host}${u.pathname}`;
    const username = u.searchParams.get("username") || "";
    const password = u.searchParams.get("password") || "";

    if (!username) return [originalUrl];

    const enc = encodeURIComponent;
    const creds = `username=${enc(username)}&password=${enc(password)}`;

    return [
      // Most compatible: m3u_plus with ts
      `${base}?${creds}&type=m3u_plus&output=ts`,
      // m3u_plus without output (many providers)
      `${base}?${creds}&type=m3u_plus`,
      // m3u_plus with mpegts
      `${base}?${creds}&type=m3u_plus&output=mpegts`,
      // Plain m3u
      `${base}?${creds}&type=m3u`,
      // Original as last resort
      originalUrl,
    ].filter((v, i, arr) => arr.indexOf(v) === i);
  } catch {
    return [originalUrl];
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

exports.handler = async function (event) {
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

  if (!verifiedUser && hasBearer) {
    const token = authHeader.substring(7);
    const decoded = decodeJWT(token);
    if (decoded && (decoded.email || decoded.sub)) {
      verifiedUser = { email: decoded.email || decoded.sub, sub: decoded.sub };
    }
  }

  if (!verifiedUser) {
    const reason = hasBearer
      ? "Your session has expired or is invalid. Please sign out and sign in again."
      : "Unauthorized. Please sign in to use this feature.";
    return {
      statusCode: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: reason }),
    };
  }

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
    const blocked = [
      /^localhost$/,
      /^127\./,
      /^0\.0\.0\.0$/,
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^169\.254\./,
      /^::1$/,
    ];
    if (blocked.some((r) => r.test(host))) {
      return {
        statusCode: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Private IP addresses are not allowed." }),
      };
    }
  } catch {
    return {
      statusCode: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Could not parse URL." }),
    };
  }

  const urlVariants = buildUrlVariants(targetUrl);

  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36",
    "VLC/3.0.20 LibVLC/3.0.20",
    "Tivimate/4.7.0",
    "okhttp/4.12.0",
  ];

  let lastError = "";
  let credentialError = null;

  for (const url of urlVariants) {
    for (const ua of userAgents) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 40000);

        const upstream = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": ua,
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
          },
          redirect: "follow",
          signal: controller.signal,
        });

        clearTimeout(timer);

        // Credential rejection — no point retrying other UAs
        if (upstream.status === 401 || upstream.status === 403) {
          credentialError = `Your IPTV provider rejected the credentials (HTTP ${upstream.status}). Please verify your username and password.`;
          break;
        }

        if (upstream.status >= 400) {
          lastError = `Server returned HTTP ${upstream.status}`;
          continue;
        }

        const text = await upstream.text();

        if (!text || text.trim().length === 0) {
          lastError = "Empty response from server";
          continue;
        }

        // Check for Xtream JSON auth failure
        try {
          const json = JSON.parse(text);
          if (json && json.user_info && json.user_info.auth === 0) {
            credentialError = "Your IPTV provider rejected the credentials. Please verify your username and password.";
            break;
          }
        } catch {
          // Not JSON — that's fine, continue to M3U check
        }

        if (text.includes("#EXTM3U") || text.includes("#EXTINF")) {
          const channelCount = (text.match(/#EXTINF/g) || []).length;
          console.log(`[m3u-proxy] OK: ${channelCount} channels via ${url.split("?")[0]} for ${verifiedUser.email}`);
          return {
            statusCode: 200,
            headers: {
              ...CORS,
              "Content-Type": "audio/x-mpegurl; charset=utf-8",
              "Cache-Control": "no-store, no-cache",
            },
            body: text,
          };
        }

        lastError = `Not a valid M3U. Response preview: ${text.slice(0, 200)}`;
        // Non-M3U response for this URL variant — try next variant, skip remaining UAs
        break;
      } catch (err) {
        clearTimeout && clearTimeout();
        if (err.name === "AbortError") {
          return {
            statusCode: 504,
            headers: { ...CORS, "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "Request timed out after 40 seconds. Your IPTV server may be slow or unreachable.",
            }),
          };
        }
        lastError = err.message;
        continue;
      }
    }

    if (credentialError) {
      return {
        statusCode: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: credentialError }),
      };
    }
  }

  return {
    statusCode: 502,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify({
      error: `Could not retrieve a valid playlist. Last error: ${lastError}`,
    }),
  };
};
