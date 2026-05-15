import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search, Trash2, Download, Copy, RotateCcw, Tv,
  ToggleLeft, Link as LinkIcon, Save, ChevronLeft, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "sonner";
import { LoaderPanel } from "@/components/LoaderPanel";
import { CategoryGroup } from "@/components/CategoryGroup";
import { SummarySidebar } from "@/components/SummarySidebar";
import {
  Channel, parseM3U, exportM3U, dedupeByUrl, groupByCategory,
} from "@/lib/m3u";
import {
  supabase,
  upsertSourcePlaylist,
  upsertEditedPlaylist,
  uploadPlaylistFile,
  type SourcePlaylistRow,
} from "@/lib/supabase";

export default function EditorPage() {
  const navigate     = useNavigate();
  const [params]     = useSearchParams();
  const sourceId     = params.get("source");

  const [channels,   setChannels]   = useState<Channel[]>([]);
  const [source,     setSource]     = useState<string>("");
  const [sourceRow,  setSourceRow]  = useState<SourcePlaylistRow | null>(null);
  const [search,     setSearch]     = useState("");
  const [catFilter,  setCatFilter]  = useState<string>("all");
  const [dupes,      setDupes]      = useState(0);
  const [saving,     setSaving]     = useState(false);
  const [resyncing,  setResyncing]  = useState(false);

  // ── Load from dashboard sourceId ─────────────────────────────
  useEffect(() => {
    if (!sourceId) return;
    (async () => {
      const { data, error } = await supabase
        .from("source_playlists")
        .select("*")
        .eq("id", sourceId)
        .single();
      if (error || !data) { toast.error("Could not load playlist"); return; }
      const row = data as SourcePlaylistRow;
      setSourceRow(row);

      if (row.source_type === "url" && row.url) {
        const res = await fetch("/api/m3u-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: row.url }),
        });
        if (!res.ok) { toast.error("Could not re-fetch playlist URL"); return; }
        const text = await res.text();
        handleLoad(text, row.name, row);
      } else if (row.source_type === "xtream" && row.xtream_host && row.xtream_user) {
        toast.info(
          "Xtream playlist loaded from your saved source. Use Resync to re-fetch live data.",
          { duration: 5000 }
        );
        if (row.storage_path) {
          const { data: file, error: fe } = await supabase.storage
            .from("source-playlists")
            .download(row.storage_path);
          if (fe || !file) { toast.error("Could not download saved playlist file"); return; }
          const text = await file.text();
          handleLoad(text, row.name, row);
        }
      } else if (row.storage_path) {
        const { data: file, error: fe } = await supabase.storage
          .from("source-playlists")
          .download(row.storage_path);
        if (fe || !file) { toast.error("Could not download saved playlist file"); return; }
        const text = await file.text();
        handleLoad(text, row.name, row);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  // ── Handle new load ───────────────────────────────────────────
  const handleLoad = useCallback(async (
    content: string,
    src: string,
    existingRow?: SourcePlaylistRow | null,
    meta?: {
      type: "file" | "url" | "xtream";
      url?: string;
      xtream_host?: string;
      xtream_user?: string;
    }
  ) => {
    const parsed = parseM3U(content);
    if (!parsed.length) { toast.error("No channels found in playlist"); return; }
    setChannels(parsed);
    setSource(src);
    setSearch("");
    setCatFilter("all");
    setDupes(0);

    if (!existingRow) {
      // Auto-save source playlist (upsert — replaces previous source)
      try {
        const row = await upsertSourcePlaylist({
          name: src,
          source_type: meta?.type ?? "url",
          url: meta?.url ?? null,
          xtream_host: meta?.xtream_host ?? null,
          xtream_user: meta?.xtream_user ?? null,
          channel_count: parsed.length,
        });
        setSourceRow(row);
        toast.success("Source playlist saved to dashboard");
      } catch (err: any) {
        toast.error(`Could not save source: ${err?.message || "unknown error"}`);
      }
    } else {
      setSourceRow(existingRow);
    }
  }, []);

  const onLoadFromPanel = useCallback((
    content: string,
    src: string,
    meta?: {
      type: "file" | "url" | "xtream";
      url?: string;
      xtream_host?: string;
      xtream_user?: string;
    }
  ) => {
    handleLoad(content, src, null, meta);
  }, [handleLoad]);

  // ── Resync source from provider ───────────────────────────────
  const handleResync = async () => {
    if (!sourceRow) return;
    if (sourceRow.source_type === "file") return; // can't resync a file

    setResyncing(true);
    try {
      let content = "";
      let sourceName = sourceRow.name;

      if (sourceRow.source_type === "url" && sourceRow.url) {
        const res = await fetch("/api/m3u-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: sourceRow.url }),
        });
        if (!res.ok) { toast.error("Could not re-fetch playlist URL"); return; }
        content = await res.text();
      } else if (sourceRow.source_type === "xtream" && sourceRow.xtream_host && sourceRow.xtream_user) {
        toast.error(
          "Xtream resync requires your provider password. Please reload via the loader panel."
        );
        return;
      }

      const parsed = parseM3U(content);
      if (!parsed.length) { toast.error("No channels found after resync"); return; }

      setChannels(parsed);
      setSource(sourceName);
      setSearch("");
      setCatFilter("all");
      setDupes(0);

      // Update source record with new channel count
      const updated = await upsertSourcePlaylist({
        name: sourceName,
        source_type: sourceRow.source_type,
        url: sourceRow.url ?? null,
        xtream_host: sourceRow.xtream_host ?? null,
        xtream_user: sourceRow.xtream_user ?? null,
        channel_count: parsed.length,
      });
      setSourceRow(updated);
      toast.success(`Resynced — ${parsed.length.toLocaleString()} channels loaded`);
    } catch (err: any) {
      toast.error(err?.message || "Resync failed");
    } finally {
      setResyncing(false);
    }
  };

  // ── Save edited playlist to Supabase (upsert) ─────────────────
  const handleSaveToDashboard = async () => {
    if (!channels.length) return;
    setSaving(true);
    try {
      const enabled  = channels.filter(c => c.enabled);
      const m3uText  = exportM3U(channels);
      const name     = source || "My Playlist";
      const filename = `edited-${Date.now()}.m3u`;

      let storagePath: string | undefined;
      try {
        storagePath = await uploadPlaylistFile("edited-playlists", filename, m3uText);
      } catch {
        // Storage optional — fall back to inline if small enough
      }

      await upsertEditedPlaylist({
        source_playlist_id: sourceRow?.id ?? null,
        name,
        content: !storagePath ? m3uText : null,
        storage_path: storagePath ?? null,
        channel_count: channels.length,
        enabled_count: enabled.length,
      });

      toast.success("Playlist saved to dashboard!");
    } catch (err: any) {
      toast.error(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const categories   = useMemo(() =>
    Array.from(new Set(channels.map(c => c.category))).sort(), [channels]);
  const filtered     = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels.filter(c => {
      if (catFilter !== "all" && c.category !== catFilter) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
    });
  }, [channels, search, catFilter]);
  const grouped      = useMemo(() => groupByCategory(filtered), [filtered]);
  const groupKeys    = useMemo(() => Object.keys(grouped).sort(), [grouped]);
  const enabledCount = channels.filter(c => c.enabled).length;

  const updateChannel = (id: string, patch: Partial<Channel>) =>
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));

  const handleDedupe = () => {
    const { channels: cleaned, removed } = dedupeByUrl(channels);
    setChannels(cleaned);
    setDupes(p => p + removed);
    toast.success(
      removed > 0
        ? `Removed ${removed} duplicate${removed > 1 ? "s" : ""}`
        : "No duplicates found"
    );
  };

  const handleEnableAll  = (enabled: boolean) =>
    setChannels(prev => prev.map(c => ({ ...c, enabled })));
  const handleToggleCat  = (cat: string, enabled: boolean) =>
    setChannels(prev => prev.map(c => c.category === cat ? { ...c, enabled } : c));

  const handleReset = () => {
    setChannels([]); setSource(""); setSearch("");
    setCatFilter("all"); setDupes(0); setSourceRow(null);
  };

  const handleDownload = () => {
    const text = exportM3U(channels);
    const blob = new Blob([text], { type: "audio/x-mpegurl" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "team8k-playlist.m3u"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Playlist downloaded");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportM3U(channels));
      toast.success("Copied to clipboard");
    } catch { toast.error("Clipboard unavailable"); }
  };

  const handleGetUrl = async () => {
    try {
      const text    = exportM3U(channels.filter(c => c.enabled));
      const encoded = btoa(unescape(encodeURIComponent(text)));
      const url     = `${window.location.origin}${window.location.pathname}#playlist=${encoded}`;
      await navigator.clipboard.writeText(url);
      toast.success(`URL copied — ${enabledCount} channels`);
    } catch { toast.error("Could not generate URL"); }
  };

  const canResync = sourceRow && sourceRow.source_type !== "file";

  return (
    <div className="min-h-screen">
      {/* Back to dashboard */}
      <div className="px-4 pt-6 pb-2 max-w-6xl mx-auto">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </button>
      </div>

      <SidebarProvider style={{ minHeight: "unset" }}>
        <div
          className="flex w-full pb-16 relative overflow-x-hidden"
          style={{ minHeight: "unset" }}
        >
          {channels.length > 0 && (
            <SummarySidebar
              total={channels.length}
              enabled={enabledCount}
              categories={categories.length}
              duplicatesRemoved={dupes}
            />
          )}

          <div className="flex-1 min-w-0 flex flex-col">
            {channels.length > 0 && (
              <div className="sticky top-14 z-20 h-12 flex items-center border-b border-border/50 backdrop-blur-md px-3 bg-muted opacity-0">
                <SidebarTrigger className="text-primary hover:bg-primary/10" />
                <span className="ml-3 text-xs tracking-[0.25em] uppercase text-muted-foreground font-display">
                  Summary
                </span>
              </div>
            )}

            <div className="container max-w-6xl">
              <div className="editor-page-title">
                <h1 className="text-3xl">Premium M3U Playlist Editor &amp; Cleaner</h1>
              </div>

              {channels.length === 0 ? (
                <main className="animate-fade-in">
                  <div className="text-center mb-10">
                    <h2 className="font-display font-bold text-3xl mb-3 md:text-4xl text-center">
                      Load Your Playlist
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      Everything runs in your browser — your source is saved to
                      your dashboard automatically.
                    </p>
                  </div>
                  <LoaderPanel onLoad={onLoadFromPanel} />
                  <div className="mt-10 max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { t: "Edit & Rename",  d: "Rename any channel" },
                      { t: "Smart Dedupe",   d: "Strip duplicate URLs" },
                      { t: "Group & Filter", d: "Auto-group by category" },
                      { t: "Save & Export",  d: "Store to your dashboard" },
                    ].map(f => (
                      <div key={f.t} className="bg-gradient-card ring-gold rounded-xl p-5 text-center">
                        <h4 className="font-display font-bold text-sm mb-1">{f.t}</h4>
                        <p className="text-xs text-muted-foreground">{f.d}</p>
                      </div>
                    ))}
                  </div>
                </main>
              ) : (
                <main className="animate-fade-in space-y-6">
                  {/* Stats bar */}
                  <div className="bg-gradient-card ring-gold rounded-2xl p-5 md:p-6 shadow-elegant flex flex-wrap items-center gap-4 justify-between">
                    <div className="flex items-center gap-5">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
                        <Tv className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground truncate max-w-[280px]">
                          {source}
                        </p>
                        <p className="font-display font-bold text-lg">
                          <span className="text-gradient-gold">{enabledCount}</span>
                          <span className="text-muted-foreground"> / {channels.length} enabled</span>
                          <span className="text-muted-foreground text-sm font-normal">
                            {" "}· {categories.length} categories
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {canResync && (
                        <Button
                          variant="goldOutline"
                          size="sm"
                          onClick={handleResync}
                          disabled={resyncing}
                          title="Re-fetch latest channels from your provider"
                        >
                          <RefreshCw className={`h-4 w-4 ${resyncing ? "animate-spin" : ""}`} />
                          {resyncing ? "Syncing…" : "Resync"}
                        </Button>
                      )}
                      <Button variant="goldOutline" size="sm" onClick={() => handleEnableAll(true)}>
                        <ToggleLeft className="h-4 w-4" /> Enable all
                      </Button>
                      <Button variant="goldOutline" size="sm" onClick={() => handleEnableAll(false)}>
                        Disable all
                      </Button>
                      <Button variant="goldOutline" size="sm" onClick={handleDedupe}>
                        <Trash2 className="h-4 w-4" /> Dedupe
                      </Button>
                      <Button variant="goldOutline" size="sm" onClick={handleReset}>
                        <RotateCcw className="h-4 w-4" /> Reset
                      </Button>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="bg-gradient-card ring-gold rounded-2xl p-4 md:p-5 flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search channels…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 bg-background/60 border-border focus-visible:ring-primary"
                      />
                    </div>
                    <Select value={catFilter} onValueChange={setCatFilter}>
                      <SelectTrigger className="md:w-64 bg-background/60 border-border">
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Groups */}
                  <div className="space-y-4">
                    {groupKeys.length === 0 ? (
                      <div className="bg-gradient-card ring-gold rounded-2xl p-12 text-center text-muted-foreground">
                        No channels match your filters.
                      </div>
                    ) : (
                      groupKeys.map(cat => (
                        <CategoryGroup
                          key={cat}
                          category={cat}
                          channels={grouped[cat]}
                          defaultOpen={groupKeys.length <= 3 || !!search}
                          onToggle={(id, enabled) => updateChannel(id, { enabled })}
                          onRename={(id, name) => updateChannel(id, { name })}
                          onToggleAll={handleToggleCat}
                        />
                      ))
                    )}
                  </div>

                  {/* Export bar (sticky) */}
                  <div className="sticky bottom-0 z-30">
                    <div className="bg-gradient-card ring-gold rounded-2xl p-4 md:p-5 shadow-gold backdrop-blur-md flex flex-wrap gap-3 justify-between items-center">
                      <p className="text-sm">
                        <span className="text-muted-foreground">Ready to export </span>
                        <span className="text-gradient-gold font-display font-bold">{enabledCount}</span>
                        <span className="text-muted-foreground"> channels</span>
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        <Button variant="goldOutline" onClick={handleCopy}>
                          <Copy className="h-4 w-4" /> Copy
                        </Button>
                        <Button variant="goldOutline" onClick={handleGetUrl}>
                          <LinkIcon className="h-4 w-4" /> Get URL
                        </Button>
                        <Button variant="goldOutline" onClick={handleDownload}>
                          <Download className="h-4 w-4" /> Download
                        </Button>
                        <Button
                          variant="gold"
                          onClick={handleSaveToDashboard}
                          disabled={saving}
                        >
                          <Save className="h-4 w-4" />
                          {saving ? "Saving…" : "Save to Dashboard"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </main>
              )}
            </div>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
