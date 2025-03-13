"use client";

import { fetchAllUsers, fetchUser } from "@/lib/accounts";
import { ParsedProgramAccount, ParsedUser } from "@/lib/program";
import { useWallet } from "@solana/wallet-adapter-react";
import { createContext, ReactNode, useContext } from "react";
import useSWR, { KeyedMutator } from "swr";
import useSWRMutation, { TriggerWithoutArgs } from 'swr/mutation'

interface UserContextType {
  user: ParsedProgramAccount<ParsedUser> | undefined;
  allUsers: ParsedProgramAccount<ParsedUser>[] | undefined;
  isLoading: boolean;
  error: Error | undefined;
  trigger: TriggerWithoutArgs;
  mutate: KeyedMutator<ParsedProgramAccount<ParsedUser>>
}

const UserContext = createContext<UserContextType>({} as UserContextType);

export function useUser() {
  return useContext(UserContext);
}

export function UserProvider({
  children,
}: {
  children: ReactNode,
}) {
  const { publicKey } = useWallet();
  const { data: allUsers, error: allUsersError, trigger } = useSWRMutation("/api/accounts/users", async () => {
    return await fetchAllUsers();
  });

  const { data: user, isLoading: userLoading, error: userError, mutate } = useSWR(
    publicKey ? { url: "/api/accounts/users", publicKey } : null,
    async ({ publicKey }) => {
      return await fetchUser(publicKey.toBase58());
    }
  );

  return (
    <UserContext.Provider
      value={{
        user,
        allUsers,
        isLoading: userLoading,
        error: allUsersError || userError,
        trigger,
        mutate,
      }}
    >
      {children}
    </UserContext.Provider >
  )
}