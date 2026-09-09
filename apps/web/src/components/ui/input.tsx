import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-12 w-full min-w-0 rounded-card bg-surface-inset px-4 text-ui text-content-primary ' +
          'ring-1 ring-hairline transition-colors duration-150 ease outline-none ' +
          'placeholder:text-content-tertiary ' +
          'focus-visible:ring-2 focus-visible:ring-ring ' +
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 ' +
          'aria-invalid:ring-2 aria-invalid:ring-destructive',
        className
      )}
      {...props}
    />
  )
}

export { Input }
