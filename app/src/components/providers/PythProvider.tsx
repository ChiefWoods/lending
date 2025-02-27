"use client";

import { SOL_USD_FEED_ID, USDC_USD_FEED_ID } from "@/lib/constants";
import { HermesClient } from "@pythnetwork/hermes-client";
import { Price } from "@pythnetwork/price-service-sdk";
import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import useSWR from "swr";
import useSWRSubscription from "swr/subscription";

interface PriceData {
  solPrice: number | null;
  usdcPrice: number | null;
}

interface PythContextType extends PriceData {
  dynamicSolPrice: number | null;
  dynamicUsdcPrice: number | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

const PythPriceContext = createContext<PythContextType>({} as PythContextType);

export function usePyth() {
  const context = useContext(PythPriceContext);

  if (!context) {
    throw new Error("usePyth must be used within a PythPriceProvider");
  }

  return context;
}

function derivePrice(price: Price): number {
  return parseInt(price.price) * Math.pow(10, price.expo);
}

const PYTH_KEY = "/api/prices";

export function PythProvider({ children }: { children: ReactNode }) {
  const [dynamicSolPrice, setDynamicSolPrice] = useState<number | null>(null);
  const [dynamicUsdcPrice, setDynamicUsdcPrice] = useState<number | null>(null);
  const hermesClient = useMemo(() => {
    return new HermesClient(process.env.NEXT_PUBLIC_HERMES_RPC_URL ?? "https://hermes.pyth.network");
  }, []);

  const priceIds = useMemo(() => {
    return [SOL_USD_FEED_ID, USDC_USD_FEED_ID];
  }, []);

  const { data: prices, error, isLoading, mutate } = useSWR(
    PYTH_KEY,
    async () => {
      const priceUpdates = await hermesClient.getLatestPriceUpdates(priceIds);

      if (!priceUpdates.parsed) {
        throw new Error("Unable to fetch latest price updates");
      }

      const [solParsedPrice, usdcParsedPrice] = priceUpdates.parsed.map(
        data => Price.fromJson(data.price)
      );

      const derivedSolPrice = derivePrice(solParsedPrice);
      const derivedUsdcPrice = derivePrice(usdcParsedPrice);

      setDynamicSolPrice(derivedSolPrice);
      setDynamicUsdcPrice(derivedUsdcPrice);

      return {
        solPrice: derivePrice(solParsedPrice),
        usdcPrice: derivePrice(usdcParsedPrice),
      };
    }
  );

  function refetchPrices() {
    if (dynamicSolPrice && dynamicUsdcPrice) {
      mutate({
        solPrice: dynamicSolPrice,
        usdcPrice: dynamicUsdcPrice,
      })
    }
  }

  useSWRSubscription(PYTH_KEY, (key, { next }) => {
    let eventSource: EventSource | null;

    (async () => {
      eventSource = await hermesClient.getPriceUpdatesStream(priceIds);

      eventSource.onmessage = (event) => {
        // @ts-expect-error: data is Price in JSON form
        const [solParsedPrice, usdcParsedPrice]: Price[] = JSON.parse(event.data).parsed.map(data => Price.fromJson(data.price));

        setDynamicSolPrice(derivePrice(solParsedPrice));
        setDynamicUsdcPrice(derivePrice(usdcParsedPrice));
      };

      eventSource.onerror = () => {
        next(new Error("Unable to fetch latest price updates."));
      };
    })();

    return () => eventSource?.close();
  });

  return (
    <PythPriceContext.Provider
      value={{
        solPrice: prices?.solPrice ?? null,
        usdcPrice: prices?.usdcPrice ?? null,
        dynamicSolPrice,
        dynamicUsdcPrice,
        isLoading,
        error,
        mutate: refetchPrices,
      }}
    >
      {children}
    </PythPriceContext.Provider>
  );
}