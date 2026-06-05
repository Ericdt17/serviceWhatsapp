/**
 * React Query hooks — recruitment (admin)
 */

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminJobs,
  createJob,
  updateJob,
  deleteJob,
  getJobQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getApplications,
  getApplicationById,
  updateApplication,
  type CreateJobPayload,
  type UpdateJobPayload,
  type CreateQuestionPayload,
  type UpdateQuestionPayload,
  type ApplicationsFilters,
  type UpdateApplicationPayload,
} from "@/services/recruitment";

export const recruitmentKeys = {
  adminJobs: ["recruitment", "admin-jobs"] as const,
  jobQuestions: (jobId: number) => ["recruitment", "job-questions", jobId] as const,
  applications: (filters?: ApplicationsFilters) =>
    ["recruitment", "applications", filters ?? {}] as const,
  application: (id: number) => ["recruitment", "application", id] as const,
};

export function useAdminJobs() {
  const result = useQuery({
    queryKey: recruitmentKeys.adminJobs,
    queryFn: () => getAdminJobs(),
    retry: 2,
    staleTime: 10000,
  });

  useEffect(() => {
    if (result.isError) {
      const msg = result.error instanceof Error ? result.error.message : "Erreur";
      toast.error("Erreur lors du chargement des offres", { description: msg });
    }
  }, [result.isError, result.error]);

  return result;
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateJobPayload) => createJob(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recruitmentKeys.adminJobs });
      toast.success("Offre créée");
    },
    onError: (e: unknown) => {
      toast.error("Erreur", {
        description: e instanceof Error ? e.message : "Création impossible",
      });
    },
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateJobPayload }) =>
      updateJob(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recruitmentKeys.adminJobs });
      toast.success("Offre mise à jour");
    },
    onError: (e: unknown) => {
      toast.error("Erreur", {
        description: e instanceof Error ? e.message : "Mise à jour impossible",
      });
    },
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recruitmentKeys.adminJobs });
      toast.success("Offre supprimée");
    },
  });
}

export function useJobQuestions(jobId: number | undefined, open = true) {
  const result = useQuery({
    queryKey:
      jobId != null && jobId > 0
        ? recruitmentKeys.jobQuestions(jobId)
        : (["recruitment", "job-questions", "none"] as const),
    queryFn: () => getJobQuestions(jobId!),
    enabled: !!jobId && jobId > 0 && open,
    retry: 2,
    staleTime: 5000,
  });

  useEffect(() => {
    if (result.isError && jobId && open) {
      const msg = result.error instanceof Error ? result.error.message : "Erreur";
      toast.error("Erreur lors du chargement des questions", { description: msg });
    }
  }, [result.isError, result.error, jobId, open]);

  return result;
}

export function useCreateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      data,
    }: {
      jobId: number;
      data: CreateQuestionPayload;
    }) => createQuestion(jobId, data),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: recruitmentKeys.jobQuestions(v.jobId) });
      toast.success("Question créée");
    },
    onError: (e: unknown) => {
      toast.error("Erreur", {
        description: e instanceof Error ? e.message : "Création impossible",
      });
    },
  });
}

export function useUpdateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      questionId,
      jobId,
      data,
    }: {
      questionId: number;
      jobId: number;
      data: UpdateQuestionPayload;
    }) => updateQuestion(questionId, data),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: recruitmentKeys.jobQuestions(v.jobId) });
      toast.success("Question mise à jour");
    },
    onError: (e: unknown) => {
      toast.error("Erreur", {
        description: e instanceof Error ? e.message : "Mise à jour impossible",
      });
    },
  });
}

export function useDeleteQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, jobId }: { questionId: number; jobId: number }) =>
      deleteQuestion(questionId),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: recruitmentKeys.jobQuestions(v.jobId) });
      toast.success("Question supprimée");
    },
    onError: (e: unknown) => {
      toast.error("Erreur", {
        description: e instanceof Error ? e.message : "Suppression impossible",
      });
    },
  });
}

export function useApplications(filters?: ApplicationsFilters) {
  const result = useQuery({
    queryKey: recruitmentKeys.applications(filters),
    queryFn: () => getApplications(filters),
    retry: 2,
    staleTime: 10000,
  });

  useEffect(() => {
    if (result.isError) {
      const msg = result.error instanceof Error ? result.error.message : "Erreur";
      toast.error("Erreur lors du chargement des candidatures", { description: msg });
    }
  }, [result.isError, result.error]);

  return result;
}

export function useApplicationDetail(id: number | undefined, options?: { enabled?: boolean }) {
  const allow = (options?.enabled ?? true) && id != null && id > 0;
  const result = useQuery({
    queryKey:
      id != null && id > 0
        ? recruitmentKeys.application(id)
        : (["recruitment", "application", "none"] as const),
    queryFn: () => getApplicationById(id!),
    enabled: allow,
    retry: 2,
    staleTime: 5000,
  });

  useEffect(() => {
    if (result.isError && allow) {
      const msg = result.error instanceof Error ? result.error.message : "Erreur";
      toast.error("Erreur lors du chargement du détail", { description: msg });
    }
  }, [result.isError, result.error, allow]);

  return result;
}

export function useUpdateApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateApplicationPayload;
    }) => updateApplication(id, data),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["recruitment", "applications"] });
      qc.invalidateQueries({ queryKey: recruitmentKeys.application(v.id) });
      qc.invalidateQueries({ queryKey: recruitmentKeys.adminJobs });
      toast.success("Candidature mise à jour");
    },
    onError: (e: unknown) => {
      toast.error("Erreur", {
        description: e instanceof Error ? e.message : "Mise à jour impossible",
      });
    },
  });
}
