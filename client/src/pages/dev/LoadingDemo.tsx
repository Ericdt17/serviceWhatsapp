import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/loading/LoadingSpinner";
import { LoadingOverlay } from "@/components/loading/LoadingOverlay";
import { Separator } from "@/components/ui/separator";

/**
 * Démo des indicateurs de chargement (GIF + overlay différé).
 * Route : `/dev/loading` — uniquement en `import.meta.env.DEV`.
 */
export default function LoadingDemo() {
  const [overlayOn, setOverlayOn] = useState(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  const simulate5s = () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    setOverlayOn(true);
    stopTimerRef.current = setTimeout(() => {
      setOverlayOn(false);
      stopTimerRef.current = null;
    }, 5000);
  };

  const stop = () => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    setOverlayOn(false);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Démo — chargement</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prévisualisation locale de <code className="rounded bg-muted px-1">/loadinganimation.gif</code> et de{" "}
            <code className="rounded bg-muted px-1">LoadingOverlay</code> (délai 280&nbsp;ms par défaut).
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tailles</CardTitle>
            <CardDescription>LoadingSpinner (GIF)</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-8">
            <div className="flex flex-col items-center gap-2">
              <LoadingSpinner size="sm" />
              <span className="text-xs text-muted-foreground">sm</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <LoadingSpinner size="md" />
              <span className="text-xs text-muted-foreground">md</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <LoadingSpinner size="lg" />
              <span className="text-xs text-muted-foreground">lg</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avec texte</CardTitle>
          </CardHeader>
          <CardContent>
            <LoadingSpinner size="md" text="Chargement des livraisons…" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Variante icône (Lucide)</CardTitle>
            <CardDescription>Pour comparaison — sans GIF</CardDescription>
          </CardHeader>
          <CardContent>
            <LoadingSpinner size="md" variant="icon" text="Ancien spinner" />
          </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>Overlay</CardTitle>
            <CardDescription>
              Le GIF plein cadre apparaît après ~280&nbsp;ms si le chargement est toujours actif.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={simulate5s} disabled={overlayOn}>
                Simuler chargement (5&nbsp;s)
              </Button>
              <Button type="button" variant="outline" onClick={stop} disabled={!overlayOn}>
                Arrêter
              </Button>
            </div>
            <LoadingOverlay
              isLoading={overlayOn}
              text="Chargement simulé…"
              delayMs={280}
              className="min-h-[200px] rounded-xl border border-border bg-card"
            >
              <div className="flex min-h-[200px] items-center justify-center p-6 text-sm text-muted-foreground">
                Contenu derrière l’overlay (atténué pendant le chargement)
              </div>
            </LoadingOverlay>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
