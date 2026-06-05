/**
 * Waitlist — super admin only (inscriptions depuis la page publique)
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getWaitlist } from "@/services/waitlist";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";

function formatWaitlistDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function WaitlistPage() {
  const { isSuperAdmin } = useAuth();
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["waitlist", page],
    queryFn: () => getWaitlist(page, limit),
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (isError && error instanceof Error) {
      toast.error(error.message);
    }
  }, [isError, error]);

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Accès refusé. Super administrateur requis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-8 w-8 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Liste d&apos;attente</h1>
          <p className="text-muted-foreground">
            Inscriptions collectées depuis la page d&apos;accueil publique
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Chargement...</div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Date d&apos;inscription</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data?.entries.length ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      Aucune inscription pour l&apos;instant.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.entries.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.email}</TableCell>
                      <TableCell>{row.phone}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatWaitlistDate(row.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {data && data.pagination.totalPages > 1 ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Page {data.pagination.page} sur {data.pagination.totalPages} —{" "}
                {data.pagination.total} inscription(s)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() =>
                    setPage((p) => Math.min(data.pagination.totalPages, p + 1))
                  }
                >
                  Suivant
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void refetch()}>
                  Actualiser
                </Button>
              </div>
            </div>
          ) : data && data.pagination.total > 0 ? (
            <p className="text-sm text-muted-foreground">
              {data.pagination.total} inscription(s) au total.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function Waitlist() {
  return (
    <ProtectedRoute requireSuperAdmin>
      <WaitlistPage />
    </ProtectedRoute>
  );
}
