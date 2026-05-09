import { useEffect, useMemo, useState } from "react";
import { Search, Trash2, Download, Copy, RotateCcw, Tv, ToggleLeft, Link, CloudUpload, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "sonner";
import { LoaderPanel } from "@/components/LoaderPanel";
import { CategoryGroup } from "@/components/CategoryGroup";
import { SummarySidebar } from "@/components/SummarySidebar";
import {
  Channel,
  parseM3U,
  exportM3U,
  dedupeByUrl,
  groupByCategory,
} from "@/lib/m3u";

// ── Google Drive helpers ────────────────────────────────────────
const GDRIVE_CLIENT_ID = import.meta.env.VITE_GDRIVE_CLIENT_ID || "";
const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

const loadGapiScript = (): Promise<void> =>
  new Promise((resolve) => {
    if (document.getElementById("gapi-script")) { resolve(); return; }
    const s = document.createElement("script");
    s.id = "gapi-script";
    s.src = "https://apis.google.com/js/api.js";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });

const loadGisScript = (): Promise<void> =>
  new Promise((resolve) => {
    if (document.getElementById("gis-script")) { resolve(); return; }
    const s = document.createElement("script");
    s.id = "gis-script";
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });

// Upload or update a file in Google Drive, return the file ID
const uploadToDrive = async (accessToken: string, m3uContent: string, existingFileId?: string): Promise<string> => {
  const fileName = "team8k-playlist.m3u";
  const mimeType = "audio/x-mpegurl";
  const boundary = "team8k_boundary";
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: fileName, mimeType }) +
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n` +
    m3uContent +
    `\r\n--${boundary}--`;

  const method = existingFileId ? "PATCH" : "POST";
  const endpoint = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

  const res = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
  const data = await res.json();

  // Make file publicly readable so the player can fetch it
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

  return data.id;
};

// ── Component ───────────────────────────────────────────────────
const Index = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [source, setSource] = useState<string>("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);

  // Google Drive state
  const [driveFileId, setDriveFileId] = useState<string>("");
  const [driveUrl, setDriveUrl] = useState<string>("");
  const [driveUploading, setDriveUploading] = useState(false);
  const [driveAccessToken, setDriveAccessToken] = useState<string>("");

  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/[#&]playlist=([^&]*)/);
    if (match) {
      try {
        const decoded = decodeURIComponent(escape(atob(match[1])));
        handleLoad(decoded, "Shared Playlist Link");
        window.history.replaceState(null, "", window.location.pathname);
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoad = (content: string, src: string) => {
    const parsed = parseM3U(content);
    if (!parsed.length) { toast.error("No channels found in playlist"); return; }
    setChannels(parsed);
    setSource(src);
    setSearch("");
    setCategoryFilter("all");
    setDuplicatesRemoved(0);
    setDriveFileId("");
    setDriveUrl("");
  };

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

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);
  const groupKeys = useMemo(() => Object.keys(grouped).sort(), [grouped]);
  const enabledCount = channels.filter((c) => c.enabled).length;

  const updateChannel = (id: string, patch: Partial<Channel>) =>
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const handleDedupe = () => {
    const { channels: cleaned, removed } = dedupeByUrl(channels);
    setChannels(cleaned);
    setDuplicatesRemoved((prev) => prev + removed);
    toast.success(removed > 0 ? `Removed ${removed} duplicate${removed > 1 ? "s" : ""}` : "No duplicates found");
  };

  const handleEnableAll = (enabled: boolean) =>
    setChannels((prev) => prev.map((c) => ({ ...c, enabled })));

  const handleToggleCategoryAll = (category: string, enabled: boolean) =>
    setChannels((prev) => prev.map((c) => (c.category === category ? { ...c, enabled } : c)));

  const handleReset = () => {
    setChannels([]); setSource(""); setSearch("");
    setCategoryFilter("all"); setDuplicatesRemoved(0);
    setDriveFileId(""); setDriveUrl("");
  };

  // Export only enabled channels
  const getEnabledM3U = () => exportM3U(channels); // exportM3U already skips disabled

  const handleDownload = () => {
    const text = getEnabledM3U();
    const blob = new Blob([text], { type: "audio/x-mpegurl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "team8k-playlist.m3u";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded — ${enabledCount} enabled channels`);
  };

  const handleCopy = async () => {
    const text = getEnabledM3U();
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied — ${enabledCount} enabled channels`);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  // ── Google Drive upload ───────────────────────────────────────
  const getAccessToken = (): Promise<string> =>
    new Promise(async (resolve, reject) => {
      await Promise.all([loadGapiScript(), loadGisScript()]);

      if (driveAccessToken) { resolve(driveAccessToken); return; }

      if (!GDRIVE_CLIENT_ID) {
        reject(new Error("Google Drive not configured. Add VITE_GDRIVE_CLIENT_ID to your environment variables."));
        return;
      }

      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GDRIVE_CLIENT_ID,
        scope: GDRIVE_SCOPE,
        callback: (resp: any) => {
          if (resp.error) { reject(new Error(resp.error)); return; }
          setDriveAccessToken(resp.access_token);
          resolve(resp.access_token);
        },
      });
      client.requestAccessToken();
    });

  const handleSaveToDrive = async () => {
    if (enabledCount === 0) { toast.error("No enabled channels to save"); return; }
    setDriveUploading(true);
    try {
      const token = await getAccessToken();
      const m3uContent = getEnabledM3U();
      const fileId = await uploadToDrive(token, m3uContent, driveFileId || undefined);
      setDriveFileId(fileId);

      // Direct download URL that IPTV players can use
      const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
      setDriveUrl(url);
      await navigator.clipboard.writeText(url);
      toast.success(`Saved to Google Drive — ${enabledCount} channels. URL copied!`);
    } catch (err: any) {
      toast.error(err.message || "Google Drive upload failed");
    } finally {
      setDriveUploading(false);
    }
  };

  const handleCopyDriveUrl = async () => {
    if (!driveUrl) return;
    await navigator.clipboard.writeText(driveUrl);
    toast.success("M3U URL copied to clipboard");
  };

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
                  <h2 className="font-display font-bold text-3xl mb-3 md:text-4xl text-center">Load Your Playlist</h2>
                  <p className="text-muted-foreground text-sm">Everything runs in your browser — nothing is stored or uploaded.</p>
                </div>
                <LoaderPanel onLoad={handleLoad} />
                <div className="mt-10 max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { t: "Edit & Rename", d: "Rename any channel" },
                    { t: "Smart Dedupe", d: "Strip duplicate URLs" },
                    { t: "Group & Filter", d: "Auto-group by category" },
                    { t: "Clean Export", d: "Valid M3U output" },
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

                {/* Groups */}
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
                        onRename={(id, name) => updateChannel(id, { name })}
                        onToggleAll={handleToggleCategoryAll}
                      />
                    ))
                  )}
                </div>

                {/* Google Drive URL display */}
                {driveUrl && (
                  <div className="bg-gradient-card ring-gold rounded-2xl p-4 md:p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <p className="text-sm font-display font-bold text-green-500">Saved to Google Drive</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Paste this URL into Tivimate, Smarters, or any IPTV player as your M3U source. It will always serve your latest edited playlist.</p>
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
                    <p className="text-xs text-muted-foreground">Next time you edit and click "Save to Drive", the same URL will update automatically — no need to re-paste in your player.</p>
                  </div>
                )}

                {/* Export bar */}
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
                      <Button
                        variant="goldOutline"
                        onClick={handleSaveToDrive}
                        disabled={driveUploading}
                      >
                        <CloudUpload className="h-4 w-4" />
                        {driveUploading ? "Saving…" : driveFileId ? "Update Drive" : "Save to Drive"}
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
    </SidebarProvider>
  );
};

export default Index;
