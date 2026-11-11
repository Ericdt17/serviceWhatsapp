"use strict";

const {
  buildLinkWelcomeMessage,
  resolveStoreUrlsFromEnv,
} = require("../../lib/linkWelcomeMessage");

const ANDROID =
  "https://play.google.com/store/apps/details?id=com.livsight.client";
const IOS = "https://apps.apple.com/fr/app/livsight/id6788786430";

describe("buildLinkWelcomeMessage", () => {
  const base = {
    groupName: "Pharmacie Test",
    groupId: "120363424985037911@g.us",
    androidUrl: ANDROID,
    iosUrl: IOS,
  };

  it("includes group name and group id", () => {
    const text = buildLinkWelcomeMessage(base);
    expect(text).toContain("Pharmacie Test");
    expect(text).toContain("120363424985037911@g.us");
    expect(text).toMatch(/\*Nom du groupe\s*:?\*/);
    expect(text).toMatch(/\*Identifiant\s*:?\*/);
  });

  it("includes French welcome and credentials instructions", () => {
    const text = buildLinkWelcomeMessage(base);
    expect(text).toContain("Bienvenue chez LivSight");
    expect(text).toMatch(/configuré avec succès/i);
    expect(text).toMatch(/identifiants de connexion/i);
    expect(text).toContain("*L'équipe LivSight*");
  });

  it("includes both store links when provided", () => {
    const text = buildLinkWelcomeMessage(base);
    expect(text).toContain(ANDROID);
    expect(text).toContain(IOS);
    expect(text).toMatch(/Android\s*:/);
    expect(text).toMatch(/iPhone\s*:/);
  });

  it("keeps a short dashboard paste tip under the id", () => {
    const text = buildLinkWelcomeMessage(base);
    expect(text).toMatch(/dashboard LivSight/i);
    expect(text).toMatch(/profil client/i);
  });

  it("uses WhatsApp bold markers not markdown double-star", () => {
    const text = buildLinkWelcomeMessage(base);
    expect(text).not.toMatch(/\*\*/);
    expect(text).toMatch(/\*[^*\n]+\*/);
  });

  it("omits Android line when androidUrl is empty", () => {
    const text = buildLinkWelcomeMessage({ ...base, androidUrl: "" });
    expect(text).not.toMatch(/Android\s*:/);
    expect(text).toContain(IOS);
    expect(text).toMatch(/iPhone\s*:/);
  });

  it("omits iPhone line when iosUrl is empty", () => {
    const text = buildLinkWelcomeMessage({ ...base, iosUrl: "   " });
    expect(text).not.toMatch(/iPhone\s*:/);
    expect(text).toContain(ANDROID);
    expect(text).toMatch(/Android\s*:/);
  });

  it("omits download section when both store urls are empty", () => {
    const text = buildLinkWelcomeMessage({
      ...base,
      androidUrl: "",
      iosUrl: "",
    });
    expect(text).not.toMatch(/Télécharger l'application/i);
    expect(text).not.toMatch(/Android\s*:/);
    expect(text).not.toMatch(/iPhone\s*:/);
    expect(text).toContain("120363424985037911@g.us");
    expect(text).toMatch(/identifiants de connexion/i);
  });
});

describe("resolveStoreUrlsFromEnv", () => {
  const prevAndroid = process.env.LIVSIGHT_ANDROID_STORE_URL;
  const prevIos = process.env.LIVSIGHT_IOS_STORE_URL;

  afterEach(() => {
    if (prevAndroid === undefined) delete process.env.LIVSIGHT_ANDROID_STORE_URL;
    else process.env.LIVSIGHT_ANDROID_STORE_URL = prevAndroid;
    if (prevIos === undefined) delete process.env.LIVSIGHT_IOS_STORE_URL;
    else process.env.LIVSIGHT_IOS_STORE_URL = prevIos;
  });

  it("reads Android and iOS urls from env", () => {
    process.env.LIVSIGHT_ANDROID_STORE_URL = ANDROID;
    process.env.LIVSIGHT_IOS_STORE_URL = IOS;
    expect(resolveStoreUrlsFromEnv()).toEqual({
      androidUrl: ANDROID,
      iosUrl: IOS,
    });
  });

  it("returns empty strings when env unset", () => {
    delete process.env.LIVSIGHT_ANDROID_STORE_URL;
    delete process.env.LIVSIGHT_IOS_STORE_URL;
    expect(resolveStoreUrlsFromEnv()).toEqual({
      androidUrl: "",
      iosUrl: "",
    });
  });
});
