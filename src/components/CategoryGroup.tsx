import { useState } from "react";
import {
  ChevronDown,
  Pencil,
  Check,
  X,
  GripVertical,
  FolderPen,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Channel } from "@/lib/m3u";
import { cn } from "@/lib/utils";

// ── Sortable channel row ───────────────────────────────────────────────────

interface RowProps {
  ch: Channel;
  onToggle: (id: string, enabled: boolean) => void;
  onRename: (id: string, name: string) => void;
}

const SortableChannelRow = ({ ch, onToggle, onRename }: RowProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ch.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEdit = () => {
    setEditingId(ch.id);
    setDraft(ch.name);
  };
  const commitEdit = () => {
    if (editingId && draft.trim()) onRename(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-colors",
        ch.enabled ? "opacity-100" : "opacity-50",
        isDragging
          ? "bg-primary/10 ring-1 ring-primary/40 rounded-lg z-10 shadow-gold"
          : "hover:bg-muted/20"
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

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
              className="h-7 bg-background/60 text-sm"
            />
            <button
              onClick={commitEdit}
              className="text-primary hover:text-primary/80"
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
            <span className="truncate text-sm font-medium">{ch.name}</span>
            {ch.name !== ch.originalName && (
              <span className="text-[10px] uppercase tracking-wider text-primary/70">
                edited
              </span>
            )}
            <button
              onClick={startEdit}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
              title="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── CategoryGroup ──────────────────────────────────────────────────────────

interface Props {
  category: string;
  channels: Channel[];
  defaultOpen?: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onRename: (id: string, name: string) => void;
  onToggleAll: (category: string, enabled: boolean) => void;
  onReorder: (category: string, activeId: string, overId: string) => void;
  onRenameCategory: (category: string) => void;
}

export const CategoryGroup = ({
  category,
  channels,
  defaultOpen = false,
  onToggle,
  onRename,
  onToggleAll,
  onReorder,
  onRenameCategory,
}: Props) => {
  const [open, setOpen] = useState(defaultOpen);

  const enabledCount = channels.filter((c) => c.enabled).length;
  const allEnabled = enabledCount === channels.length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(category, String(active.id), String(over.id));
    }
  };

  return (
    <div className="bg-gradient-card ring-gold rounded-2xl overflow-hidden shadow-elegant">
      {/* Header */}
      <div className="flex items-center">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center gap-4 px-6 py-4 hover:bg-primary/5 transition-smooth text-left"
        >
          <ChevronDown
            className={cn(
              "h-5 w-5 text-primary transition-transform shrink-0",
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
        </button>

        {/* Category actions */}
        <div className="flex items-center gap-1 pr-4">
          <button
            onClick={() => onRenameCategory(category)}
            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-smooth"
            title="Rename group"
          >
            <FolderPen className="h-4 w-4" />
          </button>
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggleAll(category, !allEnabled);
            }}
            className="px-3 py-1.5 rounded-full text-xs font-medium border border-primary/30 text-primary hover:bg-primary/10 transition-smooth cursor-pointer select-none"
          >
            {allEnabled ? "Disable all" : "Enable all"}
          </div>
        </div>
      </div>

      {/* Channel list with drag-and-drop */}
      {open && (
        <div className="border-t border-border/50">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={channels.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="divide-y divide-border/30">
                {channels.map((ch) => (
                  <SortableChannelRow
                    key={ch.id}
                    ch={ch}
                    onToggle={onToggle}
                    onRename={onRename}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
};
