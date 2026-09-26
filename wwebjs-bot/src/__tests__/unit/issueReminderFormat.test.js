"use strict";

const {
  formatIssueReminder,
  PRIORITY_LABELS_FR,
  DESCRIPTION_DISPLAY_MAX,
} = require("../../lib/issueReminderFormat");

const base = {
  title: "Vérifier le stock physique",
  priority: "high",
  dueDate: "2026-09-26T15:30:00+01:00",
  assignedBy: "Eric",
  description: "Faire le comptage du stock",
  timezone: "Africa/Douala",
};

describe("formatIssueReminder", () => {
  it("maps priority labels to French", () => {
    expect(PRIORITY_LABELS_FR.low).toBe("Basse");
    expect(PRIORITY_LABELS_FR.medium).toBe("Moyenne");
    expect(PRIORITY_LABELS_FR.high).toBe("Haute");
  });

  it("formats created with warm copy and full due datetime", () => {
    const text = formatIssueReminder("created", base);
    expect(text).toContain("*Nouvelle mission*");
    expect(text).toContain("*Vérifier le stock physique*");
    expect(text).toContain("*Haute*");
    expect(text).toContain("Eric");
    expect(text).toContain("Faire le comptage du stock");
    expect(text).toMatch(/26\/09\/2026/);
    expect(text).toMatch(/15h30/);
    expect(text).toContain("À faire avant");
    expect(text).toContain("Bonne route");
  });

  it("formats reassigned similarly to created", () => {
    const text = formatIssueReminder("reassigned", {
      ...base,
      assignedBy: "Maxime",
    });
    expect(text).toContain("*Nouvelle mission*");
    expect(text).toContain("Maxime");
  });

  it("omits due line when dueDate missing on created", () => {
    const text = formatIssueReminder("created", {
      ...base,
      dueDate: null,
    });
    expect(text).toContain("*Nouvelle mission*");
    expect(text).not.toMatch(/À faire avant/);
  });

  it("soft-truncates long description for display", () => {
    const long = "x".repeat(DESCRIPTION_DISPLAY_MAX + 50);
    const text = formatIssueReminder("created", {
      ...base,
      description: long,
    });
    expect(text).toContain("…");
    expect(text.includes(long)).toBe(false);
  });

  it("formats due_24h warmly with full due datetime", () => {
    const text = formatIssueReminder("due_24h", base);
    expect(text).toContain("*Petit rappel*");
    expect(text).toContain("*Vérifier le stock physique*");
    expect(text).toContain("Demain");
    expect(text).toMatch(/26\/09\/2026/);
    expect(text).toMatch(/15h30/);
    expect(text).not.toContain("Faire le comptage");
  });

  it("formats due_3h warmly with full due datetime", () => {
    const text = formatIssueReminder("due_3h", base);
    expect(text).toContain("*Dernière ligne droite*");
    expect(text).toContain("3 heures");
    expect(text).toContain("*Vérifier le stock physique*");
    expect(text).toMatch(/15h30/);
  });

  it("formats due_now warmly with full due datetime", () => {
    const text = formatIssueReminder("due_now", base);
    expect(text).toContain("*C’est l’heure*");
    expect(text).toContain("maintenant");
    expect(text).toContain("*Vérifier le stock physique*");
    expect(text).toMatch(/15h30/);
  });

  it("formats overdue_2h warmly", () => {
    const text = formatIssueReminder("overdue_2h", base);
    expect(text).toContain("*On est un peu en retard*");
    expect(text).toContain("2 heures");
    expect(text).toContain("*Vérifier le stock physique*");
    expect(text).toMatch(/15h30/);
  });

  it("formats overdue_repeat warmly", () => {
    const text = formatIssueReminder("overdue_repeat", base);
    expect(text).toContain("*Toujours en attente*");
    expect(text).toContain("bloqué");
    expect(text).toContain("*Vérifier le stock physique*");
  });

  it("formats resolved_review with title and person in charge on their own lines", () => {
    const text = formatIssueReminder("resolved_review", {
      ...base,
      assignedBy: "Maxime",
    });
    expect(text).toContain("*À valider de votre côté*");
    expect(text).toMatch(/\n\*Vérifier le stock physique\*\n/);
    expect(text).toContain("Personne en charge : Maxime");
    expect(text).toContain("rapport");
  });

  it("formats report_rejected with title on its own line and reason", () => {
    const text = formatIssueReminder("report_rejected", {
      ...base,
      reason: "Photos manquantes sur le stock B",
    });
    expect(text).toContain("*Petit retour sur votre rapport*");
    expect(text).toMatch(/\n\*Vérifier le stock physique\*\n/);
    expect(text).toContain("Photos manquantes");
    expect(text).toContain("complément");
  });

  it("formats closed with title on its own line for the agent", () => {
    const text = formatIssueReminder("closed", base);
    expect(text).toContain("*Mission clôturée*");
    expect(text).toMatch(/\n\*Vérifier le stock physique\*\n/);
    expect(text).toContain("Merci");
  });

  it("throws on unknown type", () => {
    expect(() => formatIssueReminder("nope", base)).toThrow(/type/i);
  });
});
