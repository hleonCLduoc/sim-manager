'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Cpu, CheckCircle2, Smartphone, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Stats {
  total: number;
  instaladas: number;
  libres: number;
  pendientes: number;
}

interface ScorecardsProps {
  stats: Stats;
  loading: boolean;
}

interface CardConfig {
  label: string;
  value: number;
  hint: string;
  icon: React.ElementType;
  accent: string;
  iconBg: string;
}

export function Scorecards({ stats, loading }: ScorecardsProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setAnimated(true), 50);
      return () => clearTimeout(t);
    }
  }, [loading]);

  const cards: CardConfig[] = [
    {
      label: 'Total SIMs',
      value: stats.total,
      hint: 'SIMs contratadas en el inventario',
      icon: Cpu,
      accent: 'text-primary',
      iconBg: 'bg-primary/10',
    },
    {
      label: 'Instaladas',
      value: stats.instaladas,
      hint: 'SIMs actualmente en uso',
      icon: Smartphone,
      accent: 'text-primary',
      iconBg: 'bg-primary/10',
    },
    {
      label: 'Libres',
      value: stats.libres,
      hint: 'Disponibles para instalar',
      icon: CheckCircle2,
      accent: 'text-success',
      iconBg: 'bg-success/10',
    },
    {
      label: 'Pendientes revisión',
      value: stats.pendientes,
      hint: 'SIMs registradas fuera del inventario maestro',
      icon: AlertTriangle,
      accent: 'text-warning-foreground',
      iconBg: 'bg-warning/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.label}
            className="group relative overflow-hidden border-border/60 p-5 transition-shadow hover:shadow-md"
          >
            <div
              className={cn(
                'absolute inset-x-0 top-0 h-1 origin-left transition-transform duration-500',
                card.label === 'Libres'
                  ? 'bg-success'
                  : card.label === 'Pendientes revisión'
                    ? 'bg-warning'
                    : 'bg-primary',
                animated ? 'scale-x-100' : 'scale-x-0'
              )}
            />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </p>
                <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">
                  {loading ? (
                    <span className="inline-block h-9 w-16 animate-pulse rounded bg-muted" />
                  ) : (
                    card.value.toLocaleString('es-CL')
                  )}
                </p>
              </div>
              <div
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-xl',
                  card.iconBg
                )}
              >
                <Icon className={cn('h-5 w-5', card.accent)} />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{card.hint}</p>
          </Card>
        );
      })}
    </div>
  );
}
