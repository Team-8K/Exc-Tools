import { useState } from "react";
import { ChevronDown, Pencil, Check, X, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Channel } from "@/lib/m3u";
import { cn } from "@/lib/utils";

interface Props {
  category: string;
  channels: Channel[];
  defaultOpen?: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string, enabled: boolean) => void;
  onRename: (id: string, name: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onToggleAll: (category: string, enabled: boolean) => void;
  onSelectChange: (id: string, selected: boolean) => void;
  onSelectAllInCategory: (category: string, selected: boolean) => void;
  onDeleteSelected: (ids: string[]) => void;
}

export const CategoryGroup = ({
  category,
  channels,
  defaultOpen = false,
  selectedIds,
  onToggle,
  onRename,
  onRenameCategory,
  onToggleAll,
  onSelectChange,
  onSelectAllInCategory,
  onDeleteSelected,
}: Props) => {
  const [open, setOpen] = useState(defaultOpen);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editingCat, setEditingCat] = useState(false);
  const [catDraft, setCatDraft] = useState("");

  const enabledCount = channels.filter((c) => c.enabled).length;
  const allEnabled   = enabledCount === channels.length;

  const categorySelectedIds = channels.map(c => c.id).filter(id => selectedIds.has(id));
  const allCatSelected = categorySelectedIds.length === channels.length && channels.length > 0;
  const someCatSelected = categorySelectedIds.length > 0;

  // ── Channel rename ────────────────────────────────────────────
  const startEdit = (ch: Channel) => { setEditingId(ch.id); setDraft(ch.name); };
  const commitEdit = () => {
    if (editingId && draft.trim()) onRename(editingId, draft.trim());
    setEditingId(null);
  };

  // ── Category rename ───────────────────────────────────────────
  const startCatEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCatDraft(category);
    setEditingCat(true);
    setOpen(true);
  };
  const commitCatEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (catDraft.trim() && catDraft.trim() !== category) {
      onRenameCategory(category, catDraft.trim());
    }
    setEditingCat(false);
  };
  const cancelCatEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCat(false);
  };

  return (
    <div className="bg-gradient-card ring-gold rounded-2xl overflow-hidden shadow-elegant">
      {/* ── Category header ─────────────────────────────────────── */}
      <div
        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-primary/5 transition-smooth text-left cursor-pointer"
        onClick={() => !editingCat && setOpen(o => !o)}
      >
        {/* Bulk-select checkbox for entire category */}
        <div onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={allCatSelected}
            ref={el => { if (el) el.indeterminate = someCatSelected && !allCatSelected; }}
            onChange={e => onSelectAllInCategory(category, e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
          />
        </div>

        <ChevronDown
          className={cn(
            "h-5 w-5 text-primary transition-transform flex-shrink-0",
            open ? "rotate-0" : "-rotate-90"
          )}
        />

        {/* Category name / rename field */}
        <div className="flex-1 min-w-0" onClick={e => editingCat && e.stopPropagation()}>
          {editingCat ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={catDraft}
                onChange={e => setCatDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") commitCatEdit();
                  if (e.key === "Escape") setEditingCat(false);
                }}
                onClick={e => e.stopPropagation()}
                className="h-8 bg-background/60 font-display font-bold text-sm"
              />
              <button onClick={commitCatEdit} className="text-primary hover:text-primary-glow flex-shrink-0">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={cancelCatEdit} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group/cat">
              <h3 className="font-display font-bold text-base md:text-lg truncate">
                {category}
              </h3>
              <button
                onClick={startCatEdit}
                className="opacity-0 group-hover/cat:opacity-100 text-muted-foreground hover:text-primary transition-smooth flex-shrink-0"
                title="Rename category"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            {enabledCount} of {channels.length} enabled
            {someCatSelected && (
              <span className="ml-2 text-primary">· {categorySelectedIds.length} selected</span>
            )}
          </p>
        </div>

        {/* Bulk delete selected in category */}
        {someCatSelected && (
          <button
            onClick={e => { e.stopPropagation(); onDeleteSelected(categorySelectedIds); }}
            className="px-2.5 py-1.5 rounded-full text-xs font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-smooth flex items-center gap-1 flex-shrink-0"
            title="Delete selected"
          >
            <Trash2 className="h-3 w-3" />
            Delete {categorySelectedIds.length}
          </button>
        )}

        {/* Toggle all in category */}
        {!someCatSelected && (
          <div
            onClick={e => { e.stopPropagation(); onToggleAll(category, !allEnabled); }}
            className="px-3 py-1.5 rounded-full text-xs font-medium border border-primary/30 text-primary hover:bg-primary/10 transition-smooth flex-shrink-0"
          >
            {allEnabled ? "Disable all" : "Enable all"}
          </div>
        )}
      </div>

      {/* ── Channel rows ────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-border/50 divide-y divide-border/40">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3 transition-smooth",
                selectedIds.has(ch.id) ? "bg-primary/5" : "",
                ch.enabled ? "opacity-100" : "opacity-50"
              )}
            >
              {/* Row checkbox */}
              <input
                type="checkbox"
                checked={selectedIds.has(ch.id)}
                onChange={e => onSelectChange(ch.id, e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary cursor-pointer flex-shrink-0"
              />

              <Switch
                checked={ch.enabled}
                onCheckedChange={(v) => onToggle(ch.id, v)}
              />

              <div className="flex-1 min-w-0">
                {editingId === ch.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="h-8 bg-background/60"
                    />
                    <button onClick={commitEdit} className="text-primary hover:text-primary-glow">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <span className="truncate text-sm font-medium">{ch.name}</span>
                    {ch.name !== ch.originalName && (
                      <span className="text-[10px] uppercase tracking-wider text-primary/70">edited</span>
                    )}
                    <button
                      onClick={() => startEdit(ch)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-smooth"
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
