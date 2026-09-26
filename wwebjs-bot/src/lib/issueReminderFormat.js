"use strict";

const PRIORITY_LABELS_FR = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
};

const DESCRIPTION_DISPLAY_MAX = 280;
const MAX_MESSAGE_LENGTH = 4000;

/**
 * @param {string} priority
 * @returns {string}
 */
function priorityLabelFr(priority) {
  const key = String(priority || "").toLowerCase();
  return PRIORITY_LABELS_FR[key] || PRIORITY_LABELS_FR.medium;
}

/**
 * Soft-truncate for mobile WhatsApp display.
 * @param {string} text
 * @param {number} max
 */
function softTruncate(text, max = DESCRIPTION_DISPLAY_MAX) {
  const s = String(text || "").trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * WhatsApp bold — strip * so nested markup does not break.
 * @param {string} text
 */
function waBold(text) {
  const cleaned = String(text || "")
    .replace(/\*/g, "")
    .trim();
  if (!cleaned) return "";
  return `*${cleaned}*`;
}

/**
 * Format due date for Africa/Douala-style display: DD/MM/YYYY à HHhMM
 * @param {string|null|undefined} dueDateIso
 * @param {string} timezone
 * @returns {{ datePart: string, timePart: string } | null}
 */
function formatDueParts(dueDateIso, timezone = "Africa/Douala") {
  if (dueDateIso == null || String(dueDateIso).trim() === "") {
    return null;
  }
  const d = new Date(dueDateIso);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  const datePart = new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const timeRaw = new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  // "18:00" → "18h00"
  const timePart = timeRaw.replace(":", "h");
  return { datePart, timePart };
}

/**
 * Full due line for WhatsApp: "26/09/2026 à 15h30"
 * @param {{ datePart: string, timePart: string } | null} due
 */
function formatDueLabel(due) {
  if (!due) return null;
  return `${due.datePart} à ${due.timePart}`;
}

/**
 * @param {string} type
 * @param {{
 *   title?: string,
 *   description?: string|null,
 *   priority?: string,
 *   dueDate?: string|null,
 *   assignedBy?: string|null,
 *   reason?: string|null,
 *   timezone?: string,
 * }} issue
 * @returns {string}
 */
function formatIssueReminder(type, issue = {}) {
  const title = String(issue.title || "").trim() || "Sans titre";
  const titleBold = waBold(title);
  const tz = issue.timezone || process.env.TIME_ZONE || "Africa/Douala";
  const due = formatDueParts(issue.dueDate, tz);
  const dueLabel = formatDueLabel(due);
  const assignedBy = issue.assignedBy != null ? String(issue.assignedBy).trim() : "";
  const description = softTruncate(issue.description || "");
  const priorityBold = waBold(priorityLabelFr(issue.priority));

  let text;
  switch (type) {
    case "created":
    case "reassigned": {
      const lines = [
        waBold("Nouvelle mission"),
        "",
        titleBold,
      ];
      if (description) {
        lines.push("", description);
      }
      lines.push("", "────────");
      lines.push(`Priorité : ${priorityBold}`);
      if (dueLabel) {
        lines.push(`À faire avant : ${waBold(dueLabel)}`);
      }
      if (assignedBy) {
        lines.push(`De la part de : ${assignedBy}`);
      }
      lines.push("", "_Bonne route, on compte sur vous._");
      text = lines.join("\n");
      break;
    }
    case "due_24h": {
      const lines = [
        waBold("Petit rappel"),
        "",
        `Demain approche pour ${titleBold}.`,
      ];
      if (dueLabel) {
        lines.push("", `Prévu pour le ${waBold(dueLabel)}.`);
      }
      lines.push("", "_Un coup d’œil aujourd’hui évite le rush demain._");
      text = lines.join("\n");
      break;
    }
    case "due_3h": {
      const lines = [
        waBold("Dernière ligne droite"),
        "",
        `Il reste environ 3 heures pour ${titleBold}.`,
      ];
      if (dueLabel) {
        lines.push("", `Limite : ${waBold(dueLabel)}.`);
      }
      lines.push("", "_Vous y êtes presque._");
      text = lines.join("\n");
      break;
    }
    case "due_now": {
      const lines = [
        waBold("C’est l’heure"),
        "",
        `${titleBold} arrive à son terme maintenant.`,
      ];
      if (dueLabel) {
        lines.push("", `Prévu : ${waBold(dueLabel)}.`);
      }
      lines.push("", "_Merci de finaliser dès que possible._");
      text = lines.join("\n");
      break;
    }
    case "overdue_2h": {
      const lines = [
        waBold("On est un peu en retard"),
        "",
        `${titleBold} dépasse l’échéance depuis 2 heures.`,
      ];
      if (dueLabel) {
        lines.push("", `C’était prévu pour le ${waBold(dueLabel)}.`);
      }
      lines.push("", "_Pas de panique — un coup de main et on rattrape._");
      text = lines.join("\n");
      break;
    }
    case "overdue_repeat": {
      const lines = [
        waBold("Toujours en attente"),
        "",
        `${titleBold} n’est pas encore terminée.`,
      ];
      if (dueLabel) {
        lines.push("", `Échéance dépassée : ${waBold(dueLabel)}.`);
      }
      lines.push("", "_Dites-nous si vous êtes bloqué·e, on s’organise._");
      text = lines.join("\n");
      break;
    }
    case "resolved_review": {
      const agent =
        assignedBy != null && String(assignedBy).trim() !== ""
          ? String(assignedBy).trim()
          : "l’équipe terrain";
      const lines = [
        waBold("À valider de votre côté"),
        "",
        titleBold,
        "",
        `Personne en charge : ${agent}`,
        "",
        "_Jetez un œil au rapport, puis validez ou demandez une correction._",
      ];
      text = lines.join("\n");
      break;
    }
    case "report_rejected": {
      const reasonText = softTruncate(issue.reason || "", DESCRIPTION_DISPLAY_MAX);
      const lines = [
        waBold("Petit retour sur votre rapport"),
        "",
        titleBold,
        "",
        "On a besoin d’un complément.",
      ];
      if (reasonText) {
        lines.push("", `Voici pourquoi : ${reasonText}`);
      }
      lines.push(
        "",
        "_Reprenez quand vous pouvez — la mission est de nouveau en cours._"
      );
      text = lines.join("\n");
      break;
    }
    case "closed": {
      const lines = [
        waBold("Mission clôturée"),
        "",
        titleBold,
        "",
        "_Merci, c’est bien noté de notre côté._",
      ];
      text = lines.join("\n");
      break;
    }
    default:
      throw new Error(`Unknown issue reminder type: ${type}`);
  }

  if (text.length > MAX_MESSAGE_LENGTH) {
    text = softTruncate(text, MAX_MESSAGE_LENGTH);
  }
  return text;
}

module.exports = {
  PRIORITY_LABELS_FR,
  DESCRIPTION_DISPLAY_MAX,
  MAX_MESSAGE_LENGTH,
  formatIssueReminder,
  softTruncate,
  formatDueParts,
  formatDueLabel,
  priorityLabelFr,
  waBold,
};
