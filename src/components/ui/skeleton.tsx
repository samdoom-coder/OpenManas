import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} {...props} />
}
export function EditorSkeleton() {
  return (
    <div className="space-y-3 p-6 max-w-[760px] mx-auto">
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <div className="space-y-2 pt-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    </div>
  )
}
export function TableSkeleton() {
  return (
    <div className="border rounded-2xl overflow-hidden">
      <div className="h-10 bg-muted animate-pulse" />
      {Array.from({length:5}).map((_,i)=> (
        <div key={i} className="h-12 border-t flex items-center gap-3 px-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}
