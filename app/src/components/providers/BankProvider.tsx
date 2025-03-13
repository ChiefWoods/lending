"use client";

import { fetchAllBanks } from "@/lib/accounts";
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
  const { data: allBanks, isLoading, error, mutate } = useSWR(
    "/api/accounts/banks",
    async () => {
      return await fetchAllBanks();
    }
  );

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