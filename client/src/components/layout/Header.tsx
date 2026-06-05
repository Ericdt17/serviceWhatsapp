/**
 * Dashboard Header
 * Shows user info and logout button
 */

import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AuthContext } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, User, Shield } from "lucide-react";
import { getAgencyMe } from "@/services/agencies";

export function Header() {
  // Use useContext directly to avoid hook error if context is not available
  const authContext = useContext(AuthContext);
  const navigate = useNavigate();

  // Load agency data to get logo - only for agency admins (not super admins)
  // Must be called unconditionally before any early returns
  const { data: agency } = useQuery({
    queryKey: ["agency", "me"],
    queryFn: getAgencyMe,
    retry: 1,
    enabled: !!authContext?.user && !authContext?.isSuperAdmin && authContext?.user?.role === "agency",
  });

  if (!authContext) {
    return null;
  }

  const { user, logout, isSuperAdmin } = authContext;

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || user.email[0].toUpperCase();

  return (
    <header className="sticky top-0 z-[100] w-full border-b bg-background backdrop-blur-sm">
      <div className="container mx-auto flex h-[100px] items-center justify-between px-4 md:px-6 lg:px-8 relative">
        {/* Logo/Titre - caché sur mobile, visible sur desktop */}
        <div className="hidden md:flex items-center gap-2">
          <h1 className="text-lg font-semibold">LivSight</h1>
          {isSuperAdmin && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              <Shield className="h-3 w-3" />
              Super Admin
            </span>
          )}
        </div>

        {/* Titre centré sur mobile - position absolue pour ne pas affecter le flex */}
        <div className="absolute left-1/2 transform -translate-x-1/2 md:hidden pointer-events-none">
          <h1 className="text-lg font-semibold">LivSight</h1>
        </div>

        {/* Espaceur invisible sur mobile pour équilibrer avec le bouton menu à gauche */}
        <div className="md:hidden w-12"></div>

        <div className="flex items-center gap-4 ml-auto">
          <span className="hidden text-sm text-muted-foreground sm:inline-block">
            {user.name || user.email}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-[70px] w-[70px] rounded-full">
                <Avatar className="h-[70px] w-[70px]">
                  {agency?.logo_base64 ? (
                    <AvatarImage src={agency.logo_base64} alt={agency.name || "Logo agence"} />
                  ) : null}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user.email}
                  </p>
                  {user.role && (
                    <p className="text-xs leading-none text-muted-foreground mt-1">
                      {isSuperAdmin ? "Super Administrateur" : "Administrateur Agence"}
                    </p>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/parametres")}>
                <User className="mr-2 h-4 w-4" />
                <span>Profil</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Déconnexion</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

