import { Clapperboard } from "lucide-react";
import { useRegistrySnapshot } from "@/kernel/react";
import { EmptyState } from "@/components/ui/empty-state";

export function BottomDock() {
  const registry = useRegistrySnapshot();
  const panels = registry.panelsForSlot("bottom");

  if (panels.length === 0) {
    return (
      <div className="h-full overflow-hidden bg-[var(--surface-2)]">
        <EmptyState
          compact
          icon={Clapperboard}
          title="Espace de montage"
          description="Ouvrez l'Éditeur pour composer votre séquence sur la timeline."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-2)]">
      {panels.map((p) => {
        const Comp = p.component;
        return <Comp key={p.id} />;
      })}
    </div>
  );
}
