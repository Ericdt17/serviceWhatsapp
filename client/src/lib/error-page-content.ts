import { ApiError } from "@/types/api";

export type ErrorPageKind =
  | "react"
  | "server"
  | "not-found"
  | "not-found-resource"
  | "unauthorized"
  | "forbidden"
  | "bad-request"
  | "conflict"
  | "validation"
  | "rate-limit"
  | "unavailable"
  | "timeout"
  | "network"
  | "generic";

export type ErrorPageCopy = {
  headline: string;
  body: string;
  stepsTitle: string;
  steps: [string, string, string];
  code: string;
  codeSubtitle: string;
};

export const ERROR_PAGE_COPY: Record<ErrorPageKind, ErrorPageCopy> = {
  react: {
    headline: "Oups ! L’interface a pris un coup de chaleur.",
    body: "Un bug s’est glissé dans l’affichage. Rien de grave : un petit repos et ça repart. Si ça revient, faites signe.",
    stepsTitle: "Que faire ?",
    steps: [
      "Actualiser la page — c’est souvent suffisant.",
      "Utiliser « Réessayer » ou revenir à l’accueil si la page reste bloquée.",
      "Si ça ne se passe pas, nous écrire sur WhatsApp via le bouton « Nous contacter » en indiquant ce que vous faisiez.",
    ],
    code: "!",
    codeSubtitle: "Erreur d’affichage",
  },
  server: {
    headline: "Oups ! Notre serveur est en séance de thérapie.",
    body: "Parfois même les machines ont besoin de souffler. Le nôtre est en ce moment allongé sur le divan, en train de mettre des mots sur ce qu’il ressent.",
    stepsTitle: "Que faire ?",
    steps: [
      "Actualiser la page — parfois il suffit d’un instant.",
      "Utiliser « Réessayer » si le bouton est affiché.",
      "Si ça ne se passe pas, nous écrire sur WhatsApp via le bouton « Nous contacter ».",
    ],
    code: "500",
    codeSubtitle: "Erreur serveur",
  },
  "not-found": {
    headline: "Cette page a pris des vacances sans laisser d’adresse.",
    body: "L’URL ne mène nulle part dans LivSight — peut-être une faute de frappe, un lien ancien ou une page déplacée.",
    stepsTitle: "Que faire ?",
    steps: [
      "Actualiser la page au cas où l’URL aurait été mal chargée.",
      "Vérifier l’adresse ou retourner au tableau de bord.",
      "Si ça ne se passe pas et qu’un lien du site mène ici, nous contacter.",
    ],
    code: "404",
    codeSubtitle: "Page introuvable",
  },
  "not-found-resource": {
    headline: "On ne trouve plus ce qu’on cherchait.",
    body: "Cette ressource n’existe pas, a été supprimée, ou vous n’avez pas le bon lien. Le serveur a bien cherché dans les cartons.",
    stepsTitle: "Que faire ?",
    steps: [
      "Actualiser la page — la ressource peut réapparaître.",
      "Retourner à la liste (livraisons, prestataires, etc.).",
      "Si ça ne se passe pas, nous contacter en précisant ce que vous cherchiez.",
    ],
    code: "404",
    codeSubtitle: "Ressource introuvable",
  },
  unauthorized: {
    headline: "Il manque un badge pour entrer ici.",
    body: "Votre session n’est pas reconnue ou a expiré. Comme un entrepôt fermé à clé : reconnectez-vous pour continuer.",
    stepsTitle: "Que faire ?",
    steps: [
      "Actualiser la page, puis vous reconnecter depuis la page de connexion si besoin.",
      "Vider le cache du navigateur si la session pose problème.",
      "Si ça ne se passe pas, nous contacter ou votre administrateur.",
    ],
    code: "401",
    codeSubtitle: "Non autorisé",
  },
  forbidden: {
    headline: "Cette porte est réservée à d’autres personnes.",
    body: "Vous êtes bien connecté, mais pas autorisé à voir cette ressource (autre agence, rôle insuffisant, etc.).",
    stepsTitle: "Que faire ?",
    steps: [
      "Actualiser la page pour écarter un affichage obsolète.",
      "Revenir en arrière ou au tableau de bord — les droits peuvent expliquer le blocage.",
      "Si ça ne se passe pas alors que vous devriez avoir accès, nous contacter.",
    ],
    code: "403",
    codeSubtitle: "Accès refusé",
  },
  "bad-request": {
    headline: "La requête ne passait pas la douane.",
    body: "Les informations envoyées ne sont pas au bon format ou incomplètes. Le serveur n’a pas pu les traiter correctement.",
    stepsTitle: "Que faire ?",
    steps: [
      "Actualiser la page puis revérifier les champs du formulaire.",
      "Corriger les données et soumettre à nouveau.",
      "Si ça ne se passe pas alors que tout semble correct, nous contacter.",
    ],
    code: "400",
    codeSubtitle: "Requête invalide",
  },
  conflict: {
    headline: "Deux choses veulent occuper le même espace.",
    body: "Cette action entre en conflit avec l’existant (doublon, version déjà modifiée, etc.).",
    stepsTitle: "Que faire ?",
    steps: [
      "Actualiser la page pour voir les données à jour.",
      "Adapter votre saisie (doublon ou conflit possible).",
      "Si ça ne se passe pas, nous contacter.",
    ],
    code: "409",
    codeSubtitle: "Conflit",
  },
  validation: {
    headline: "Quelques champs demandent votre attention.",
    body: "Les données ne respectent pas les règles attendues (formats, champs obligatoires, etc.).",
    stepsTitle: "Que faire ?",
    steps: [
      "Actualiser la page si besoin, puis relire les messages près des champs.",
      "Corriger et soumettre à nouveau.",
      "Si ça ne se passe pas ou que le message n’est pas clair, nous contacter.",
    ],
    code: "422",
    codeSubtitle: "Données invalides",
  },
  "rate-limit": {
    headline: "On a un peu trop sollicité le serveur d’un coup.",
    body: "Pour protéger le service, il faut patienter un peu avant de réessayer.",
    stepsTitle: "Que faire ?",
    steps: [
      "Attendre un peu, puis actualiser la page.",
      "Éviter de cliquer en rafale sur le même bouton.",
      "Si ça ne se passe pas, patienter encore ou nous contacter.",
    ],
    code: "429",
    codeSubtitle: "Trop de requêtes",
  },
  unavailable: {
    headline: "Le service fait une petite pause technique.",
    body: "Le serveur ou une dépendance est temporairement indisponible. Ce n’est en général pas de votre côté.",
    stepsTitle: "Que faire ?",
    steps: [
      "Patienter une minute, puis actualiser la page.",
      "Vérifier votre connexion internet.",
      "Si ça ne se passe pas, réessayer plus tard ou nous contacter.",
    ],
    code: "503",
    codeSubtitle: "Indisponible",
  },
  timeout: {
    headline: "La réponse a mis trop longtemps à arriver.",
    body: "Le serveur ou le réseau n’a pas répondu à temps. Parfois c’est une surcharge temporaire.",
    stepsTitle: "Que faire ?",
    steps: [
      "Actualiser la page ou réessayer dans un instant.",
      "Vérifier votre connexion si le problème continue.",
      "Si ça ne se passe pas, nous contacter.",
    ],
    code: "408",
    codeSubtitle: "Délai dépassé",
  },
  network: {
    headline: "On n’arrive pas à joindre le serveur.",
    body: "Votre appareil semble hors ligne, ou la connexion est trop instable pour échanger avec LivSight. Rien n’a été envoyé côté serveur tant que la liaison ne repasse pas.",
    stepsTitle: "Que faire ?",
    steps: [
      "Vérifier le Wi‑Fi ou les données mobiles, puis réessayer.",
      "Si vous êtes connecté, patienter un instant et utiliser « Réessayer ».",
      "Si le problème continue, tester une autre page web pour confirmer l’accès internet.",
    ],
    code: "—",
    codeSubtitle: "Pas de connexion",
  },
  generic: {
    headline: "Quelque chose s’est mal passé.",
    body: "Une erreur empêche d’afficher ou d’enregistrer correctement. Les détails peuvent aider l’équipe à corriger.",
    stepsTitle: "Que faire ?",
    steps: [
      "Actualiser la page — c’est la première chose à essayer.",
      "Utiliser « Réessayer » si le bouton est affiché.",
      "Si ça ne se passe pas, nous contacter en décrivant ce qui s’affiche.",
    ],
    code: "…",
    codeSubtitle: "Erreur",
  },
};

