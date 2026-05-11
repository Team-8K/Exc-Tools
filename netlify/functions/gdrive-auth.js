/**
 * Google Drive OAuth PKCE — Token Exchange
 * Exchanges an authorization code for an access token server-side.
 * Uses PKCE so no client secret is needed in the frontend.
 */

exports.handler = async function (event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: "" };

  const CLIENT_ID     = process.env.VITE_GDRIVE_CLIENT_ID || "";
  const REDIRECT_URI  = process.env.GDRIVE_REDIRECT_URI   || "";

  if (!CLIENT_ID || !REDIRECT_URI) {
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server not configured for Google Drive." }),
    };
  }

  let code, codeVerifier;
  try {
    const body  = JSON.parse(event.body || "{}");
    code         = body.code         || "";
    codeVerifier = body.codeVerifier || "";
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid body" }) };
  }

  if (!code || !codeVerifier) {
    return {
      statusCode: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing code or codeVerifier" }),
    };
  }

  // Exchange code for token — PKCE, no client_secret required
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    grant_type:    "authorization_code",
    code,
    code_verifier: codeVerifier,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    params.toString(),
  });

  const data = await res.json();

  if (!res.ok) {
    return {
      statusCode: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: data.error_description || "Token exchange failed" }),
    };
  }

  return {
    statusCode: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token:  data.access_token,
      refresh_token: data.refresh_token || null,
      expires_in:    data.expires_in    || 3600,
    }),
  };
};
