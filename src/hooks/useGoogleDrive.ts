/**
 * useGoogleDrive — PKCE OAuth + Drive upload/update
 *
 * Flow:
 *  1. User clicks "Save to Drive"
 *  2. We generate a PKCE code_verifier + code_challenge
 *  3. Redirect to Google consent screen
 *  4. Google redirects back with ?code=...
 *  5. Our Netlify function exchanges code → access_token + refresh_token
 *  6. We upload (or update) the M3U file
 *  7. On future visits, we use the stored refresh_token silently
 */

import { useState, useEffect, useCallback } from "react";

const CLIENT_ID    = import.meta.env.VITE_GDRIVE_CLIENT_ID || "";
const REDIRECT_URI = window.location.origin;
const SCOPE        = "https://www.googleapis.com/auth/drive.file";

// localStorage keys
const KEY_REFRESH  = "t8k_gdrive_refresh";
const KEY_FILE_ID  = "t8k_gdrive_file_id";
const KEY_FILE_URL = "t8k_gdrive_file_url";
const KEY_VERIFIER = "t8k_pkce_verifier";
const KEY_PENDING  = "t8k_pending_upload"; // serialised Channel[] waiting for auth

// ── PKCE helpers ──────────────────────────────────────────────────────────────
async function generatePKCE() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const encoder  = new TextEncoder();
  const data     = encoder.encode(verifier);
  const digest   = await crypto.subtle.digest("SHA-256", data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  return { verifier, challenge };
}

function buildAuthUrl(challenge: string) {
  const p = new URLSearchParams({
    client_id:             CLIENT_ID,
    redirect_uri:          REDIRECT_URI,
    response_type:         "code",
    scope:                 SCOPE,
    access_type:           "offline",
    prompt:                "consent",
    code_challenge:        challenge,
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

// ── Drive API helpers ─────────────────────────────────────────────────────────
async function driveUpload(
  accessToken: string,
  content: string,
  existingFileId?: string
): Promise<string> {
  const fileName = "team8k-playlist.m3u";
  const mimeType = "audio/x-mpegurl";
  const boundary = "t8k_boundary";

  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: fileName, mimeType }) +
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n` +
    content +
    `\r\n--${boundary}--`;

  const method   = existingFileId ? "PATCH" : "POST";
  const endpoint = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

  const res = await fetch(endpoint, {
    method,
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${txt.slice(0, 200)}`);
  }

  const data = await res.json();

  // Make publicly readable so the URL works in any player
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${data.id}/permissions`,
    {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    }
  );

  return data.id;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useGoogleDrive() {
  const [uploading,  setUploading]  = useState(false);
  const [driveUrl,   setDriveUrl]   = useState<string>(() => localStorage.getItem(KEY_FILE_URL) || "");
  const [driveFileId, setDriveFileId] = useState<string>(() => localStorage.getItem(KEY_FILE_ID) || "");
  const [accessToken, setAccessToken] = useState<string>("");

  // ── Get a fresh access token from refresh token ───────────────
  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const stored = localStorage.getItem(KEY_REFRESH);
    if (!stored) return null;
    try {
      const res  = await fetch("/.netlify/functions/gdrive-refresh", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ refreshToken: stored }),
      });
      const data = await res.json();
      if (data.access_token) {
        setAccessToken(data.access_token);
        return data.access_token;
      }
    } catch { /* fall through */ }
    return null;
  }, []);

  // ── On mount: handle OAuth redirect ?code= ────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get("code");
    if (!code) return;

    // Clean URL immediately
    window.history.replaceState(null, "", window.location.pathname);

    const verifier = localStorage.getItem(KEY_VERIFIER);
    if (!verifier) return;

    (async () => {
      try {
        const res  = await fetch("/.netlify/functions/gdrive-auth", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ code, codeVerifier: verifier }),
        });
        const data = await res.json();
        if (!data.access_token) throw new Error(data.error || "No token received");

        localStorage.removeItem(KEY_VERIFIER);
        if (data.refresh_token) localStorage.setItem(KEY_REFRESH, data.refresh_token);
        setAccessToken(data.access_token);

        // If there was a pending upload, do it now
        const pending = localStorage.getItem(KEY_PENDING);
        if (pending) {
          localStorage.removeItem(KEY_PENDING);
          // Dispatch custom event so Index.tsx can trigger the upload
          window.dispatchEvent(new CustomEvent("gdrive-ready", {
            detail: { token: data.access_token, pendingContent: pending }
          }));
        }
      } catch (err: unknown) {
        console.error("Google auth failed:", err);
      }
    })();
  }, []);

  // ── Main upload function ──────────────────────────────────────
  const saveToDrive = useCallback(async (m3uContent: string): Promise<string | null> => {
    if (!CLIENT_ID) { alert("Google Drive not configured."); return null; }

    setUploading(true);
    try {
      // Get a valid token
      let token = accessToken;
      if (!token) token = await refreshAccessToken() || "";

      if (!token) {
        // Need to auth — save content and redirect
        const { verifier, challenge } = await generatePKCE();
        localStorage.setItem(KEY_VERIFIER, verifier);
        localStorage.setItem(KEY_PENDING, m3uContent);
        window.location.href = buildAuthUrl(challenge);
        return null; // Page is redirecting
      }

      const existingId = driveFileId || localStorage.getItem(KEY_FILE_ID) || undefined;
      const fileId     = await driveUpload(token, m3uContent, existingId);
      const url        = `https://drive.google.com/uc?export=download&id=${fileId}`;

      setDriveFileId(fileId);
      setDriveUrl(url);
      localStorage.setItem(KEY_FILE_ID,  fileId);
      localStorage.setItem(KEY_FILE_URL, url);

      return url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      throw new Error(msg);
    } finally {
      setUploading(false);
    }
  }, [accessToken, driveFileId, refreshAccessToken]);

  const isConnected = !!localStorage.getItem(KEY_REFRESH);

  return { saveToDrive, uploading, driveUrl, driveFileId, isConnected, refreshAccessToken };
}
