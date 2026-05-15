import { createClient } from "@supabase/supabase-js";

// ── These come from Netlify environment variables ─────────────────────────
// In your Netlify dashboard: Site → Environment variables → add:
//   VITE_SUPABASE_URL      = https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY = eyJ...
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnon);

// ── Typed helpers ────────────────────────────────────────────────────────

export type SourcePlaylistRow = {
  id: string;
  user_id: string;
  name: string;
  source_type: "file" | "url" | "xtream";
  url?: string | null;
  xtream_host?: string | null;
  xtream_user?: string | null;
  storage_path?: string | null;
  channel_count: number;
  created_at: string;
  updated_at: string;
};

export type EditedPlaylistRow = {
  id: string;
  user_id: string;
  source_playlist_id?: string | null;
  name: string;
  content?: string | null;
  storage_path?: string | null;
  channel_count: number;
  enabled_count: number;
  created_at: string;
  updated_at: string;
};

// ── Save source playlist metadata ────────────────────────────────────────
export async function saveSourcePlaylist(
  data: Omit<SourcePlaylistRow, "id" | "user_id" | "created_at" | "updated_at">
) {
  const { data: session } = await supabase.auth.getSession();
  const uid = session?.session?.user?.id;
  if (!uid) throw new Error("Not authenticated");

  const { data: row, error } = await supabase
    .from("source_playlists")
    .insert({ ...data, user_id: uid })
    .select()
    .single();

  if (error) throw error;
  return row as SourcePlaylistRow;
}

// ── Save edited playlist ─────────────────────────────────────────────────
export async function saveEditedPlaylist(
  data: Omit<EditedPlaylistRow, "id" | "user_id" | "created_at" | "updated_at">
) {
  const { data: session } = await supabase.auth.getSession();
  const uid = session?.session?.user?.id;
  if (!uid) throw new Error("Not authenticated");

  const { data: row, error } = await supabase
    .from("edited_playlists")
    .insert({ ...data, user_id: uid })
    .select()
    .single();

  if (error) throw error;
  return row as EditedPlaylistRow;
}

// ── Upload file to a user-scoped storage path ────────────────────────────
export async function uploadPlaylistFile(
  bucket: "source-playlists" | "edited-playlists",
  filename: string,
  content: string
): Promise<string> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session?.session?.user?.id;
  if (!uid) throw new Error("Not authenticated");

  const path = `${uid}/${filename}`;
  const blob = new Blob([content], { type: "audio/x-mpegurl" });

  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType: "audio/x-mpegurl",
  });

  if (error) throw error;
  return path;
}
