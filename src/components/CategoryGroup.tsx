import { useState } from "react";
import { ChevronDown, Pencil, Check, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Channel } from "@/lib/m3u";
import { cn } from "@/lib/utils";

interface Props {
  category: string;
  channels: Channel[];
  defaultOpen?: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onRename: (id: string, name: string) => void;
  onToggleAll: (category: string, enabled: boolean) => void;
}

export const CategoryGroup = ({
  category,
  channels,
  defaultOpen = false,
  onToggle,
  onRename,
  onToggleAll,
}: Props) => {
  const [open, setOpen] = useState(defaultOpen);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const enabledCount = channels.filter((c) => c.enabled).length;
  const allEnabled = enabledCount === channels.length;

  const startEdit = (ch: Channel) => {
    setEditingId(ch.id);
    setDraft(ch.name);
  };
  const commitEdit = () => {
    if (editingId && draft.trim()) onRename(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <div className="bg-gradient-card ring-gold rounded-2xl overflow-hidden shadow-elegant">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 px-6 py-4 hover:bg-primary/5 transition-smooth text-left"
      >
        <ChevronDown
          className={cn(
            "h-5 w-5 text-primary transition-transform",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-base md:text-lg truncate">
            {category}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {enabledCount} of {channels.length} enabled
          </p>
        </div>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleAll(category, !allEnabled);
          }}
          className="px-3 py-1.5 rounded-full text-xs font-medium border border-primary/30 text-primary hover:bg-primary/10 transition-smooth"
        >
          {allEnabled ? "Disable all" : "Enable all"}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/50 divide-y divide-border/40">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className={cn(
                "flex items-center gap-3 px-6 py-3 transition-smooth",
                ch.enabled ? "opacity-100" : "opacity-50"
              )}
            >
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
                    <button
                      onClick={commitEdit}
                      className="text-primary hover:text-primary-glow"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <span className="truncate text-sm font-medium">
                      {ch.name}
                    </span>
                    {ch.name !== ch.originalName && (
                      <span className="text-[10px] uppercase tracking-wider text-primary/70">
                        edited
                      </span>
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
