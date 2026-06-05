import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Package,
  CreditCard,
  FileText,
  Settings,
  Menu,
  Users,
  MoreVertical,
  LogOut,
  Truck,
  History,
  BadgeDollarSign,
  Tags,
  Building2,
  Bell,
  ClipboardList,
  Briefcase,
  UserCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  requireSuperAdmin?: boolean;
}

const allNavItems: NavItem[] = [
  { title: "Tableau de bord", href: "/", icon: LayoutDashboard },
  { title: "Livraisons", href: "/livraisons", icon: Package },
  { title: "Expéditions", href: "/expeditions", icon: Truck },
  { title: "Prestataire", href: "/groupes", icon: Users },
  { title: "Modifications", href: "/modifications", icon: History },
  { title: "Paiements", href: "/paiements", icon: BadgeDollarSign },
  { title: "Tarifs", href: "/tarifs", icon: Tags },
  { title: "Agences", href: "/agences", icon: Building2, requireSuperAdmin: true },
  { title: "Rappels", href: "/rappels", icon: Bell, requireSuperAdmin: true },
  { title: "Liste d'attente", href: "/liste-attente", icon: ClipboardList, requireSuperAdmin: true },
  { title: "Offres", href: "/recruitment/jobs", icon: Briefcase },
  { title: "Candidatures", href: "/recruitment/applications", icon: UserCircle },
  { title: "Rapports", href: "/rapports", icon: FileText },
  { title: "Paramètres", href: "/parametres", icon: Settings },
];


export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { isSuperAdmin, user, logout } = useAuth();

  const visibleItems = allNavItems.filter((item) => !(item.requireSuperAdmin && !isSuperAdmin));

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Logo */}
      <div className="flex items-center justify-center px-5 py-6">
        <img
          src="/logo.svg"
          alt="LivSight"
          className="h-40 w-40 object-contain"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {visibleItems.map((item) => {
          const isActive =
            location.pathname === item.href ||
            (item.href !== "/" && location.pathname.startsWith(item.href + "/"));

          return (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={() => isMobile && setMobileOpen(false)}
              className={cn(
                "flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-150 group",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{item.title}</span>
              </div>
            </NavLink>
          );
        })}
      </nav>

      {/* User profile footer */}
      {user && (
        <div className="p-3">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary text-white">
            <img
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=ffffff&color=2F8FBF&rounded=true&bold=true&size=64`}
              alt={user.name}
              className="w-8 h-8 rounded-full flex-shrink-0 object-cover ring-2 ring-white/30"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate leading-tight">{user.name}</p>
              <p className="text-[11px] text-white/70 truncate leading-tight">{user.email}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20 flex-shrink-0"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-44">
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="w-4 h-4 mr-2" />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Trigger */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="fixed top-4 left-4 z-[110] md:hidden bg-background border border-border shadow-lg hover:bg-accent hover:shadow-xl transition-all duration-200 rounded-lg h-10 w-10"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80 p-0 bg-sidebar border-sidebar-border">
          <SidebarContent isMobile />
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col h-screen w-72 border-r border-sidebar-border sticky top-0">
        <SidebarContent />
      </aside>
    </>
  );
}
