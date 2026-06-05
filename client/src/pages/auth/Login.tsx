import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { LoadingSpinner } from "@/components/loading/LoadingSpinner";

const Login = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const success = await login(email, password);
      if (!success) {
        setError("Email ou mot de passe incorrect");
      }
    } catch {
      setError("Une erreur est survenue lors de la connexion");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 md:p-6">
      <div className="w-full max-w-6xl rounded-3xl border border-border/80 bg-card p-4 shadow-sm md:p-6">
        <div className="grid min-h-[620px] grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="flex items-center justify-center rounded-2xl bg-card px-6 py-8 md:px-10">
            <div className="w-full max-w-sm">
              <h1 className="text-3xl font-bold text-foreground">Se connecter</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Connectez-vous pour accéder à votre tableau de bord des opérations de livraison.
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Saisir votre email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder=".........."
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                  >
                    Mot de passe oublié
                  </button>
                </div>

                <Button type="submit" className="h-11 w-full gap-2" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <LoadingSpinner size="sm" variant="icon" className="gap-0" />
                      Connexion en cours...
                    </>
                  ) : (
                    "Se connecter"
                  )}
                </Button>

                <div className="space-y-3 pt-2">
                  <button
                    type="button"
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-card text-sm text-foreground transition-colors hover:bg-accent/30"
                  >
                    <span className="font-semibold text-primary">G</span>
                    <span>Continuer avec Google</span>
                  </button>

                  <button
                    type="button"
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-card text-sm text-foreground transition-colors hover:bg-accent/30"
                  >
                    <span className="font-semibold text-primary">f</span>
                    <span>Continuer avec Facebook</span>
                  </button>
                </div>

                <p className="pt-2 text-center text-sm text-muted-foreground">
                  Vous n&apos;avez pas de compte ?{" "}
                  <button type="button" className="font-medium text-primary hover:underline">
                    S&apos;inscrire
                  </button>
                </p>
              </form>
            </div>
          </section>

          <section className="relative hidden overflow-hidden rounded-2xl bg-primary p-10 text-primary-foreground lg:block">
            <h2 className="max-w-md text-5xl font-bold leading-tight">
              De belles opportunités vous attendent.
            </h2>
            <p className="mt-4 max-w-md text-base text-primary-foreground/90">
              Gérez les livraisons, paiements et partenaires dans un seul endroit, rapidement et en toute confiance.
            </p>

            <div className="absolute left-10 top-56 h-28 w-1 rounded-full bg-white/50" />
            <div className="absolute bottom-10 left-10 h-1 w-14 rounded-full bg-white/50" />
          </section>
        </div>
      </div>
    </div>
  );
};

export default Login;
