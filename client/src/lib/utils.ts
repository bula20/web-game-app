// Helper do łączenia klas Tailwind. clsx obsługuje warunkowe klasy (np. tablice,
// obiekty), a twMerge usuwa konflikty (np. "px-2" + "px-4" zostaje tylko "px-4").
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
