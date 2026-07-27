'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDownToLine, ArrowUpFromLine, History, AlertTriangle } from 'lucide-react';
import type { Installation } from '@/lib/types';
import { formatDateCL } from '@/lib/format';

const ACTIVE_PLAN_RETIRE_NOTE_TAG = 'RECLAMO_PLAN_ACTIVO';

interface InstallationsHistoryProps {
  items: Installation[];
  loading: boolean;
}

export function InstallationsHistory({ items, loading }: InstallationsHistoryProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" />
          Movimientos recientes
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-6 pb-6 text-center text-sm text-muted-foreground">
            Aún no hay movimientos registrados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>SIM</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Ubicación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateCL(it.installed_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {it.sim_number}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          it.action === 'instalar'
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {it.action === 'instalar' ? (
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpFromLine className="h-3.5 w-3.5" />
                        )}
                        {it.action === 'instalar' ? 'Instalación' : 'Retiro'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {it.location_name || '—'}
                      {it.location_detail && (
                        <span className="text-muted-foreground">
                          {' · '}
                          {it.location_detail}
                        </span>
                      )}
                      {it.action === 'retirar' && it.notes?.includes(ACTIVE_PLAN_RETIRE_NOTE_TAG) && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning-foreground">
                          <AlertTriangle className="h-3 w-3" />
                          Reclamo
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


