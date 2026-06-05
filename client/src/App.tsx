import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AgencyProvider } from "@/contexts/AgencyContext";
import { handleError } from "@/lib/error-handler";
import Login from "./pages/auth/Login";
import Index from "./pages/dashboard/Index";
import Livraisons from "./pages/deliveries/Livraisons";
import LivraisonDetails from "./pages/deliveries/LivraisonDetails";
import Modifications from "./pages/deliveries/Modifications";
import Expeditions from "./pages/operations/Expeditions";
import Groups from "./pages/operations/Groups";
import GroupDetail from "./pages/operations/GroupDetail";
import Paiements from "./pages/finance/Paiements";
import Rapports from "./pages/finance/Rapports";
import Tarifs from "./pages/config/Tarifs";
import Parametres from "./pages/config/Parametres";
import Agencies from "./pages/admin/Agencies";
import Reminders from "./pages/admin/Reminders";
import Waitlist from "./pages/admin/Waitlist";
import JobsPage from "./pages/recruitment/JobsPage";
import ApplicationsPage from "./pages/recruitment/ApplicationsPage";
import NotFound from "./pages/NotFound";
import ServerError from "./pages/ServerError";
import ErrorNetworkPreview from "./pages/dev/ErrorNetworkPreview";
import LoadingDemo from "./pages/dev/LoadingDemo";
import { PostHogPageview } from "@/components/analytics/PostHogPageview";

// Configure QueryClient with better error handling
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors (client errors)
        if (error && typeof error === "object" && "statusCode" in error) {
          const statusCode = (error as { statusCode: number }).statusCode;
          if (statusCode >= 400 && statusCode < 500) {
            return false;
          }
        }
        // Retry up to 2 times for other errors
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 1000 * 30, // 30 seconds
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false, // Don't retry mutations by default
    },
  },
});

const App = () => (
  <ErrorBoundary
    onError={(error, errorInfo) => {
      // Log error to console in development
      if (import.meta.env.DEV) {
        console.error("ErrorBoundary caught error:", error, errorInfo);
      }
      // You could also send to error tracking service here (e.g., Sentry)
    }}
  >
    <QueryClientProvider client={queryClient}>
      <AgencyProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <PostHogPageview />
        <Routes>
          {/* Public route */}
          <Route path="/login" element={<Login />} />
          <Route path="/erreur" element={<ServerError />} />
          {import.meta.env.DEV ? (
            <>
              <Route path="/dev/error-network" element={<ErrorNetworkPreview />} />
              <Route path="/dev/loading" element={<LoadingDemo />} />
            </>
          ) : null}

          {/* Protected routes */}
          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Index />} />
            <Route path="/livraisons" element={<Livraisons />} />
            <Route path="/livraisons/:id" element={<LivraisonDetails />} />
            <Route path="/groupes" element={<Groups />} />
            <Route path="/groupes/:id" element={<GroupDetail />} />
            <Route path="/tarifs" element={<Tarifs />} />
            <Route
              path="/agences"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <Agencies />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rappels"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <Reminders />
                </ProtectedRoute>
              }
            />
            <Route
              path="/liste-attente"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <Waitlist />
                </ProtectedRoute>
              }
            />
            <Route path="/paiements" element={<Paiements />} />
            <Route path="/rapports" element={<Rapports />} />
            <Route path="/expeditions" element={<Expeditions />} />
            <Route path="/modifications" element={<Modifications />} />
            <Route path="/parametres" element={<Parametres />} />
            <Route path="/recruitment/jobs" element={<JobsPage />} />
            <Route path="/recruitment/applications" element={<ApplicationsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </TooltipProvider>
      </AgencyProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
