"use client";

import { getUserPda } from "@/lib/pda";
import { ParsedProgramAccount, ParsedUser } from "@/lib/program";
import { useWallet } from "@solana/wallet-adapter-react";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import useSWR, { KeyedMutator } from "swr";

interface UserContextType {
  user: ParsedProgramAccount<ParsedUser> | null;
  allUsers: ParsedProgramAccount<ParsedUser>[] | undefined;
  isLoading: boolean;
  error: Error | undefined;
  mutate: KeyedMutator<ParsedProgramAccount<ParsedUser>[]>
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
  const [user, setUser] = useState<ParsedProgramAccount<ParsedUser> | null>(null);

  async function fetchAllUsers() {
    const res = await fetch("/api/accounts/users");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    return data.users as ParsedProgramAccount<ParsedUser>[];
  }

  const { data: allUsers, isLoading, error, mutate } = useSWR("/api/accounts/users", async () => {
    const allUsers = await fetchAllUsers();
    return allUsers;
  });

  useEffect(() => {
    if (publicKey && allUsers) {
      const userPda = getUserPda(publicKey);
      const user = allUsers?.find(u => u.publicKey === userPda.toBase58());

      setUser(user ?? null)
    }
  }, [publicKey, allUsers])

  return (
    <UserContext.Provider
      value={{
        user,
        allUsers,
        isLoading,
        error,
        mutate,
      }}
    >
      {children}
    </UserContext.Provider >
  )
}