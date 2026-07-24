'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { SimStatusBadge } from '@/components/sim-status-badge';
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Sim, SimStatus } from '@/lib/types';
import { formatDateOnlyCL } from '@/lib/format';

interface InventoryTableProps {
  sims: Sim[];
  loading: boolean;
}

const PAGE_SIZE = 10;

export function InventoryTable({ sims, loading }: InventoryTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | SimStatus | 'review'>('todos');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    return sims.filter((s) => {
      const matchesSearch =
        !search ||
        s.sim_number.toLowerCase().includes(search.toLowerCase()) ||
        (s.plan || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.imei || '').toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === 'todos'
          ? true
          : statusFilter === 'review'
            ? s.needs_review
            : s.status === statusFilter && !s.needs_review;
      return matchesSearch && matchesStatus;
    });
  }, [sims, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  function resetPage() {
    setPage(0);
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              placeholder="Buscar por SIM, plan o IMEI…"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as typeof statusFilter);
                resetPage();
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="libre">Libres</SelectItem>
                <SelectItem value="instalada">Instaladas</SelectItem>
                <SelectItem value="review">Pendiente revisión</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : paged.length === 0 ? (
          <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            No hay SIMs que coincidan con la búsqueda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número SIM</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden sm:table-cell">IMEI</TableHead>
                  <TableHead className="hidden md:table-cell">Actualizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">
                      {s.sim_number}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.plan || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <SimStatusBadge
                        status={s.status}
                        needsReview={s.needs_review}
                      />
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">
                      {s.imei || '—'}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {formatDateOnlyCL(s.updated_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Página {currentPage + 1} de {pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={currentPage >= pageCount - 1}
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
