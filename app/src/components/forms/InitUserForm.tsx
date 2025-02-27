"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "../ui/button";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getInitUserIx } from "@/lib/program";
import { USDC_MINT } from "@/lib/constants";
import { buildTx, getTransactionLink } from "@/lib/solana-helpers";
import { serializeAndSendVersionedTx } from "@/lib/api";
import { Form } from "../ui/form";
import { useForm } from "react-hook-form";
import { useUser } from "../providers/UserProvider";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function InitUserForm() {
  const { publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const { mutate: mutateUser } = useUser();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const form = useForm();

  function onSubmit() {
    if (!publicKey) {
      setVisible(true);
    } else {
      toast.promise(
        async () => {
          if (!publicKey || !signTransaction) {
            throw new Error('Wallet not connected.');
          }

          setIsSubmitting(true);

          let tx = await buildTx(
            [await getInitUserIx({
              usdcMint: USDC_MINT,
              authority: publicKey,
            })],
            publicKey,
          );

          tx = await signTransaction(tx);

          return await serializeAndSendVersionedTx(tx);
        },
        {
          loading: "Creating user account...",
          success: (signature) => {
            mutateUser();
            setIsSubmitting(false);

            return {
              message: "Account created!",
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
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col items-center gap-4">
        <h2>Create a user account to start taking actions.</h2>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="animate-spin" />
          ) : (
            "Create"
          )}
        </Button>
      </form>
    </Form>
  )
} 