import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  console.warn(
    "[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. " +
      "Cloud save/load will be disabled until you add these to your .env file."
  );
}

export const supabase = url && key ? createClient(url, key) : null;

// ── Types ──────────────────────────────────────────────────────────────────

export interface SavedPlaylist {
  id: string;
  user_email: string;
  name: string;
  content: string;
  updated_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export async function fetchPlaylists(
  userEmail: string
): Promise<SavedPlaylist[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("playlists")
    .select("*")
    .eq("user_email", userEmail)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as SavedPlaylist[]) ?? [];
}

export async function savePlaylist(
  userEmail: string,
  name: string,
  content: string,
  existingId?: string
): Promise<SavedPlaylist> {
  if (!supabase) throw new Error("Supabase not configured.");

  if (existingId) {
    // Update existing row
    const { data, error } = await supabase
      .from("playlists")
      .update({ name, content, updated_at: new Date().toISOString() })
      .eq("id", existingId)
      .eq("user_email", userEmail)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as SavedPlaylist;
  }

  // Insert new row
  const { data, error } = await supabase
    .from("playlists")
    .insert({ user_email: userEmail, name, content })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SavedPlaylist;
}

export async function deletePlaylist(
  userEmail: string,
  id: string
): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured.");
  const { error } = await supabase
    .from("playlists")
    .delete()
    .eq("id", id)
    .eq("user_email", userEmail);
  if (error) throw new Error(error.message);
}
