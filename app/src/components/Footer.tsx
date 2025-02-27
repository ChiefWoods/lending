"use client";

import { LivePriceInfo } from "./LivePriceInfo";
import { usePyth } from "./providers/PythProvider";

export function Footer() {
  const { dynamicSolPrice, dynamicUsdcPrice } = usePyth();

  return (
    <footer className="bg-accent flex gap-6 justify-end px-8 py-4">
      <LivePriceInfo currency="SOL" value={dynamicSolPrice} />
      <LivePriceInfo currency="USDC" value={dynamicUsdcPrice} />
    </footer>
  )
}