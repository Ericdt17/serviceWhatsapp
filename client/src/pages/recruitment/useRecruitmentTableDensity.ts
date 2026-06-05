import { useState, useEffect } from "react";

export type TableDensity = "cozy" | "compact";

export function useRecruitmentTableDensity(storageKey: string) {
  const [density, setDensity] = useState<TableDensity>(() =>
    typeof window !== "undefined" ? readStored(storageKey) : "cozy"
  );

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, density);
    } catch {
      /* ignore */
    }
  }, [density, storageKey]);

  return [density, setDensity] as const;
}

function readStored(key: string): TableDensity {
  try {
    const v = localStorage.getItem(key);
    if (v === "compact" || v === "cozy") return v;
  } catch {
    /* ignore */
  }
  return "cozy";
}

/** Classes en-têtes alignées sur Livraisons.tsx */
export const recruitmentThClass =
  "bg-muted/95 font-semibold text-foreground backdrop-blur-md supports-[backdrop-filter]:bg-muted/85";
