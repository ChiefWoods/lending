"use client";

import { ParsedBank, ParsedProgramAccount } from "@/lib/program";
import { createContext, ReactNode, useContext } from "react";
import useSWR, { KeyedMutator } from "swr";

interface BankContextType {
  allBanks: ParsedProgramAccount<ParsedBank>[] | undefined;
  isLoading: boolean;
  error: Error | undefined;
  mutate: KeyedMutator<ParsedProgramAccount<ParsedBank>[]>
}

const BankContext = createContext<BankContextType>({} as BankContextType);

export function useBank() {
  return useContext(BankContext);
}

export function BankProvider({
  children,
}: {
  children: ReactNode,
}) {
  async function fetchAllBanks() {
    const res = await fetch("/api/accounts/banks");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    return data.banks as ParsedProgramAccount<ParsedBank>[];
  }

  const { data: allBanks, isLoading, error, mutate } = useSWR("/api/accounts/banks", async () => {
    const allBanks = await fetchAllBanks();
    return allBanks;
  });

  return (
    <BankContext.Provider
      value={{
        allBanks,
        isLoading,
        error,
        mutate,
      }}
    >
      {children}
    </BankContext.Provider >
  )
}