"use client";

import Link from "next/link";
import { WalletMultiButtonDynamic } from "./providers/SolanaProvider";
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, navigationMenuTriggerStyle } from "./ui/navigation-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { User2 } from "lucide-react";
import { InitUserForm } from "./forms/InitUserForm";
import { Button } from "./ui/button";
import { useUser } from "./providers/UserProvider";
import { truncateAddress, truncateNumber } from "@/lib/utils";
import { useState } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const links = [
  {
    href: "/",
    label: "Home"
  },
]

export function Header() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { user, isLoading, error } = useUser();
  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);

  function handleOpen(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!publicKey) {
      setVisible(true);
    } else {
      setIsPopoverOpen(!isPopoverOpen);
    }
  }

  return (
    <header className="flex items-center justify-between px-8 py-4 gap-4">
      <NavigationMenu>
        <NavigationMenuList className="flex gap-8">
          {links.map(link => {
            return (
              <NavigationMenuItem key={link.href}>
                <Link href={link.href} legacyBehavior passHref>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    {link.label}
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
            )
          })}
        </NavigationMenuList>
      </NavigationMenu>
      <div className="flex items-center gap-4">
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant={"outline"} size={"icon"} onClick={(e) => handleOpen(e as unknown as MouseEvent)}>
              <User2 />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            {isLoading ? (
              <p>Loading ...</p>
            ) : error ? (
              <p>Error: {error.message}</p>
            ) : user ? (
              (<section>
                <p>{truncateAddress(user.publicKey)}</p>
                <p>Health Factor: {truncateNumber(user.healthFactor)}</p>
                <p>Deposited SOL: {user.depositedSol / LAMPORTS_PER_SOL} SOL</p>
                <p>Borrowed SOL: {user.borrowedSol / LAMPORTS_PER_SOL} SOL</p>
                <p>Deposited USDC: {user.depositedUsdc / 10 ** 6} USDC</p>
                <p>Borrowed USDC: {user.borrowedUsdc / 10 ** 6} USDC</p>
              </section>)
            ) : (
              <InitUserForm />
            )}
          </PopoverContent>
        </Popover>
        <WalletMultiButtonDynamic />
      </div>
    </header>
  )
}