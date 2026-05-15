export interface Channel {
  id: string;
  name: string;
  originalName: string;
  category: string;
  originalCategory: string; // tracks pre-edit group-title
  url: string;
  enabled: boolean;
  attributes: Record<string, string>;
  extraLines: string[]; // any extra lines like #EXTVLCOPT before the URL
  order: number; // explicit sort order, used by drag-and-drop
}

const ATTR_REGEX = /([a-zA-Z0-9-]+)="([^"]*)"/g;

export function parseM3U(content: string): Channel[] {
  const lines = content.split(/\r?\n/);
  const channels: Channel[] = [];
  let current: Partial<Channel> | null = null;
  let extraLines: string[] = [];
  let counter = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#EXTM3U")) continue;

    if (line.startsWith("#EXTINF")) {
      const commaIdx = line.indexOf(",");
      const meta = commaIdx >= 0 ? line.slice(0, commaIdx) : line;
      const name =
        commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : "Unnamed";

      const attributes: Record<string, string> = {};
      let m: RegExpExecArray | null;
      ATTR_REGEX.lastIndex = 0;
      while ((m = ATTR_REGEX.exec(meta)) !== null) {
        attributes[m[1]] = m[2];
      }

      const category = attributes["group-title"] || "Uncategorized";

      current = {
        id: `ch_${counter}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        originalName: name,
        category,
        originalCategory: category,
        attributes,
        enabled: true,
        order: counter,
      };
      counter++;
      extraLines = [];
      continue;
    }

    if (line.startsWith("#")) {
      if (current) extraLines.push(line);
      continue;
    }

    // URL line
    if (current) {
      current.url = line;
      current.extraLines = extraLines;
      channels.push(current as Channel);
      current = null;
      extraLines = [];
    }
  }

  return channels;
}

export function exportM3U(channels: Channel[]): string {
  const out: string[] = ["#EXTM3U"];
  // Sort by order before export
  const sorted = [...channels].sort((a, b) => a.order - b.order);
  for (const ch of sorted) {
    if (!ch.enabled) continue;
    const attrs = { ...ch.attributes, "group-title": ch.category };
    const attrStr = Object.entries(attrs)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
    const duration = attrs["tvg-duration"] || "-1";
    const prefix = attrStr
      ? `#EXTINF:${duration} ${attrStr},`
      : `#EXTINF:${duration},`;
    out.push(`${prefix}${ch.name}`);
    for (const extra of ch.extraLines || []) out.push(extra);
    out.push(ch.url);
  }
  return out.join("\n") + "\n";
}

export function dedupeByUrl(channels: Channel[]): {
  channels: Channel[];
  removed: number;
} {
  const seen = new Set<string>();
  const result: Channel[] = [];
  let removed = 0;
  for (const ch of channels) {
    const key = ch.url.trim().toLowerCase();
    if (seen.has(key)) {
      removed++;
      continue;
    }
    seen.add(key);
    result.push(ch);
  }
  return { channels: result, removed };
}

export function groupByCategory(
  channels: Channel[]
): Record<string, Channel[]> {
  const groups: Record<string, Channel[]> = {};
  for (const ch of channels) {
    (groups[ch.category] ||= []).push(ch);
  }
  // Sort channels within each group by their order field
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.order - b.order);
  }
  return groups;
}

// ── New helpers ────────────────────────────────────────────────────────────

/**
 * Rename all channels in a category (group-title) to a new category name.
 */
export function renameCategory(
  channels: Channel[],
  oldCategory: string,
  newCategory: string
): Channel[] {
  return channels.map((ch) =>
    ch.category === oldCategory
      ? { ...ch, category: newCategory, attributes: { ...ch.attributes, "group-title": newCategory } }
      : ch
  );
}

/**
 * Bulk rename channels by find/replace on the channel name.
 * Operates only on the provided set of channel IDs if supplied,
 * otherwise on all channels.
 */
export function bulkRename(
  channels: Channel[],
  find: string,
  replace: string,
  options: { caseSensitive?: boolean; regex?: boolean; ids?: Set<string> } = {}
): { channels: Channel[]; count: number } {
  const { caseSensitive = false, regex = false, ids } = options;
  let count = 0;

  const updated = channels.map((ch) => {
    if (ids && !ids.has(ch.id)) return ch;

    let newName: string;
    try {
      if (regex) {
        const flags = caseSensitive ? "g" : "gi";
        newName = ch.name.replace(new RegExp(find, flags), replace);
      } else {
        const flags = caseSensitive ? "g" : "gi";
        const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        newName = ch.name.replace(new RegExp(escaped, flags), replace);
      }
    } catch {
      // Invalid regex — skip this channel
      return ch;
    }

    if (newName !== ch.name) {
      count++;
      return { ...ch, name: newName };
    }
    return ch;
  });

  return { channels: updated, count };
}

/**
 * Reorder channels within a single category.
 * activeId moves to the position of overId.
 */
export function reorderWithinCategory(
  channels: Channel[],
  category: string,
  activeId: string,
  overId: string
): Channel[] {
  // Get ordered list of channels in this category
  const inCat = channels
    .filter((c) => c.category === category)
    .sort((a, b) => a.order - b.order);

  const activeIdx = inCat.findIndex((c) => c.id === activeId);
  const overIdx = inCat.findIndex((c) => c.id === overId);
  if (activeIdx === -1 || overIdx === -1) return channels;

  // Splice
  const reordered = [...inCat];
  const [moved] = reordered.splice(activeIdx, 1);
  reordered.splice(overIdx, 0, moved);

  // Reassign order values inside this category, preserving relative global order
  const minOrder = Math.min(...inCat.map((c) => c.order));
  const orderMap = new Map<string, number>();
  reordered.forEach((ch, i) => orderMap.set(ch.id, minOrder + i));

  return channels.map((ch) =>
    orderMap.has(ch.id) ? { ...ch, order: orderMap.get(ch.id)! } : ch
  );
}
