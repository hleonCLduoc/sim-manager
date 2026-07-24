import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SimStatus } from '@/lib/types';

interface SimStatusBadgeProps {
  status: SimStatus;
  needsReview?: boolean;
  className?: string;
}

export function SimStatusBadge({
  status,
  needsReview = false,
  className,
}: SimStatusBadgeProps) {
  if (needsReview) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'border-warning/40 bg-warning/10 text-warning-foreground',
          className
        )}
      >
        Pendiente de Revisión
      </Badge>
    );
  }
  if (status === 'instalada') {
    return (
      <Badge
        variant="outline"
        className={cn('border-primary/30 bg-primary/10 text-primary', className)}
      >
        Instalada
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-success/30 bg-success/10 text-success',
        className
      )}
    >
      Libre
    </Badge>
  );
}
