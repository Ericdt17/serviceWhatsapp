import { useEffect, useState } from "react";

/**
 * Affiche `true` après `delayMs` ms lorsque `active` est vrai, pour éviter un flash
 * sur les réponses API très rapides. Repasse à `false` dès que `active` est faux.
 */
export function useDeferredLoading(active: boolean, delayMs: number): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) {
      setShow(false);
      return;
    }
    if (delayMs <= 0) {
      setShow(true);
      return;
    }
    const t = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(t);
  }, [active, delayMs]);

  return show;
}
