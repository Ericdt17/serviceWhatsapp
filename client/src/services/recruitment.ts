/**
 * Recruitment API — admin dashboard (offres, questions, candidatures)
 */

import { apiGet, apiPost, apiPatch, apiDelete } from "./api";
import type { ApiResponse } from "@/types/api";

const BASE = "/api/v1/recruitment/admin";

function unwrap<T>(response: ApiResponse<T>, fallback: string): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.error || response.message || fallback);
  }
  return response.data;
}

// --- Types ---

/** Libellé du type de poste (saisie libre côté admin, ex. Livreur, Agent) */
export type JobOfferType = string;
export type QuestionType = "text" | "mcq";
export type ApplicationStatus = "new" | "in_review" | "accepted" | "rejected";

export interface AdminJobOffer {
  id: number;
  title: string;
  type: JobOfferType;
  description: string | null;
  location: string;
  slots: number;
  is_open: boolean;
  created_at: string;
  updated_at: string;
  application_count: number;
}

export interface JobQuestion {
  id: number;
  job_offer_id: number;
  question_text: string;
  question_type: QuestionType;
  options: string[] | null;
  is_required: boolean;
  order_index: number;
  created_at: string;
}

export interface CreateJobPayload {
  title: string;
  type: JobOfferType;
  description?: string | null;
  location?: string;
  slots?: number;
  is_open?: boolean;
}

export type UpdateJobPayload = Partial<CreateJobPayload>;

export interface CreateQuestionPayload {
  question_text: string;
  question_type: QuestionType;
  options?: string[] | null;
  is_required?: boolean;
  order_index?: number;
}

export type UpdateQuestionPayload = Partial<CreateQuestionPayload>;

export interface ApplicationRow {
  id: number;
  job_offer_id: number;
  full_name: string;
  phone: string;
  quartier: string | null;
  transport: string | null;
  availability: string | null;
  photo_url: string | null;
  photo_original_name: string | null;
  cv_url: string | null;
  cv_original_name: string | null;
  cover_letter_url: string | null;
  cover_letter_original_name: string | null;
  funnel_step: number;
  score: number | null;
  status: ApplicationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  job_title: string;
}

export interface ApplicationAnswerRow {
  id: number;
  question_id: number;
  answer_text: string | null;
  created_at: string;
  question_text: string;
  question_type: QuestionType;
  order_index: number;
}

export interface ApplicationDetail {
  application: ApplicationRow & {
    job_title: string;
    job_type: JobOfferType;
    job_description: string | null;
  };
  answers: ApplicationAnswerRow[];
}

export interface UpdateApplicationPayload {
  status?: ApplicationStatus;
  funnel_step?: number;
  score?: number | null;
  notes?: string | null;
}

export interface ApplicationsFilters {
  job_offer_id?: number | string;
  status?: ApplicationStatus | string;
  funnel_step?: number | string;
}

// --- Offres ---

export async function getAdminJobs(): Promise<AdminJobOffer[]> {
  const res = await apiGet<AdminJobOffer[]>(`${BASE}/jobs`);
  return unwrap(res, "Impossible de charger les offres");
}

export async function createJob(data: CreateJobPayload): Promise<AdminJobOffer> {
  const res = await apiPost<AdminJobOffer>(`${BASE}/jobs`, data);
  return unwrap(res, "Impossible de créer l'offre");
}

export async function updateJob(id: number, data: UpdateJobPayload): Promise<AdminJobOffer> {
  const res = await apiPatch<AdminJobOffer>(`${BASE}/jobs/${id}`, data);
  return unwrap(res, "Impossible de mettre à jour l'offre");
}

export async function deleteJob(id: number): Promise<{ id: number }> {
  const res = await apiDelete<{ id: number }>(`${BASE}/jobs/${id}`);
  return unwrap(res, "Impossible de supprimer l'offre");
}

// --- Questions ---

export async function getJobQuestions(jobId: number): Promise<JobQuestion[]> {
  const res = await apiGet<JobQuestion[]>(`${BASE}/jobs/${jobId}/questions`);
  const data = unwrap(res, "Impossible de charger les questions");
  return Array.isArray(data) ? data : [];
}

export async function createQuestion(
  jobId: number,
  data: CreateQuestionPayload
): Promise<JobQuestion> {
  const res = await apiPost<JobQuestion>(`${BASE}/jobs/${jobId}/questions`, data);
  return unwrap(res, "Impossible de créer la question");
}

export async function updateQuestion(
  questionId: number,
  data: UpdateQuestionPayload
): Promise<JobQuestion> {
  const res = await apiPatch<JobQuestion>(`${BASE}/questions/${questionId}`, data);
  return unwrap(res, "Impossible de mettre à jour la question");
}

export async function deleteQuestion(questionId: number): Promise<{ id: number }> {
  const res = await apiDelete<{ id: number }>(`${BASE}/questions/${questionId}`);
  return unwrap(res, "Impossible de supprimer la question");
}

// --- Candidatures ---

export async function getApplications(
  filters?: ApplicationsFilters
): Promise<ApplicationRow[]> {
  const res = await apiGet<ApplicationRow[]>(`${BASE}/applications`, {
    job_offer_id: filters?.job_offer_id,
    status: filters?.status,
    funnel_step: filters?.funnel_step,
  });
  const data = unwrap(res, "Impossible de charger les candidatures");
  return Array.isArray(data) ? data : [];
}

export async function getApplicationById(id: number): Promise<ApplicationDetail> {
  const res = await apiGet<ApplicationDetail>(`${BASE}/applications/${id}`);
  return unwrap(res, "Impossible de charger la candidature");
}

export async function updateApplication(
  id: number,
  data: UpdateApplicationPayload
): Promise<ApplicationRow> {
  const res = await apiPatch<ApplicationRow>(`${BASE}/applications/${id}`, data);
  return unwrap(res, "Impossible de mettre à jour la candidature");
}
