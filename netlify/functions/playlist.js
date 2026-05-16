/**
 * Team 8K — Shared Playlist Serve Function
 * Serves a saved edited playlist as raw M3U for TiviMate / Kodi / VLC
 *
 * URL pattern:  /api/playlist/:slug.m3u
 * Netlify maps: /api/* → /.netlify/functions/:splat
 * So this function receives path: /playlist/abc123.m3u
 */

const { createClient } = require("@supabase/supabase-js");

exports.handler = async function (event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: CORS, body: "Method not allowed" };
  }

  // ── Extract slug from path ────────────────────────────────────
  // path arrives as: /playlist/abc123def456.m3u  (after /api prefix is stripped)
  const raw  = event.path || "";
  const match = raw.match(/\/playlist\/([a-zA-Z0-9]+)(?:\.m3u)?$/);
  if (!match) {
    return { statusCode: 400, headers: CORS, body: "Invalid playlist URL" };
  }
  const slug = match[1];

  // ── Supabase client (server-side, uses service role key for storage) ──
  const supabaseUrl  = process.env.VITE_SUPABASE_URL  || process.env.SUPABASE_URL;
  const supabaseKey  = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, headers: CORS, body: "Server configuration error" };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // ── Look up the shared playlist ───────────────────────────────
    const { data: shared, error: se } = await supabase
      .from("shared_playlists")
      .select("edited_playlist_id")
      .eq("slug", slug)
      .single();

    if (se || !shared) {
      return { statusCode: 404, headers: CORS, body: "Playlist not found" };
    }

    // ── Fetch the edited playlist content ─────────────────────────
    const { data: playlist, error: pe } = await supabase
      .from("edited_playlists")
      .select("content, storage_path, name")
      .eq("id", shared.edited_playlist_id)
      .single();

    if (pe || !playlist) {
      return { statusCode: 404, headers: CORS, body: "Playlist content not found" };
    }

    let content = playlist.content;

    // If stored in Supabase Storage instead of inline
    if (!content && playlist.storage_path) {
      const { data: file, error: fe } = await supabase.storage
        .from("edited-playlists")
        .download(playlist.storage_path);

      if (fe || !file) {
        return { statusCode: 500, headers: CORS, body: "Could not retrieve playlist file" };
      }
      content = await file.text();
    }

    if (!content) {
      return { statusCode: 404, headers: CORS, body: "Playlist is empty" };
    }

    // ── Serve as M3U ──────────────────────────────────────────────
    const filename = (playlist.name || "playlist").replace(/[^a-z0-9]/gi, "-").toLowerCase();
    return {
      statusCode: 200,
      headers: {
        ...CORS,
        "Content-Type": "audio/x-mpegurl; charset=utf-8",
        "Content-Disposition": `inline; filename="${filename}.m3u"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
      body: content,
    };

  } catch (err) {
    console.error("playlist function error:", err);
    return { statusCode: 500, headers: CORS, body: "Internal server error" };
  }
};
