"use client";

import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod"
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useWallet } from "@solana/wallet-adapter-react";
import { buildTx, getTransactionLink } from "@/lib/solana-helpers";
import { getRepayIx, ParsedBank, ParsedProgramAccount } from "@/lib/program";
import { PublicKey } from "@solana/web3.js";
import { serializeAndSendVersionedTx } from "@/lib/api";
import { useBank } from "../providers/BankProvider";
import { useUser } from "../providers/UserProvider";
import { usePyth } from "../providers/PythProvider";

export function RepayForm({
  maxAmount,
  mintA,
  mintB,
  tokenProgramA,
  tokenProgramB,
  setIsOpen,
}: {
  bank: ParsedProgramAccount<ParsedBank>,
  maxAmount: number,
  mintA: PublicKey,
  mintB: PublicKey,
  tokenProgramA: PublicKey,
  tokenProgramB: PublicKey,
  setIsOpen: (open: boolean) => void;
}) {
  const { publicKey, signTransaction } = useWallet();
  const { mutate: mutateBank } = useBank();
  const { user, mutate: mutateUser } = useUser();
  const { mutate: mutatePrices } = usePyth();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  function setMaxAmount() {
    form.setValue("amount", maxAmount);
  }

  const formSchema = z.object({
    amount: z
      .number()
      .min(1)
      .max(maxAmount)
  })

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 0,
    }
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    toast.promise(
      async () => {
        if (!publicKey || !signTransaction) {
          throw new Error('Wallet not connected.');
        }

        setIsSubmitting(true);

        let tx = await buildTx(
          [await getRepayIx({
            amount: values.amount,
            authority: publicKey,
            repayMint: mintA,
            collateralMint: mintB,
            tokenProgramA,
            tokenProgramB,
          })],
          publicKey,
        )

        tx = await signTransaction(tx);

        return await serializeAndSendVersionedTx(tx);
      },
      {
        loading: "Repaying...",
        success: (signature) => {
          mutateBank();
          mutateUser();
          mutatePrices();
          form.reset();
          setIsSubmitting(false);
          setIsOpen(false);

          return {
            message: "Repay successful!",
            description: getTransactionLink(signature),
          }
        },
        error: (err) => {
          console.error(err);
          setIsSubmitting(false);
          return err.message;
        },
      }
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel asChild>
                <div className="flex justify-between items-center gap-4">
                  <p>Amount to repay</p>
                  <Button type="button" variant="outline" size={"sm"} onClick={setMaxAmount}>
                    <p>Max: {maxAmount}</p>
                  </Button>
                </div>
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...field}
                  min={0}
                  max={maxAmount}
                  step={1}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    field.onChange(isNaN(value) ? 0 : value);
                  }} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting || !user}>
          {!user
            ? "User account required"
            : isSubmitting ? (
              <Loader2 className="animate-spin" />
            ) : (
              "Repay"
            )}
        </Button>
      </form>
    </Form>
  )
}