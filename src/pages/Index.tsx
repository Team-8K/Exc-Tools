import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Trash2, Download, Copy, RotateCcw, Tv, ToggleLeft,
  CloudUpload, Check, ExternalLink, History, PlusCircle, X
} from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "sonner";
import { LoaderPanel }    from "@/components/LoaderPanel";
import { CategoryGroup }  from "@/components/CategoryGroup";
import { SummarySidebar } from "@/components/SummarySidebar";
import {
  Channel, parseM3U, exportM3U, dedupeByUrl, groupByCategory,
} from "@/lib/m3u";
import { useGoogleDrive } from "@/hooks/useGoogleDrive";
import { useSession }     from "@/hooks/useSession";

const Index = () => {
  // ── Core state ────────────────────────────────────────────────
  const [channels,       setChannels]       = useState<Channel[]>([]);
  const [sourceChannels, setSourceChannels] = useState<Channel[]>([]); // full original
  const [source,         setSource]         = useState("");
  const [search,         setSearch]         = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);

  // Add-channels modal
  const [addModalOpen,  setAddModalOpen]  = useState(false);
  const [addSearch,     setAddSearch]     = useState("");
  const [addSelected,   setAddSelected]   = useState<Set<string>>(new Set());

  const { saveToDrive, uploading, driveUrl, isConnected } = useGoogleDrive();
  const { saveSession, loadSession, clearSession, hasSession } = useSession();

  // ── Handle OAuth redirect after Google auth ───────────────────
  useEffect(() => {
    const onReady = (e: Event) => {
      const { token, pendingContent } = (e as CustomEvent).detail;
      if (pendingContent) {
        doSaveToDrive(token, pendingContent);
      }
    };
    window.addEventListener("gdrive-ready", onReady);
    return () => window.removeEventListener("gdrive-ready", onReady);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load playlist ─────────────────────────────────────────────
  const handleLoad = (content: string, src: string) => {
    const parsed = parseM3U(content);
    if (!parsed.length) { toast.error("No channels found in playlist"); return; }
    setChannels(parsed);
    setSourceChannels(parsed); // save original source
    setSource(src);
    setSearch("");
    setCategoryFilter("all");
    setDuplicatesRemoved(0);
    // Auto-save session
    saveSession(parsed, parsed, src);
    toast.success(`Loaded ${parsed.length.toLocaleString()} channels`);
  };

  // ── Restore saved session ────────────────────────────────────
  const handleRestoreSession = () => {
    const session = loadSession();
    if (!session) return;
    setChannels(session.channels);
    setSourceChannels(session.sourceChannels);
    setSource(session.source);
    setSearch("");
    setCategoryFilter("all");
    setDuplicatesRemoved(0);
    toast.success("Session restored — continue where you left off");
  };

  // ── Auto-save session on channel changes ─────────────────────
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (channels.length > 0) saveSession(channels, sourceChannels, source);
  }, [channels, source, sourceChannels, saveSession]);

  // ── Derived values ────────────────────────────────────────────
  const categories = useMemo(
    () => Array.from(new Set(channels.map((c) => c.category))).sort(),
    [channels]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels.filter((c) => {
      if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
    });
  }, [channels, search, categoryFilter]);

  const grouped   = useMemo(() => groupByCategory(filtered), [filtered]);
  const groupKeys = useMemo(() => Object.keys(grouped).sort(), [grouped]);
  const enabledCount = channels.filter((c) => c.enabled).length;

  // ── Channel actions ───────────────────────────────────────────
  const updateChannel = (id: string, patch: Partial<Channel>) =>
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const handleDedupe = () => {
    const { channels: cleaned, removed } = dedupeByUrl(channels);
    setChannels(cleaned);
    setDuplicatesRemoved((p) => p + removed);
    toast.success(removed > 0 ? `Removed ${removed} duplicate${removed > 1 ? "s" : ""}` : "No duplicates found");
  };

  const handleEnableAll = (enabled: boolean) =>
    setChannels((prev) => prev.map((c) => ({ ...c, enabled })));

  const handleToggleCategoryAll = (cat: string, enabled: boolean) =>
    setChannels((prev) => prev.map((c) => (c.category === cat ? { ...c, enabled } : c)));

  const handleReset = () => {
    setChannels([]); setSourceChannels([]); setSource("");
    setSearch(""); setCategoryFilter("all"); setDuplicatesRemoved(0);
    clearSession();
  };

  // ── Add channels from source ──────────────────────────────────
  const sourceNotInPlaylist = useMemo(() => {
    const currentUrls = new Set(channels.map((c) => c.url));
    return sourceChannels.filter((c) => !currentUrls.has(c.url));
  }, [channels, sourceChannels]);

  const addFiltered = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    if (!q) return sourceNotInPlaylist;
    return sourceNotInPlaylist.filter(
      (c) => c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
    );
  }, [sourceNotInPlaylist, addSearch]);

  const addGrouped  = useMemo(() => groupByCategory(addFiltered), [addFiltered]);
  const addGroupKeys = useMemo(() => Object.keys(addGrouped).sort(), [addGrouped]);

  const handleConfirmAdd = () => {
    if (addSelected.size === 0) return;
    const toAdd = sourceChannels.filter((c) => addSelected.has(c.id));
    setChannels((prev) => [...prev, ...toAdd]);
    setAddSelected(new Set());
    setAddModalOpen(false);
    toast.success(`Added ${toAdd.length} channel${toAdd.length > 1 ? "s" : ""}`);
  };

  // ── Export ────────────────────────────────────────────────────
  const getM3U = () => exportM3U(channels.filter((c) => c.enabled));

  const handleDownload = () => {
    const blob = new Blob([getM3U()], { type: "audio/x-mpegurl" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "team8k-playlist.m3u"; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded — ${enabledCount} channels`);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getM3U());
      toast.success(`Copied — ${enabledCount} channels`);
    } catch { toast.error("Clipboard unavailable"); }
  };

  // ── Google Drive ──────────────────────────────────────────────
  const doSaveToDrive = async (token?: string, content?: string) => {
    const m3u = content || getM3U();
    if (!m3u.includes("#EXTINF")) { toast.error("No enabled channels to save"); return; }
    try {
      const url = token
        ? await saveToDrive(m3u)   // called after auth redirect
        : await saveToDrive(m3u);  // normal call
      if (url) {
        await navigator.clipboard.writeText(url).catch(() => {});
        toast.success("Saved to Google Drive — URL copied!");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Drive upload failed");
    }
  };

  const handleCopyDriveUrl = async () => {
    if (!driveUrl) return;
    await navigator.clipboard.writeText(driveUrl);
    toast.success("URL copied");
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <SidebarProvider style={{ minHeight: "unset" }}>
      <div className="flex w-full pb-16 relative overflow-x-hidden" style={{ minHeight: "unset" }}>
        {channels.length > 0 && (
          <SummarySidebar
            total={channels.length}
            enabled={enabledCount}
            categories={categories.length}
            duplicatesRemoved={duplicatesRemoved}
          />
        )}
        <div className="flex-1 min-w-0 flex flex-col">
          {channels.length > 0 && (
            <div className="sticky top-16 z-20 h-12 flex items-center border-b border-border/50 backdrop-blur-md px-3 bg-muted opacity-0">
              <SidebarTrigger className="text-primary hover:bg-primary/10" />
              <span className="ml-3 text-xs tracking-[0.25em] uppercase text-muted-foreground font-display">Summary</span>
            </div>
          )}

          <div className="container max-w-6xl">
            <div className="editor-page-title">
              <h1 className="text-3xl">Premium M3U Playlist Editor &amp; Cleaner</h1>
            </div>

            {channels.length === 0 ? (
              <main className="animate-fade-in">
                <div className="text-center mb-10">
                  <h2 className="font-display font-bold text-3xl mb-3 md:text-4xl">Load Your Playlist</h2>
                  <p className="text-muted-foreground text-sm">Everything runs in your browser — nothing is stored or uploaded.</p>
                </div>

                {/* Continue editing banner */}
                {hasSession() && (
                  <div className="max-w-2xl mx-auto mb-6">
                    <div className="bg-primary/10 border border-primary/30 rounded-2xl p-5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <History className="h-5 w-5 text-primary shrink-0" />
                        <div>
                          <p className="font-display font-bold text-sm text-primary">Saved session found</p>
                          <p className="text-xs text-muted-foreground">Continue editing your last playlist without re-uploading.</p>
                        </div>
                      </div>
                      <Button variant="gold" size="sm" onClick={handleRestoreSession}>
                        Continue editing
                      </Button>
                    </div>
                  </div>
                )}

                <LoaderPanel onLoad={handleLoad} />

                <div className="mt-10 max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { t: "Edit & Rename",  d: "Rename any channel" },
                    { t: "Smart Dedupe",   d: "Strip duplicate URLs" },
                    { t: "Group & Filter", d: "Auto-group by category" },
                    { t: "Clean Export",   d: "Valid M3U output" },
                  ].map((f) => (
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
                      <p className="text-xs text-muted-foreground truncate max-w-[280px]">{source}</p>
                      <p className="font-display font-bold text-lg">
                        <span className="text-gradient-gold">{enabledCount}</span>
                        <span className="text-muted-foreground"> / {channels.length} enabled</span>
                        <span className="text-muted-foreground text-sm font-normal"> · {categories.length} categories</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="goldOutline" size="sm" onClick={() => handleEnableAll(true)}>
                      <ToggleLeft className="h-4 w-4" /> Enable all
                    </Button>
                    <Button variant="goldOutline" size="sm" onClick={() => handleEnableAll(false)}>Disable all</Button>
                    <Button variant="goldOutline" size="sm" onClick={handleDedupe}>
                      <Trash2 className="h-4 w-4" /> Dedupe
                    </Button>
                    {sourceNotInPlaylist.length > 0 && (
                      <Button variant="goldOutline" size="sm" onClick={() => setAddModalOpen(true)}>
                        <PlusCircle className="h-4 w-4" /> Add Channels
                      </Button>
                    )}
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
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 bg-background/60 border-border focus-visible:ring-primary"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="md:w-64 bg-background/60 border-border">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Channel groups */}
                <div className="space-y-4">
                  {groupKeys.length === 0 ? (
                    <div className="bg-gradient-card ring-gold rounded-2xl p-12 text-center text-muted-foreground">
                      No channels match your filters.
                    </div>
                  ) : (
                    groupKeys.map((cat) => (
                      <CategoryGroup
                        key={cat}
                        category={cat}
                        channels={grouped[cat]}
                        defaultOpen={groupKeys.length <= 3 || !!search}
                        onToggle={(id, enabled) => updateChannel(id, { enabled })}
                        onRename={(id, name)    => updateChannel(id, { name })}
                        onToggleAll={handleToggleCategoryAll}
                      />
                    ))
                  )}
                </div>

                {/* Drive URL display */}
                {driveUrl && (
                  <div className="bg-gradient-card ring-gold rounded-2xl p-4 md:p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <p className="text-sm font-display font-bold text-green-500">Saved to Google Drive</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Paste this URL into TiviMate, Smarters, or any IPTV player.
                      Every time you click "Update Drive", this same URL updates automatically.
                    </p>
                    <div className="flex gap-2 items-center">
                      <code className="flex-1 text-xs bg-background/60 border border-border rounded-lg px-3 py-2 truncate text-primary">
                        {driveUrl}
                      </code>
                      <Button variant="goldOutline" size="sm" onClick={handleCopyDriveUrl}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="goldOutline" size="sm" onClick={() => window.open(driveUrl, "_blank")}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Export bar — sticky */}
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
                      <Button variant="goldOutline" onClick={() => doSaveToDrive()} disabled={uploading}>
                        <CloudUpload className="h-4 w-4" />
                        {uploading ? "Saving…" : isConnected && driveUrl ? "Update Drive" : "Save to Drive"}
                      </Button>
                      <Button variant="gold" onClick={handleDownload}>
                        <Download className="h-4 w-4" /> Download M3U
                      </Button>
                    </div>
                  </div>
                </div>
              </main>
            )}
          </div>
        </div>
      </div>

      {/* Add Channels Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-background border border-border rounded-2xl shadow-elegant w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="font-display font-bold text-lg">Add Channels</h2>
                <p className="text-xs text-muted-foreground">
                  {sourceNotInPlaylist.length} channels available from your source
                </p>
              </div>
              <button onClick={() => { setAddModalOpen(false); setAddSelected(new Set()); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search channels…"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  className="pl-9 bg-background/60"
                />
              </div>
            </div>

            {/* Channel list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {addGroupKeys.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No channels found.</p>
              ) : (
                addGroupKeys.map((cat) => (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{cat}</p>
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => {
                          const ids = new Set(addSelected);
                          addGrouped[cat].forEach((c) => ids.add(c.id));
                          setAddSelected(ids);
                        }}
                      >
                        Select all
                      </button>
                    </div>
                    {addGrouped[cat].map((ch) => (
                      <label key={ch.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-muted/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={addSelected.has(ch.id)}
                          onChange={(e) => {
                            const ids = new Set(addSelected);
                            e.target.checked ? ids.add(ch.id) : ids.delete(ch.id);
                            setAddSelected(ids);
                          }}
                          className="accent-primary"
                        />
                        <span className="text-sm truncate flex-1">{ch.name}</span>
                      </label>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {addSelected.size > 0 ? `${addSelected.size} selected` : "Nothing selected"}
              </p>
              <div className="flex gap-2">
                <Button variant="goldOutline" onClick={() => { setAddModalOpen(false); setAddSelected(new Set()); }}>
                  Cancel
                </Button>
                <Button variant="gold" onClick={handleConfirmAdd} disabled={addSelected.size === 0}>
                  Add {addSelected.size > 0 ? `${addSelected.size} channel${addSelected.size > 1 ? "s" : ""}` : "Channels"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </SidebarProvider>
  );
};

export default Index;
