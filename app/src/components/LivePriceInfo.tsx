import { truncateNumber } from "@/lib/utils";
import { Skeleton } from "./ui/skeleton";

export function LivePriceInfo({
  currency,
  value,
}: {
  currency: string,
  value: number | null,
}) {
  return (
    <div className="flex gap-4 items-center">
      <p>{currency} :</p>
      {value ? (
        <p className="font-bold">{truncateNumber(value, 4)}</p>
      ) : (
        <Skeleton className="w-[75px] h-[16px]" />
      )}
    </div>
  )
}