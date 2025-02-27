import { Skeleton } from "./ui/skeleton";

export function BankInfo({
  text,
  value,
}: {
  text: string,
  value: string | number | null,
}) {
  return (
    <div className="flex gap-8 justify-between items-center">
      <p>{text}</p>
      {value !== null ? (
        <p>{value}</p>
      ) : (
        <Skeleton className="w-[50px] h-[16px]" />
      )}
    </div>
  )
}