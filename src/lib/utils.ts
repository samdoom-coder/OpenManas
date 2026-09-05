import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

import { newId } from './ids'

/** Entity ids are UUIDs (Postgres-compatible). Use newId() for anything persisted. */
export function uid() { return newId() }

export function formatRelative(date: string) {
  const d = new Date(date)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff/60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins/60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs/24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

export function debounce<T extends (...args: any[]) => any>(fn: T, ms = 300) {
  let timer: any
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
