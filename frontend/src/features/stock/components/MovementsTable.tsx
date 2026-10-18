import { Link } from 'react-router'

import { MovementTypeBadge } from '@/components/common/badges'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatNumber, formatRelativeDateTime, formatSignedQuantity } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StockMovement } from '@/types/models'

export function MovementsTable({ movements, loading }: { movements: StockMovement[]; loading: boolean }) {
  return (
    <Table className="min-w-[920px]">
      <TableHeader>
        <TableRow>
          <TableHead className="px-4">Date</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Quantity</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead>Note / reference</TableHead>
          <TableHead className="px-4">By</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading
          ? Array.from({ length: 10 }, (_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={7}>
                  <Skeleton className="h-4" />
                </TableCell>
              </TableRow>
            ))
          : movements.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="h-[52px] px-4 whitespace-nowrap text-subtle-foreground">{formatRelativeDateTime(m.created_at)}</TableCell>
                <TableCell>
                  <Link to={`/products/${m.product_id}`} className="block font-medium text-foreground hover:text-primary-soft-foreground">
                    {m.product_name}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">{m.product_sku}</span>
                </TableCell>
                <TableCell>
                  <MovementTypeBadge type={m.type} />
                </TableCell>
                <TableCell className={cn('text-right font-semibold', m.quantity > 0 ? 'text-success' : 'text-foreground')}>
                  {formatSignedQuantity(m.quantity)}
                </TableCell>
                <TableCell className="text-right text-subtle-foreground">{formatNumber(m.balance_after)}</TableCell>
                <TableCell className="max-w-[280px] text-[13px] text-subtle-foreground">
                  {m.invoice_id && m.invoice_number && (
                    <Link to={`/invoices/${m.invoice_id}`} className="mr-1.5 font-mono text-primary-soft-foreground hover:text-primary">
                      {m.invoice_number}
                    </Link>
                  )}
                  {m.note}
                </TableCell>
                <TableCell className="px-4 whitespace-nowrap text-subtle-foreground">{m.user_name}</TableCell>
              </TableRow>
            ))}
      </TableBody>
    </Table>
  )
}
