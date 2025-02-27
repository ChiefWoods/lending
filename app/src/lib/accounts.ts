"use client";

import { ParsedBank, ParsedProgramAccount, ParsedUser } from "./program";

export async function fetchAllBanks() {
  const res = await fetch("/api/accounts/banks");
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error);
  }

  return data.banks as ParsedProgramAccount<ParsedBank>[];
}

export async function fetchBank(publicKey: string) {
  const res = await fetch(`/api/accounts/banks?pda=${publicKey}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error);
  }

  return data.bank as ParsedProgramAccount<ParsedBank>;
}

export async function fetchAllUsers() {
  const res = await fetch("/api/accounts/users");
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error);
  }

  return data.users as ParsedProgramAccount<ParsedUser>[];
}

export async function fetchUser(publicKey: string) {
  const res = await fetch(`/api/accounts/users?pda=${publicKey}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error);
  }

  return data.user as ParsedProgramAccount<ParsedUser>;
}
