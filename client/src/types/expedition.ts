export type ExpeditionStatus = "en_attente" | "envoye" | "livre" | "annule";

export interface BackendExpedition {
  id: number;
  agency_id: number;
  group_id: number;
  group_name?: string;
  destination: string;
  agence_de_voyage: string;
  frais_de_course: number;
  frais_de_lagence_de_voyage: number;
  status: ExpeditionStatus | string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FrontendExpedition {
  id: number;
  agencyId: number;
  groupId: number;
  groupName?: string;
  destination: string;
  agenceDeVoyage: string;
  fraisDeCourse: number;
  fraisDeLAgenceDeVoyage: number;
  status: ExpeditionStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpeditionStats {
  totalExpeditions: number;
  totalFraisDeCourse: number;
  totalFraisDeLAgenceDeVoyage: number;
}
