import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncateAddress(address: string, chars = 4) {
  return `${address.slice(0, chars)}....${address.slice(-chars)}`
}

export function truncateNumber(num: number, decimals = 2) {
  return num.toFixed(decimals)
}

export function convertFromBpsToPct(bps: number): string {
  return bps / 100 + "%";
}
