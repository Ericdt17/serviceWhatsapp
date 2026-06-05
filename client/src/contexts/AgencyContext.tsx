import { createContext, useContext, useState, ReactNode } from "react";

interface AgencyContextType {
  selectedAgencyId: number | null;
  setSelectedAgencyId: (id: number | null) => void;
  clearSelection: () => void;
}

const AgencyContext = createContext<AgencyContextType | undefined>(undefined);

export function AgencyProvider({ children }: { children: ReactNode }) {
  const [selectedAgencyId, setSelectedAgencyId] = useState<number | null>(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem("selectedAgencyId");
    return saved ? parseInt(saved, 10) : null;
  });

  const handleSetSelectedAgencyId = (id: number | null) => {
    setSelectedAgencyId(id);
    if (id) {
      localStorage.setItem("selectedAgencyId", id.toString());
    } else {
      localStorage.removeItem("selectedAgencyId");
    }
  };

  const clearSelection = () => {
    setSelectedAgencyId(null);
    localStorage.removeItem("selectedAgencyId");
  };

  return (
    <AgencyContext.Provider
      value={{
        selectedAgencyId,
        setSelectedAgencyId: handleSetSelectedAgencyId,
        clearSelection,
      }}
    >
      {children}
    </AgencyContext.Provider>
  );
}

export function useAgency() {
  const context = useContext(AgencyContext);
  if (context === undefined) {
    throw new Error("useAgency must be used within an AgencyProvider");
  }
  return context;
}










