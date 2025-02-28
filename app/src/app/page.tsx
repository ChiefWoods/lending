"use client";

import { BankInfo } from "@/components/BankInfo";
import { BorrowForm } from "@/components/forms/BorrowForm";
import { DepositForm } from "@/components/forms/DepositForm";
import { RepayForm } from "@/components/forms/RepayForm";
import { WithdrawForm } from "@/components/forms/WithdrawForm";
import { useBank } from "@/components/providers/BankProvider";
import { usePyth } from "@/components/providers/PythProvider";
import { useUser } from "@/components/providers/UserProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MAX_BASIS_POINTS, USDC_MINT } from "@/lib/constants";
import { ParsedBank, ParsedProgramAccount } from "@/lib/program";
import { convertFromBpsToPct, truncateAddress, truncateNumber } from "@/lib/utils";
import { getTokenAccountBalance } from "@/lib/api";
import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import Image from "next/image";
import { MouseEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

function getMintImg(mint: string): string {
  switch (mint) {
    case USDC_MINT.toBase58():
      return "/usdc.png";
    case NATIVE_MINT.toBase58():
      return "/wrapped_sol.png";
    default:
      return "";
  }
}

function getMintName(mint: string): string {
  switch (mint) {
    case USDC_MINT.toBase58():
      return "USDC";
    case NATIVE_MINT.toBase58():
      return "Wrapped SOL";
    default:
      return "";
  }
}

export default function Page() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { solPrice, usdcPrice } = usePyth();
  const { allBanks, isLoading: bankLoading, error: bankError } = useBank();
  const { user, isLoading: userLoading, error: userError } = useUser();
  const [selectedBank, setSelectedBank] = useState<ParsedProgramAccount<ParsedBank> | null>(null);
  const [isBankDialogOpen, setIsBankDialogOpen] = useState<boolean>(false);
  const { data: ataBal, isLoading: tokenBalLoading, error: tokenBalError } = useSWR(
    publicKey && selectedBank ? { publicKey, selectedBank } : null,
    async ({ publicKey, selectedBank }) => {
      const ataPubkey = getAssociatedTokenAddressSync(
        new PublicKey(selectedBank.mint),
        publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      return await getTokenAccountBalance(ataPubkey);
    }
  )

  const { data: maxAmount } = useSWR(
    ataBal && selectedBank && user && solPrice && usdcPrice ? { ataBal, selectedBank, user, solPrice, usdcPrice } : null,
    ({ ataBal, selectedBank, user, solPrice, usdcPrice }) => {
      const isUsdcMint = selectedBank.mint === USDC_MINT.toBase58();

      const deposit = Number(ataBal.amount);
      const withdraw = isUsdcMint
        ? user.depositedUsdc
        : user.depositedSol;
      const borrow = isUsdcMint
        ? (user.depositedSol / LAMPORTS_PER_SOL) * solPrice * (selectedBank.maxLtv / MAX_BASIS_POINTS) / usdcPrice * (10 ** 6)
        : (user.depositedUsdc / (10 ** 6)) * usdcPrice * (selectedBank.maxLtv / MAX_BASIS_POINTS) / solPrice * LAMPORTS_PER_SOL;
      const repay = isUsdcMint
        ? user.borrowedUsdc
        : user.borrowedSol;

      return {
        deposit,
        withdraw,
        borrow,
        repay,
        decimals: ataBal.decimals,
      }
    }
  );

  function convertAtomicToUsd(amount: number, mint: string): string {
    if (!usdcPrice || !solPrice) return "";

    switch (mint) {
      case USDC_MINT.toBase58():
        return "$" + truncateNumber(amount / (10 ** 6) * usdcPrice);
      case NATIVE_MINT.toBase58():
        return "$" + truncateNumber(amount / (LAMPORTS_PER_SOL) * solPrice);
      default:
        return "";
    }
  }

  function getTVL(amount: number, mint: string): string | null {
    if (!solPrice || !usdcPrice) return null;

    switch (mint) {
      case USDC_MINT.toBase58():
        return "$" + truncateNumber(amount / (10 ** 6) * usdcPrice);
      case NATIVE_MINT.toBase58():
        return "$" + truncateNumber(amount / (LAMPORTS_PER_SOL) * solPrice);
      default:
        return null;
    }
  }

  function handleOpen(e: MouseEvent, bank: ParsedProgramAccount<ParsedBank>) {
    e.preventDefault();
    e.stopPropagation();
    if (!publicKey) {
      setVisible(true);
    } else if (!user) {
      toast.info("Create a user account to start taking actions.");
    } else {
      setSelectedBank(bank);
      setIsBankDialogOpen(true);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setSelectedBank(null);
    }
  }

  useEffect(() => {
    if (tokenBalError) {
      toast.error(tokenBalError.message)
    }
  }, [tokenBalError])

  if (bankError) return <p>Error: {bankError.message}</p>

  if (allBanks && !allBanks.length) {
    return <p>No banks created.</p>
  };

  return (
    <section className="px-8 flex flex-wrap gap-4">
      {bankLoading && <p>Loading...</p>}
      {allBanks && !allBanks.length && <p>No banks created.</p>}
      {allBanks && allBanks.map(bank => {
        return (
          <Card key={bank.publicKey} onClick={(e) => handleOpen(e, bank)} className="cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-2">
              <Image
                src={getMintImg(bank.mint)}
                alt={getMintName(bank.mint)}
                width={20}
                height={20}
                className="rounded-full"
              />
              <CardTitle>{getMintName(bank.mint)}</CardTitle>
            </CardHeader>
            <CardContent>
              <BankInfo
                text="Total Deposits"
                value={convertAtomicToUsd(bank.totalDeposits, bank.mint)}
              />
              <BankInfo
                text="Total Deposit Shares"
                value={bank.totalDepositShares}
              />
              <BankInfo
                text="Total Borrowed"
                value={convertAtomicToUsd(bank.totalBorrowed, bank.mint)}
              />
              <BankInfo
                text="Total Borrowed Shares"
                value={bank.totalBorrowedShares}
              />
              <BankInfo
                text="Liquidation Threshold"
                value={convertFromBpsToPct(bank.liquidationThreshold)}
              />
              <BankInfo
                text="Liquidation Bonus"
                value={convertFromBpsToPct(bank.liquidationBonus)}
              />
              <BankInfo
                text="Liquidation Close Factor"
                value={convertFromBpsToPct(bank.liquidationCloseFactor)}
              />
              <BankInfo
                text="Max LTV"
                value={convertFromBpsToPct(bank.maxLtv)}
              />
              <BankInfo
                text="Min Health Factor"
                value={bank.minHealthFactor.toFixed(2)}
              />
              <BankInfo
                text="Interest Rate"
                value={convertFromBpsToPct(bank.interestRate)}
              />
              <BankInfo
                text="Bank Authority"
                value={truncateAddress(bank.authority)}
              />
              <BankInfo
                text="TVL"
                value={getTVL(bank.totalDeposits, bank.mint)}
              />
            </CardContent>
          </Card>
        )
      })}
      {selectedBank && (
        <Dialog key={selectedBank.publicKey} open={isBankDialogOpen} onOpenChange={handleOpenChange}>
          <DialogTitle className="sr-only">Bank Dialog</DialogTitle>
          <DialogContent>
            {userLoading || tokenBalLoading ? (
              <p>Loading...</p>
            ) : userError || tokenBalError ? (
              <p>Error: {userError?.message ?? tokenBalError.message}</p>
            ) : (
              <Tabs defaultValue="deposit" className="flex flex-col gap-4">
                <TabsList className="w-full">
                  <TabsTrigger value="deposit" className="w-full">Deposit</TabsTrigger>
                  <TabsTrigger value="withdraw" className="w-full">Withdraw</TabsTrigger>
                  <TabsTrigger value="borrow" className="w-full">Borrow</TabsTrigger>
                  <TabsTrigger value="repay" className="w-full">Repay</TabsTrigger>
                </TabsList>
                {maxAmount && (
                  <>
                    <TabsContent value="deposit">
                      <DepositForm
                        bank={selectedBank}
                        maxAmount={maxAmount.deposit}
                        mintA={new PublicKey(selectedBank.mint)}
                        mintB={selectedBank.mint === USDC_MINT.toBase58() ? NATIVE_MINT : USDC_MINT}
                        tokenProgramA={TOKEN_PROGRAM_ID}
                        tokenProgramB={TOKEN_PROGRAM_ID}
                        setIsOpen={setIsBankDialogOpen}
                      />
                    </TabsContent>
                    <TabsContent value="withdraw">
                      <WithdrawForm
                        bank={selectedBank}
                        maxAmount={maxAmount.withdraw}
                        mintA={new PublicKey(selectedBank.mint)}
                        mintB={selectedBank.mint === USDC_MINT.toBase58() ? NATIVE_MINT : USDC_MINT}
                        tokenProgramA={TOKEN_PROGRAM_ID}
                        tokenProgramB={TOKEN_PROGRAM_ID}
                        setIsOpen={setIsBankDialogOpen}
                      />
                    </TabsContent>
                    <TabsContent value="borrow">
                      <BorrowForm
                        bank={selectedBank}
                        maxAmount={maxAmount.borrow}
                        mintA={new PublicKey(selectedBank.mint)}
                        mintB={selectedBank.mint === USDC_MINT.toBase58() ? NATIVE_MINT : USDC_MINT}
                        tokenProgramA={TOKEN_PROGRAM_ID}
                        tokenProgramB={TOKEN_PROGRAM_ID}
                        setIsOpen={setIsBankDialogOpen}
                      />
                    </TabsContent>
                    <TabsContent value="repay">
                      <RepayForm
                        bank={selectedBank}
                        maxAmount={maxAmount.repay}
                        mintA={new PublicKey(selectedBank.mint)}
                        mintB={selectedBank.mint === USDC_MINT.toBase58() ? NATIVE_MINT : USDC_MINT}
                        tokenProgramA={TOKEN_PROGRAM_ID}
                        tokenProgramB={TOKEN_PROGRAM_ID}
                        setIsOpen={setIsBankDialogOpen}
                      />
                    </TabsContent>
                  </>
                )}
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
