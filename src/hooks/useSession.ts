/**
 * useSession — persists the full source playlist + user edits to localStorage
 *
 * Saves:
 *  - sourceChannels: the original full playlist (all channels, never modified)
 *  - channels: current state including enable/disable, renames, category changes
 *  - source: the source label string
 *
 * This means users can:
 *  - Come back and continue editing without re-uploading
 *  - Add channels from the original source at any time
 */

import { useCallback } from "react";
import { Channel } from "@/lib/m3u";

const KEY_CHANNELS = "t8k_session_channels";
const KEY_SOURCE   = "t8k_session_source";
const KEY_ORIGINAL = "t8k_session_original";

export interface SavedSession {
  channels:        Channel[];
  sourceChannels:  Channel[];
  source:          string;
  savedAt:         string;
}

export function useSession() {
  const saveSession = useCallback((
    channels:       Channel[],
    sourceChannels: Channel[],
    source:         string
  ) => {
    try {
      localStorage.setItem(KEY_CHANNELS, JSON.stringify(channels));
      localStorage.setItem(KEY_ORIGINAL, JSON.stringify(sourceChannels));
      localStorage.setItem(KEY_SOURCE,   source);
    } catch {
      // localStorage full — fail silently
    }
  }, []);

  const loadSession = useCallback((): SavedSession | null => {
    try {
      const channelsRaw = localStorage.getItem(KEY_CHANNELS);
      const originalRaw = localStorage.getItem(KEY_ORIGINAL);
      const source      = localStorage.getItem(KEY_SOURCE) || "";
      if (!channelsRaw) return null;
      return {
        channels:       JSON.parse(channelsRaw) as Channel[],
        sourceChannels: originalRaw ? JSON.parse(originalRaw) as Channel[] : [],
        source,
        savedAt:        "", // not tracked
      };
    } catch {
      return null;
    }
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(KEY_CHANNELS);
    localStorage.removeItem(KEY_ORIGINAL);
    localStorage.removeItem(KEY_SOURCE);
  }, []);

  const hasSession = (): boolean => !!localStorage.getItem(KEY_CHANNELS);

  return { saveSession, loadSession, clearSession, hasSession };
}
