# Loading Components

Reusable loading state components for consistent UI across the application.

## Components

### `LoadingSpinner`
Inline loading spinner with optional text.

```tsx
import { LoadingSpinner } from "@/components/loading";

<LoadingSpinner size="md" text="Chargement..." />
```

**Props:**
- `size?: "sm" | "md" | "lg"` - Size of the spinner
- `className?: string` - Additional CSS classes
- `text?: string` - Optional text to display next to spinner

### `StatCardSkeleton`
Skeleton loader for stat cards.

```tsx
import { StatCardSkeleton } from "@/components/loading";

<div className="grid grid-cols-4 gap-4">
  <StatCardSkeleton count={4} />
</div>
```

**Props:**
- `count?: number` - Number of skeleton cards to render (default: 1)
- `className?: string` - Additional CSS classes

### `TableRowSkeleton`
Generic skeleton for table rows.

```tsx
import { TableRowSkeleton } from "@/components/loading";

<TableBody>
  <TableRowSkeleton columns={5} rows={3} />
</TableBody>
```

**Props:**
- `columns: number` - Number of columns
- `rows?: number` - Number of rows to render (default: 1)
- `className?: string` - Additional CSS classes

### `DeliveryTableSkeleton`
Specialized skeleton for delivery table rows (matches delivery table structure).

```tsx
import { DeliveryTableSkeleton } from "@/components/loading";

<TableBody>
  {isLoading ? (
    <DeliveryTableSkeleton rows={5} />
  ) : (
    // Actual table rows
  )}
</TableBody>
```

**Props:**
- `rows?: number` - Number of rows to render (default: 5)

### `LoadingOverlay`
Overlay that shows a spinner over existing content.

```tsx
import { LoadingOverlay } from "@/components/loading";

<LoadingOverlay isLoading={isLoading} text="Chargement...">
  <YourContent />
</LoadingOverlay>
```

**Props:**
- `isLoading: boolean` - Whether to show the overlay
- `text?: string` - Optional text to display
- `className?: string` - Additional CSS classes
- `children?: React.ReactNode` - Content to overlay

### `PageSkeleton`
Full page skeleton loader.

```tsx
import { PageSkeleton } from "@/components/loading";

{isLoading ? (
  <PageSkeleton showHeader showStats statsCount={8} />
) : (
  // Actual page content
)}
```

**Props:**
- `showHeader?: boolean` - Show header skeleton (default: true)
- `showStats?: boolean` - Show stats cards skeleton (default: false)
- `statsCount?: number` - Number of stat cards (default: 4)
- `showContent?: boolean` - Show content area skeleton (default: true)
- `className?: string` - Additional CSS classes

## Usage Examples

### In a Page Component

```tsx
import { useDeliveries } from "@/hooks/useDeliveries";
import { PageSkeleton } from "@/components/loading";
import { ErrorDisplay } from "@/components/errors/ErrorDisplay";

function MyPage() {
  const { data, isLoading, isError, error } = useDeliveries();

  if (isLoading) {
    return <PageSkeleton showHeader showStats />;
  }

  if (isError) {
    return <ErrorDisplay error={error} onRetry={() => refetch()} />;
  }

  return (
    // Your content
  );
}
```

### In a Table

```tsx
import { DeliveryTableSkeleton } from "@/components/loading";

<TableBody>
  {isLoading ? (
    <DeliveryTableSkeleton rows={10} />
  ) : (
    deliveries.map(delivery => (
      <TableRow key={delivery.id}>
        {/* Table cells */}
      </TableRow>
    ))
  )}
</TableBody>
```

### Inline Loading

```tsx
import { LoadingSpinner } from "@/components/loading";

<Button disabled={isLoading}>
  {isLoading ? (
    <LoadingSpinner size="sm" />
  ) : (
    "Submit"
  )}
</Button>
```
















