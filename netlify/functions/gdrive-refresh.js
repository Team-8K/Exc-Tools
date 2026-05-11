/**
 * Google Drive OAuth — Refresh Token
 * Exchanges a refresh token for a new access token.
 */

exports.handler = async function (event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers: CORS, body: "" };

  const CLIENT_ID = process.env.VITE_GDRIVE_CLIENT_ID || "";

  let refreshToken;
  try {
    refreshToken = JSON.parse(event.body || "{}").refreshToken || "";
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid body" }) };
  }

  if (!refreshToken) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing refreshToken" }) };
  }

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    grant_type:    "refresh_token",
    refresh_token: refreshToken,
  });

  const res  = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    params.toString(),
  });

  const data = await res.json();

  if (!res.ok) {
    return {
      statusCode: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: data.error_description || "Refresh failed" }),
    };
  }

  return {
    statusCode: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: data.access_token,
      expires_in:   data.expires_in || 3600,
    }),
  };
};
