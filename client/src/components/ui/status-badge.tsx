import { cn } from "@/lib/utils";
import type { StatutLivraison } from "@/types/delivery";

interface StatusBadgeProps {
  statut: StatutLivraison;
  className?: string;
}

const statutLabels: Record<StatutLivraison, string> = {
  "en_cours": "En cours",
  "livré": "Livré",
  "échec": "Échec",
  "pickup": "Au bureau",
  "expedition": "Expédition",
  "annulé": "Annulé",
  "renvoyé": "Renvoyé",
  "client_absent": "Client absent",
  "injoignable": "Injoignable",
  "ne_decroche_pas": "Ne décroche pas"
};

export function StatusBadge({ statut, className }: StatusBadgeProps) {
  return (
    <span className={cn(
      "status-badge",
      `status-${statut}`,
      className
    )}>
      {statutLabels[statut]}
    </span>
  );
}