export function statusCodeToErrorPageKind(code: number): ErrorPageKind {
  switch (code) {
    case 0:
      return "network";
    case 400:
      return "bad-request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not-found-resource";
    case 408:
    case 504:
      return "timeout";
    case 409:
      return "conflict";
    case 422:
      return "validation";
    case 429:
      return "rate-limit";
    case 500:
      return "server";
    case 502:
    case 503:
      return "unavailable";
    default:
      if (code >= 500) return "server";
      if (code >= 400) return "generic";
      return "generic";
  }
}

/** Erreur réseau / hors ligne (fetch impossible, etc.) — aligné sur `isNetworkError` côté handler. */
function isNetworkErrorLike(error: unknown): boolean {
  if (error instanceof ApiError) {
    return (
      error.statusCode === 0 ||
      error.message.includes("Network") ||
      error.message.includes("fetch")
    );
  }
  if (error instanceof Error) {
    return (
      error.message.includes("Network") ||
      error.message.includes("fetch") ||
      error.message.includes("Failed to fetch") ||
      error.message.includes("Load failed")
    );
  }
  return false;
}

export function resolveErrorPageKind(error: unknown): ErrorPageKind {
  if (isNetworkErrorLike(error)) {
    return "network";
  }
  if (error instanceof ApiError) {
    return statusCodeToErrorPageKind(error.statusCode);
  }
  if (error instanceof Error) {
    if (error.name === "AbortError") return "timeout";
    return "generic";
  }
  return "generic";
}

export function getTechnicalMessage(error: unknown): string | null {
  if (error instanceof ApiError) return error.message || null;
  if (error instanceof Error) return error.message || null;
  if (typeof error === "string") return error;
  return null;
}
