"use strict";

const OpenAI = require("openai");

const MAX_INPUT_CHARS = 8000;

const DRAFT_SYSTEM_PROMPT = `Tu aides un chef de projet LivSight à transformer des notes brutes en une tâche claire assignable à un agent.

À partir des notes (français ou mélange), produis UNIQUEMENT un JSON :
{
  "title": "titre actionnable (max ~80 caractères)",
  "description": "brief de tâche en puces, français professionnel"
}

Format attendu pour "description" (texte avec retours à la ligne, style puces).
N’inclus une section que si l’info est présente dans les notes :
- Contexte : pourquoi cette tâche existe
- Objectif : résultat attendu
- Périmètre : ce qui est inclus / exclu
- Actions à faire : étapes concrètes (1 action = 1 puce)
- Critères de done : comment savoir que c’est terminé
- Contraintes : délai, zone, photos, contacts, etc.

Règles :
- Ne invente aucun fait, délai, lieu, preuve, contact ou contrainte absent des notes.
- N’impose jamais une exigence (ex. photos, rapport, délai) si elle n’est pas mentionnée.
- Omets les sections sans contenu utile plutôt que de les remplir.
- Ton d’un project manager : clair, direct, orienté action.
- Pas de markdown hors des puces "- ", pas de commentaire hors JSON.
- Si les notes sont vagues, structure au mieux sans inventer.`;

const REJECTION_REASON_SYSTEM_PROMPT = `Tu aides un admin LivSight à rédiger le motif de rejet d'un rapport de mission.
À partir d'un brouillon, produis UNIQUEMENT un JSON :
{
  "reason": "motif clair, 1 à 3 phrases, français professionnel, actionnable pour l'agent"
}

Règles :
- Ne invente aucun fait absent du brouillon.
- Reste concis : explique ce qui manque ou ce qui est incorrect.
- Pas de markdown, pas de commentaire hors JSON.`;

const REPORT_SYSTEM_PROMPT = `Tu aides un agent LivSight à rédiger un rapport de mission digne d’un suivi projet professionnel.

À partir du brouillon, produis UNIQUEMENT un JSON :
{
  "report": "rapport en puces, français professionnel"
}

Format attendu pour "report" (texte avec retours à la ligne, style puces).
N’inclus une section que si l’info est présente dans le brouillon :
- Résumé : 1–2 phrases sur ce qui a été fait
- Actions réalisées : une puce par action concrète
- Observations / constats : faits sur le terrain
- Preuves : photos, documents, références
- Écarts / blocages : ce qui n’a pas pu être fait et pourquoi
- Suite recommandée : prochaines actions

Règles :
- Ne invente aucun fait, preuve, blocage ou prochaine étape absent du brouillon.
- N’ajoute jamais une contrainte ou une exigence non mentionnée (ex. « joindre des photos » si ce n’est pas dit).
- Omets les sections vides plutôt que de les inventer.
- Améliore clarté, orthographe et structure uniquement.
- Ton factuel, concis, utilisable par un manager.
- Pas de markdown hors des puces "- ", pas de commentaire hors JSON.`;

function validateInput(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return { ok: false, error: "empty_text", message: "Le texte est requis" };
  }
  if (trimmed.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: "text_too_long",
      message: `Le texte dépasse ${MAX_INPUT_CHARS} caractères`,
    };
  }
  return { ok: true, text: trimmed };
}

/**
 * @param {string} systemPrompt
 * @param {string} userText
 * @param {object} cfg
 * @returns {Promise<{ ok: true, raw: object } | { ok: false, error: string, message?: string }>}
 */
async function callIssueJsonAI(systemPrompt, userText, cfg) {
  if (!cfg?.OPENAI_API_KEY) {
    return {
      ok: false,
      error: "no_api_key",
      message: "OpenAI n'est pas configuré sur le bot",
    };
  }

  const client = new OpenAI({ apiKey: cfg.OPENAI_API_KEY });
  const controller = new AbortController();
  const timeoutMs = cfg.AI_ISSUE_TIMEOUT_MS || cfg.AI_DELIVERY_TIMEOUT_MS || 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const completion = await client.chat.completions.create(
      {
        model: cfg.AI_ISSUE_MODEL || cfg.AI_DELIVERY_MODEL || "gpt-4o-mini",
        max_tokens: cfg.AI_ISSUE_MAX_TOKENS || 800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
      },
      { signal: controller.signal }
    );

    const content = completion.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return { ok: false, error: "empty_response", message: "Réponse IA vide" };
    }

    let raw;
    try {
      raw = JSON.parse(content);
    } catch {
      return { ok: false, error: "invalid_json", message: "Réponse IA invalide" };
    }

    return { ok: true, raw };
  } catch (err) {
    const name = err?.name || "";
    const message = err?.message || String(err);
    if (name === "AbortError" || message.includes("abort")) {
      return { ok: false, error: "timeout", message: "Délai IA dépassé" };
    }
    return { ok: false, error: "ai_failed", message: "L'appel IA a échoué" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} messageText
 * @param {object} cfg
 */
async function draftIssueFromNotes(messageText, cfg, deps = {}) {
  const callAi = deps.callAi || callIssueJsonAI;
  const input = validateInput(messageText);
  if (!input.ok) return input;

  const ai = await callAi(DRAFT_SYSTEM_PROMPT, input.text, cfg);
  if (!ai.ok) return ai;

  const title = typeof ai.raw.title === "string" ? ai.raw.title.trim() : "";
  const description =
    typeof ai.raw.description === "string" ? ai.raw.description.trim() : "";

  if (!title || !description) {
    return {
      ok: false,
      error: "validation_failed",
      message: "Impossible de générer un titre et une description utilisables",
    };
  }

  return { ok: true, title, description };
}

/**
 * @param {string} messageText
 * @param {object} cfg
 */
/**
 * @param {string} messageText
 * @param {object} cfg
 */
async function polishIssueRejectionReason(messageText, cfg, deps = {}) {
  const callAi = deps.callAi || callIssueJsonAI;
  const input = validateInput(messageText);
  if (!input.ok) return input;

  const ai = await callAi(REJECTION_REASON_SYSTEM_PROMPT, input.text, cfg);
  if (!ai.ok) return ai;

  const reason = typeof ai.raw.reason === "string" ? ai.raw.reason.trim() : "";
  if (!reason) {
    return {
      ok: false,
      error: "validation_failed",
      message: "Impossible de produire un motif de rejet utilisable",
    };
  }

  return { ok: true, reason };
}

async function polishIssueReport(messageText, cfg, deps = {}) {
  const callAi = deps.callAi || callIssueJsonAI;
  const input = validateInput(messageText);
  if (!input.ok) return input;

  const ai = await callAi(REPORT_SYSTEM_PROMPT, input.text, cfg);
  if (!ai.ok) return ai;

  const report = typeof ai.raw.report === "string" ? ai.raw.report.trim() : "";
  if (!report) {
    return {
      ok: false,
      error: "validation_failed",
      message: "Impossible de produire un rapport utilisable",
    };
  }

  return { ok: true, report };
}

module.exports = {
  MAX_INPUT_CHARS,
  DRAFT_SYSTEM_PROMPT,
  REPORT_SYSTEM_PROMPT,
  draftIssueFromNotes,
  polishIssueReport,
  polishIssueRejectionReason,
  REJECTION_REASON_SYSTEM_PROMPT,
  callIssueJsonAI,
};
