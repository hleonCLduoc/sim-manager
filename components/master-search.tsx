'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SimStatusBadge } from '@/components/sim-status-badge';
import { Search, MapPin, History, Loader2, Inbox } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Installation, Sim } from '@/lib/types';
import { formatDateCL } from '@/lib/format';

interface SearchResult {
  sim: Sim;
  history: Installation[];
}

export function MasterSearch() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setSearched(true);
    try {
      const { data: sim } = await supabase
        .from('sims')
        .select('*')
        .ilike('sim_number', `%${trimmed}%`)
        .maybeSingle();

      if (!sim) {
        setResult(null);
        return;
      }

      const { data: history } = await supabase
        .from('installations')
        .select('*')
        .eq('sim_number', sim.sim_number)
        .order('installed_at', { ascending: false });

      setResult({ sim: sim as Sim, history: (history ?? []) as Installation[] });
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ingresa el número de SIM a buscar…"
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Buscando…
            </>
          ) : (
            'Buscar'
          )}
        </Button>
      </form>

      {searched && !loading && !result && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="font-medium">No se encontró la SIM</p>
            <p className="mt-1 text-sm text-muted-foreground">
              El número <span className="font-mono">{query.trim()}</span> no está
              en el inventario maestro.
            </p>
          </CardContent>
        </Card>
      )}

      {result && <SearchResultCard result={result} />}
    </div>
  );
}

function SearchResultCard({ result }: { result: SearchResult }) {
  const { sim, history } = result;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-mono">{sim.sim_number}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {sim.plan || 'Sin plan asignado'}
            </p>
          </div>
          <SimStatusBadge status={sim.status} needsReview={sim.needs_review} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <InfoItem label="Estado" value={sim.status === 'instalada' ? 'Instalada' : 'Libre'} />
          <InfoItem label="Plan" value={sim.plan || '—'} />
          <InfoItem label="IMEI" value={sim.imei || '—'} />
          <InfoItem
            label="Actualizado"
            value={formatDateCL(sim.updated_at)}
          />
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-muted-foreground" />
            Historial de ubicaciones
          </div>
          {history.length === 0 ? (
            <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
              Sin movimientos registrados.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Ubicación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateCL(h.installed_at)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            h.action === 'instalar'
                              ? 'font-medium text-primary'
                              : 'font-medium text-muted-foreground'
                          }
                        >
                          {h.action === 'instalar'
                            ? 'Instalación'
                            : 'Retiro'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{h.location_name || '—'}</span>
                          {h.location_detail && (
                            <span className="text-muted-foreground">
                              · {h.location_detail}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
    </div>
  );
}
