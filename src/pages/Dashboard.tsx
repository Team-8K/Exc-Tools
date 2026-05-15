import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus, Trash2, Edit3, Download, Clock, Database,
  ListMusic, ChevronRight, RefreshCw, FileMusic, Globe, Tv
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  supabase,
  type SourcePlaylistRow,
  type EditedPlaylistRow,
} from "@/lib/supabase";

export default function Dashboard() {
  const navigate = useNavigate();
  const [sources, setSources]   = useState<SourcePlaylistRow[]>([]);
  const [edited, setEdited]     = useState<EditedPlaylistRow[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: s, error: se }, { data: e, error: ee }] = await Promise.all([
      supabase.from("source_playlists").select("*").order("created_at", { ascending: false }),
      supabase.from("edited_playlists").select("*").order("updated_at", { ascending: false }),
    ]);
    if (se) toast.error("Failed to load source playlists");
    if (ee) toast.error("Failed to load edited playlists");
    setSources((s as SourcePlaylistRow[]) || []);
    setEdited((e as EditedPlaylistRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const deleteSource = async (id: string) => {
    const { error } = await supabase.from("source_playlists").delete().eq("id", id);
    if (error) { toast.error("Delete failed"); return; }
    setSources(prev => prev.filter(r => r.id !== id));
    toast.success("Source playlist deleted");
  };

  const deleteEdited = async (id: string, storagePath?: string | null) => {
    if (storagePath) {
      await supabase.storage.from("edited-playlists").remove([storagePath]);
    }
    const { error } = await supabase.from("edited_playlists").delete().eq("id", id);
    if (error) { toast.error("Delete failed"); return; }
    setEdited(prev => prev.filter(r => r.id !== id));
    toast.success("Edited playlist deleted");
  };

  const downloadEdited = async (row: EditedPlaylistRow) => {
    let content = row.content;
    if (!content && row.storage_path) {
      const { data, error } = await supabase.storage
        .from("edited-playlists")
        .download(row.storage_path);
      if (error || !data) { toast.error("Download failed"); return; }
      content = await data.text();
    }
    if (!content) { toast.error("No content to download"); return; }
    const blob = new Blob([content], { type: "audio/x-mpegurl" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${row.name.replace(/\s+/g, "-")}.m3u`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  };

  const sourceTypeIcon = (t: string) =>
    t === "file" ? <FileMusic className="h-4 w-4" /> :
    t === "url"  ? <Globe className="h-4 w-4" /> :
                   <Tv className="h-4 w-4" />;

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="min-h-screen px-4 py-8 max-w-5xl mx-auto">

      {/* ── Page header ───────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground">
            My Playlists
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your source and edited playlists
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Button
            variant="gold"
            size="sm"
            onClick={() => navigate("/editor")}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Load New Playlist
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-xs text-muted-foreground tracking-widest uppercase">Loading…</p>
        </div>
      ) : (
        <>
          {/* ── SOURCE PLAYLISTS ──────────────────────────────── */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center">
                <Database className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="font-display font-bold text-base tracking-wide">Source Playlists</h2>
                <p className="text-xs text-muted-foreground">Your loaded playlist sources</p>
              </div>
              <span className="ml-auto text-xs text-muted-foreground bg-white/5 border border-border/40 rounded-full px-3 py-1">
                {sources.length}
              </span>
            </div>

            {sources.length === 0 ? (
              <EmptyState
                icon={<Database className="h-8 w-8 text-muted-foreground/40" />}
                title="No source playlists yet"
                description="Load a playlist in the editor — it will be saved here automatically."
                cta="Go to Editor"
                href="/editor"
              />
            ) : (
              <div className="grid gap-3">
                {sources.map(row => (
                  <div
                    key={row.id}
                    className="bg-gradient-card ring-gold rounded-xl p-4 flex items-center gap-4 group"
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center flex-shrink-0 text-primary">
                      {sourceTypeIcon(row.source_type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{row.name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground capitalize">{row.source_type}</span>
                        {row.channel_count > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {row.channel_count.toLocaleString()} channels
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmt(row.created_at)}
                        </span>
                      </div>
                      {row.url && (
                        <p className="text-xs text-muted-foreground/60 font-mono truncate mt-0.5 max-w-xs">
                          {row.url}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => navigate(`/editor?source=${row.id}`)}
                        className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                        title="Open in editor"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteSource(row.id)}
                        className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <ChevronRight
                      className="h-4 w-4 text-muted-foreground/30 flex-shrink-0 group-hover:text-primary/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/editor?source=${row.id}`)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── EDITED PLAYLISTS ──────────────────────────────── */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center">
                <ListMusic className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="font-display font-bold text-base tracking-wide">Edited Playlists</h2>
                <p className="text-xs text-muted-foreground">Saved, cleaned exports</p>
              </div>
              <span className="ml-auto text-xs text-muted-foreground bg-white/5 border border-border/40 rounded-full px-3 py-1">
                {edited.length}
              </span>
            </div>

            {edited.length === 0 ? (
              <EmptyState
                icon={<ListMusic className="h-8 w-8 text-muted-foreground/40" />}
                title="No saved playlists yet"
                description="After editing a playlist, click 'Save to Dashboard' to store it here."
                cta="Go to Editor"
                href="/editor"
              />
            ) : (
              <div className="grid gap-3">
                {edited.map(row => (
                  <div
                    key={row.id}
                    className="bg-gradient-card ring-gold rounded-xl p-4 flex items-center gap-4 group"
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center flex-shrink-0 text-primary">
                      <ListMusic className="h-4 w-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{row.name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-primary font-semibold">
                          {row.enabled_count.toLocaleString()} channels
                        </span>
                        {row.channel_count !== row.enabled_count && (
                          <span className="text-xs text-muted-foreground">
                            of {row.channel_count.toLocaleString()} total
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmt(row.updated_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => downloadEdited(row)}
                        className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                        title="Download M3U"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteEdited(row.id, row.storage_path)}
                        className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function EmptyState({
  icon, title, description, cta, href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="bg-gradient-card ring-gold rounded-xl p-10 flex flex-col items-center text-center gap-3">
      {icon}
      <p className="font-semibold text-sm text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">{description}</p>
      <Link
        to={href}
        className="mt-2 text-xs font-semibold text-primary hover:underline flex items-center gap-1"
      >
        {cta} <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
