"use strict";

const {
  draftIssueFromNotes,
  polishIssueReport,
  polishIssueRejectionReason,
} = require("../../lib/issueAiAssist");

describe("draftIssueFromNotes", () => {
  const cfg = { OPENAI_API_KEY: "sk-test" };

  it("returns validation error for empty text", async () => {
    const result = await draftIssueFromNotes("  ", cfg);
    expect(result).toEqual({
      ok: false,
      error: "empty_text",
      message: "Le texte est requis",
    });
  });

  it("returns no_api_key when OpenAI is not configured", async () => {
    const result = await draftIssueFromNotes("notes", {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe("no_api_key");
  });

  it("returns title and description when AI succeeds", async () => {
    const callAi = jest.fn().mockResolvedValue({
      ok: true,
      raw: {
        title: "Écart stock zone B",
        description: "Inventaire incorrect constaté ce matin.",
      },
    });

    const result = await draftIssueFromNotes("stock zone B foireux", cfg, {
      callAi,
    });

    expect(result).toEqual({
      ok: true,
      title: "Écart stock zone B",
      description: "Inventaire incorrect constaté ce matin.",
    });
    expect(callAi).toHaveBeenCalled();
  });

  it("returns validation_failed when title/description missing", async () => {
    const callAi = jest.fn().mockResolvedValue({
      ok: true,
      raw: { title: "", description: "" },
    });
    const result = await draftIssueFromNotes("notes", cfg, { callAi });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("validation_failed");
  });
});

describe("polishIssueReport", () => {
  const cfg = { OPENAI_API_KEY: "sk-test" };

  it("returns validation error for empty text", async () => {
    const result = await polishIssueReport("", cfg);
    expect(result.error).toBe("empty_text");
  });

  it("returns no_api_key when OpenAI is not configured", async () => {
    const result = await polishIssueReport("brouillon", {});
    expect(result.error).toBe("no_api_key");
  });

  it("returns polished report when AI succeeds", async () => {
    const callAi = jest.fn().mockResolvedValue({
      ok: true,
      raw: { report: "Passage effectué. Écart corrigé. Photos prises." },
    });

    const result = await polishIssueReport("jai passé zone b ok photos", cfg, {
      callAi,
    });

    expect(result).toEqual({
      ok: true,
      report: "Passage effectué. Écart corrigé. Photos prises.",
    });
  });
});


describe("polishIssueRejectionReason", () => {
  const cfg = { OPENAI_API_KEY: "sk-test" };

  it("returns validation error for empty text", async () => {
    const result = await polishIssueRejectionReason("", cfg);
    expect(result.error).toBe("empty_text");
  });

  it("returns polished rejection reason when AI succeeds", async () => {
    const callAi = jest.fn().mockResolvedValue({
      ok: true,
      raw: { reason: "Photos de preuve manquantes pour la zone B." },
    });

    const result = await polishIssueRejectionReason("manque photos zone b", cfg, {
      callAi,
    });

    expect(result).toEqual({
      ok: true,
      reason: "Photos de preuve manquantes pour la zone B.",
    });
  });
});
