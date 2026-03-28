import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'

interface BranchContextValue {
  selectedBranch: string | null
  setSelectedBranch: (branch: string | null) => void
}

const BranchContext = createContext<BranchContextValue>({
  selectedBranch: null,
  setSelectedBranch: () => {},
})

export function BranchProvider({ children }: { children: ReactNode }) {
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)

  const value = useMemo(
    () => ({ selectedBranch, setSelectedBranch }),
    [selectedBranch],
  )

  return (
    <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
  )
}

export function useBranch() {
  return useContext(BranchContext)
}