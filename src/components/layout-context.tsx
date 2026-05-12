import { createContext, useContext, useState, ReactNode } from "react";

type Ctx = { mobileOpen: boolean; setMobileOpen: (v: boolean) => void };
const LayoutCtx = createContext<Ctx>({ mobileOpen: false, setMobileOpen: () => {} });

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <LayoutCtx.Provider value={{ mobileOpen, setMobileOpen }}>{children}</LayoutCtx.Provider>;
}

export const useLayout = () => useContext(LayoutCtx);
