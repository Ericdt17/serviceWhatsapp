/**
 * Unit tests for client/src/services/recruitment.ts
 *
 * Verifies that each service function:
 *  - calls the correct HTTP helper (apiGet / apiPost / apiPatch / apiDelete)
 *  - with the correct URL and payload
 *  - unwraps successful responses
 *  - throws on failed responses (success: false)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MockInstance } from "vitest";

// ---------------------------------------------------------------------------
// Mock @/services/api — must come before the service import so the mock is
// applied before the module is evaluated (vitest hoists vi.mock calls).
// ---------------------------------------------------------------------------
vi.mock("@/services/api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

import * as apiModule from "@/services/api";
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
  type AdminJobOffer,
  type JobQuestion,
  type ApplicationRow,
  type ApplicationDetail,
} from "@/services/recruitment";

// Typed mock helpers
const mockApiGet    = apiModule.apiGet    as unknown as MockInstance;
const mockApiPost   = apiModule.apiPost   as unknown as MockInstance;
const mockApiPatch  = apiModule.apiPatch  as unknown as MockInstance;
const mockApiDelete = apiModule.apiDelete as unknown as MockInstance;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const jobFixture: AdminJobOffer = {
  id: 1,
  title: "Livreur Douala",
  type: "livreur",
  description: null,
  location: "Hippodrome, Yaoundé",
  slots: 2,
  is_open: true,
  created_at: "2026-04-18T00:00:00.000Z",
  updated_at: "2026-04-18T00:00:00.000Z",
  application_count: 0,
};

const questionFixture: JobQuestion = {
  id: 10,
  job_offer_id: 1,
  question_text: "Avez-vous une moto ?",
  question_type: "text",
  options: null,
  is_required: true,
  order_index: 1,
  created_at: "2026-04-18T00:00:00.000Z",
};

const applicationFixture: ApplicationRow = {
  id: 100,
  job_offer_id: 1,
  full_name: "Jean Dupont",
  phone: "699000001",
  quartier: "Bonamoussadi",
  transport: "scooter",
  availability: "plein",
  photo_url: null,
  photo_original_name: null,
  cv_url: null,
  cv_original_name: null,
  cover_letter_url: null,
  cover_letter_original_name: null,
  funnel_step: 1,
  score: null,
  status: "new",
  notes: null,
  created_at: "2026-04-18T00:00:00.000Z",
  updated_at: "2026-04-18T00:00:00.000Z",
  job_title: "Livreur Douala",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// unwrap helper — tested indirectly via each function
// ---------------------------------------------------------------------------
describe("unwrap helper (via service functions)", () => {
  it("throws when response.success is false", async () => {
    mockApiGet.mockResolvedValueOnce({
      success: false,
      error: "Unauthorized",
    });
    await expect(getAdminJobs()).rejects.toThrow("Unauthorized");
  });

  it("throws with fallback message when no error field", async () => {
    mockApiGet.mockResolvedValueOnce({ success: false });
    await expect(getAdminJobs()).rejects.toThrow(
      "Impossible de charger les offres"
    );
  });

  it("throws when data is undefined even if success is true", async () => {
    mockApiGet.mockResolvedValueOnce({ success: true, data: undefined });
    await expect(getAdminJobs()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
describe("getAdminJobs()", () => {
  it("calls apiGet with /api/v1/recruitment/admin/jobs", async () => {
    mockApiGet.mockResolvedValueOnce({ success: true, data: [jobFixture] });
    const result = await getAdminJobs();
    expect(mockApiGet).toHaveBeenCalledWith("/api/v1/recruitment/admin/jobs");
    expect(result).toEqual([jobFixture]);
  });
});

describe("createJob(data)", () => {
  it("calls apiPost with correct URL and payload", async () => {
    mockApiPost.mockResolvedValueOnce({ success: true, data: jobFixture });
    const payload = { title: "Livreur Douala", type: "livreur" as const };
    const result = await createJob(payload);
    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/v1/recruitment/admin/jobs",
      payload
    );
    expect(result.title).toBe("Livreur Douala");
  });
});

describe("updateJob(id, data)", () => {
  it("calls apiPatch with jobs/:id and payload", async () => {
    mockApiPatch.mockResolvedValueOnce({
      success: true,
      data: { ...jobFixture, is_open: false },
    });
    const result = await updateJob(1, { is_open: false });
    expect(mockApiPatch).toHaveBeenCalledWith(
      "/api/v1/recruitment/admin/jobs/1",
      { is_open: false }
    );
    expect(result.is_open).toBe(false);
  });
});

describe("deleteJob(id)", () => {
  it("calls apiDelete with jobs/:id", async () => {
    mockApiDelete.mockResolvedValueOnce({ success: true, data: { id: 1 } });
    const result = await deleteJob(1);
    expect(mockApiDelete).toHaveBeenCalledWith("/api/v1/recruitment/admin/jobs/1");
    expect(result.id).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------
describe("getJobQuestions(jobId)", () => {
  it("calls apiGet with jobs/:jobId/questions", async () => {
    mockApiGet.mockResolvedValueOnce({ success: true, data: [questionFixture] });
    const result = await getJobQuestions(1);
    expect(mockApiGet).toHaveBeenCalledWith(
      "/api/v1/recruitment/admin/jobs/1/questions"
    );
    expect(result).toHaveLength(1);
  });

  it("returns empty array when data is not an array", async () => {
    mockApiGet.mockResolvedValueOnce({ success: true, data: null });
    const result = await getJobQuestions(1);
    expect(result).toEqual([]);
  });
});

describe("createQuestion(jobId, data)", () => {
  it("calls apiPost with jobs/:jobId/questions", async () => {
    mockApiPost.mockResolvedValueOnce({ success: true, data: questionFixture });
    const payload = { question_text: "Test ?", question_type: "text" as const };
    const result = await createQuestion(1, payload);
    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/v1/recruitment/admin/jobs/1/questions",
      payload
    );
    expect(result.id).toBe(10);
  });
});

describe("updateQuestion(questionId, data)", () => {
  it("calls apiPatch with questions/:questionId", async () => {
    mockApiPatch.mockResolvedValueOnce({
      success: true,
      data: { ...questionFixture, is_required: false },
    });
    const result = await updateQuestion(10, { is_required: false });
    expect(mockApiPatch).toHaveBeenCalledWith(
      "/api/v1/recruitment/admin/questions/10",
      { is_required: false }
    );
    expect(result.is_required).toBe(false);
  });
});

describe("deleteQuestion(questionId)", () => {
  it("calls apiDelete with questions/:questionId", async () => {
    mockApiDelete.mockResolvedValueOnce({ success: true, data: { id: 10 } });
    const result = await deleteQuestion(10);
    expect(mockApiDelete).toHaveBeenCalledWith(
      "/api/v1/recruitment/admin/questions/10"
    );
    expect(result.id).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------
describe("getApplications(filters?)", () => {
  it("calls apiGet with /admin/applications (no filters)", async () => {
    mockApiGet.mockResolvedValueOnce({ success: true, data: [applicationFixture] });
    const result = await getApplications();
    expect(mockApiGet).toHaveBeenCalledWith(
      "/api/v1/recruitment/admin/applications",
      { job_offer_id: undefined, status: undefined, funnel_step: undefined }
    );
    expect(result).toHaveLength(1);
  });

  it("passes all filters to apiGet", async () => {
    mockApiGet.mockResolvedValueOnce({ success: true, data: [] });
    await getApplications({ job_offer_id: 1, status: "new", funnel_step: 2 });
    expect(mockApiGet).toHaveBeenCalledWith(
      "/api/v1/recruitment/admin/applications",
      { job_offer_id: 1, status: "new", funnel_step: 2 }
    );
  });

  it("returns empty array when data is not an array", async () => {
    mockApiGet.mockResolvedValueOnce({ success: true, data: null });
    const result = await getApplications();
    expect(result).toEqual([]);
  });
});

describe("getApplicationById(id)", () => {
  it("calls apiGet with applications/:id", async () => {
    const detail: ApplicationDetail = {
      application: {
        ...applicationFixture,
        job_title: "Livreur Douala",
        job_type: "livreur",
        job_description: null,
      },
      answers: [],
    };
    mockApiGet.mockResolvedValueOnce({ success: true, data: detail });
    const result = await getApplicationById(100);
    expect(mockApiGet).toHaveBeenCalledWith(
      "/api/v1/recruitment/admin/applications/100"
    );
    expect(result.application.id).toBe(100);
  });
});

describe("updateApplication(id, data)", () => {
  it("calls apiPatch with applications/:id and payload", async () => {
    mockApiPatch.mockResolvedValueOnce({
      success: true,
      data: { ...applicationFixture, status: "in_review" },
    });
    const result = await updateApplication(100, { status: "in_review" });
    expect(mockApiPatch).toHaveBeenCalledWith(
      "/api/v1/recruitment/admin/applications/100",
      { status: "in_review" }
    );
    expect(result.status).toBe("in_review");
  });

  it("forwards score and notes", async () => {
    mockApiPatch.mockResolvedValueOnce({
      success: true,
      data: { ...applicationFixture, score: 15, notes: "Bon profil" },
    });
    await updateApplication(100, { score: 15, notes: "Bon profil" });
    expect(mockApiPatch).toHaveBeenCalledWith(
      "/api/v1/recruitment/admin/applications/100",
      { score: 15, notes: "Bon profil" }
    );
  });
});
