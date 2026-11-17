import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Alto máximo del contenedor cuando la cabecera va inmovilizada. Deja ver el
 * encabezado de la página, la barra de filtros y la paginación; el cuerpo de
 * la tabla scrollea por dentro.
 */
const STICKY_MAX_HEIGHT = "max-h-[calc(100vh-20rem)]"

type TableProps = React.ComponentProps<"table"> & {
  /**
   * Inmoviliza la fila de encabezados: la tabla scrollea por dentro y los
   * títulos de columna quedan siempre a la vista. Para listados largos
   * (reportes, órdenes, presupuestos).
   */
  stickyHeader?: boolean
}

function Table({ className, stickyHeader, ...props }: TableProps) {
  return (
    <div
      data-slot="table-container"
      data-sticky-header={stickyHeader ? "" : undefined}
      className={cn(
        "relative w-full overflow-x-auto",
        stickyHeader && `overflow-y-auto ${STICKY_MAX_HEIGHT}`,
      )}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_tr]:border-b [&_tr]:bg-brand-blue-soft [&_tr:hover]:bg-brand-blue-soft",
        // Con `stickyHeader` la cabecera flota sobre el cuerpo al scrollear.
        "[[data-sticky-header]_&]:sticky [[data-sticky-header]_&]:top-0 [[data-sticky-header]_&]:z-10 [[data-sticky-header]_&]:shadow-[0_1px_0_0_var(--border)]",
        className,
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("bg-muted/50 border-t font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors", className)}
      {...props}
    />
  )
}

type TableHeadProps = React.ComponentProps<"th"> & {
  /** Deja que el título se parta en varias líneas (columnas angostas). */
  wrap?: boolean
}

function TableHead({ className, wrap, ...props }: TableHeadProps) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-muted-foreground h-10 px-4 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.06em] [&:has([role=checkbox])]:pr-0",
        wrap ? "whitespace-normal" : "whitespace-nowrap",
        className,
      )}
      {...props}
    />
  )
}

type TableCellProps = React.ComponentProps<"td"> & {
  /**
   * Celda de texto largo: en vez de cortar con "…", el contenido se reparte en
   * varias líneas. Combinar con un `max-w-[…]` para fijar el ancho de columna.
   */
  wrap?: boolean
}

function TableCell({ className, wrap, ...props }: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-4 py-2 [&:has([role=checkbox])]:pr-0",
        wrap
          ? "whitespace-normal break-words align-top"
          : "whitespace-nowrap align-middle",
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
