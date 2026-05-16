import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnon);

// ── Types ────────────────────────────────────────────────────────────────

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

/**
 * SavedPlaylist — alias used by CloudPlaylistModal and usePlaylistStorage.
 * Maps directly to EditedPlaylistRow so both systems share the same DB table.
 */
export type SavedPlaylist = {
  id: string;
  name: string;
  updated_at: string;
  content?: string | null;
  storage_path?: string | null;
  channel_count: number;
  enabled_count: number;
};

// ── Auth helper ───────────────────────────────────────────────────────────

async function getUid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data?.session?.user?.id;
  if (!uid) throw new Error("Not authenticated");
  return uid;
}

// ── Source playlist — upsert (one per user) ──────────────────────────────

export async function upsertSourcePlaylist(
  data: Omit<SourcePlaylistRow, "id" | "user_id" | "created_at" | "updated_at">
): Promise<SourcePlaylistRow> {
  const uid = await getUid();

  const { data: existing } = await supabase
    .from("source_playlists")
    .select("id")
    .eq("user_id", uid)
    .maybeSingle();

  if (existing?.id) {
    const { data: row, error } = await supabase
      .from("source_playlists")
      .update({ ...data })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return row as SourcePlaylistRow;
  } else {
    const { data: row, error } = await supabase
      .from("source_playlists")
      .insert({ ...data, user_id: uid })
      .select()
      .single();
    if (error) throw error;
    return row as SourcePlaylistRow;
  }
}

// ── Edited playlists — multiple per user ─────────────────────────────────

/** Save a brand-new named edited playlist (always creates a new row) */
export async function saveNewEditedPlaylist(
  data: Omit<EditedPlaylistRow, "id" | "user_id" | "created_at" | "updated_at">
): Promise<EditedPlaylistRow> {
  const uid = await getUid();
  const { data: row, error } = await supabase
    .from("edited_playlists")
    .insert({ ...data, user_id: uid })
    .select()
    .single();
  if (error) throw error;
  return row as EditedPlaylistRow;
}

/** Overwrite an existing edited playlist by id */
export async function updateEditedPlaylist(
  id: string,
  patch: Partial<Omit<EditedPlaylistRow, "id" | "user_id" | "created_at" | "updated_at">>
): Promise<EditedPlaylistRow> {
  const { data: row, error } = await supabase
    .from("edited_playlists")
    .update({ ...patch })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return row as EditedPlaylistRow;
}

/** Fetch all edited playlists for the current user, newest first */
export async function listEditedPlaylists(): Promise<EditedPlaylistRow[]> {
  const uid = await getUid();
  const { data, error } = await supabase
    .from("edited_playlists")
    .select("*")
    .eq("user_id", uid)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EditedPlaylistRow[];
}

/** Delete one edited playlist (and its storage file if any) */
export async function deleteEditedPlaylist(row: EditedPlaylistRow): Promise<void> {
  if (row.storage_path) {
    await supabase.storage.from("edited-playlists").remove([row.storage_path]);
  }
  const { error } = await supabase
    .from("edited_playlists")
    .delete()
    .eq("id", row.id);
  if (error) throw error;
}

// ── SavedPlaylist helpers (used by CloudPlaylistModal + usePlaylistStorage) ──
// These are thin wrappers over edited_playlists so both systems use one table.

/** Fetch all saved playlists for a user (by email — resolves uid internally) */
export async function fetchPlaylists(_userEmail: string): Promise<SavedPlaylist[]> {
  const uid = await getUid();
  const { data, error } = await supabase
    .from("edited_playlists")
    .select("id, name, updated_at, content, storage_path, channel_count, enabled_count")
    .eq("user_id", uid)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedPlaylist[];
}

/**
 * Save (create or overwrite) a playlist.
 * If existingId is provided, updates that row. Otherwise inserts a new one.
 */
export async function savePlaylist(
  _userEmail: string,
  name: string,
  content: string,
  existingId?: string
): Promise<SavedPlaylist> {
  const uid = await getUid();

  if (existingId) {
    const { data: row, error } = await supabase
      .from("edited_playlists")
      .update({ name, content, updated_at: new Date().toISOString() })
      .eq("id", existingId)
      .select("id, name, updated_at, content, storage_path, channel_count, enabled_count")
      .single();
    if (error) throw error;
    return row as SavedPlaylist;
  }

  const { data: row, error } = await supabase
    .from("edited_playlists")
    .insert({
      user_id: uid,
      name,
      content,
      channel_count: 0,
      enabled_count: 0,
    })
    .select("id, name, updated_at, content, storage_path, channel_count, enabled_count")
    .single();
  if (error) throw error;
  return row as SavedPlaylist;
}

/** Delete a playlist by id */
export async function deletePlaylist(_userEmail: string, id: string): Promise<void> {
  // Remove storage file if present
  const { data: row } = await supabase
    .from("edited_playlists")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  if (row?.storage_path) {
    await supabase.storage.from("edited-playlists").remove([row.storage_path]);
  }

  const { error } = await supabase
    .from("edited_playlists")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ── Upload file to storage ────────────────────────────────────────────────

export async function uploadPlaylistFile(
  bucket: "source-playlists" | "edited-playlists",
  filename: string,
  content: string
): Promise<string> {
  const uid = await getUid();
  const path = `${uid}/${filename}`;
  const blob = new Blob([content], { type: "audio/x-mpegurl" });

  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType: "audio/x-mpegurl",
  });

  if (error) throw error;
  return path;
}

// ── Shared playlist URLs ──────────────────────────────────────────────────

/** Generate 24-char hex slug */
function randomSlug(): string {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get the existing shared URL for an edited playlist, or create one.
 * Returns the full playlist URL ready to copy into TiviMate or any M3U player.
 */
export async function getOrCreateSharedUrl(
  editedPlaylistId: string,
  baseUrl: string
): Promise<string> {
  const uid = await getUid();

  const { data: existing } = await supabase
    .from("shared_playlists")
    .select("slug")
    .eq("edited_playlist_id", editedPlaylistId)
    .eq("user_id", uid)
    .maybeSingle();

  if (existing?.slug) {
    return `${baseUrl}/api/playlist/${existing.slug}.m3u`;
  }

  const slug = randomSlug();
  const { error } = await supabase
    .from("shared_playlists")
    .insert({ slug, edited_playlist_id: editedPlaylistId, user_id: uid });

  if (error) throw error;
  return `${baseUrl}/api/playlist/${slug}.m3u`;
}

// ── Legacy aliases ────────────────────────────────────────────────────────
export const saveSourcePlaylist  = upsertSourcePlaylist;
/** @deprecated prefer saveNewEditedPlaylist or updateEditedPlaylist */
export const upsertEditedPlaylist = saveNewEditedPlaylist;
export const saveEditedPlaylist   = saveNewEditedPlaylist;
