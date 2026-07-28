import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merges Tailwind classes and resolves conflicting utilities.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
