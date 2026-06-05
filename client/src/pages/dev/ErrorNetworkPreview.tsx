import { ServerErrorPage } from "@/components/errors/ServerErrorPage";

/**
 * Prévisualisation de l’écran « Pas de connexion » (kind `network`).
 * Route : `/dev/error-network` — enregistrée uniquement si `import.meta.env.DEV`.
 */
export default function ErrorNetworkPreview() {
  return <ServerErrorPage kind="network" />;
}
