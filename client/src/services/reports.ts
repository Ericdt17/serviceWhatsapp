/**
 * Group PDF reports (POST with optional manual stock snapshot)
 */

import { buildApiUrl } from "@/lib/api-config";

export type ReportStockLine = {
  name: string;
  quantity: number;
  subtitle?: string | null;
};

export async function postGroupPdfBlob(
  groupId: number,
  params: {
    startDate: string | null;
    endDate: string | null;
    stock: ReportStockLine[];
  }
): Promise<{ blob: Blob; filename?: string }> {
  const url = buildApiUrl(`/api/v1/reports/groups/${groupId}/pdf`);
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: params.startDate ?? null,
      endDate: params.endDate ?? null,
      stock: params.stock,
    }),
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const data = (await response.json()) as {
        message?: string;
        error?: string;
      };
      throw new Error(data.message || data.error || `Erreur ${response.status}`);
    }
    throw new Error(`Erreur ${response.status}`);
  }

  const cd = response.headers.get("Content-Disposition");
  let filename: string | undefined;
  if (cd) {
    const match = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(cd);
    if (match) {
      filename = decodeURIComponent(match[1].replace(/"/g, "").trim());
    }
  }

  const blob = await response.blob();
  return { blob, filename };
}
