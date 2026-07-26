'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, MapPin, History, ChevronLeft, ChevronRight, Bus, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Installation, Location, Sim } from '@/lib/types';
import { formatDateCL } from '@/lib/format';

interface LocationsPanelProps {
  locations: Location[];
  installations: Installation[];
  sims: Sim[];
  loading: boolean;
}

const PAGE_SIZE = 10;

export function LocationsPanel({ locations, installations, sims, loading }: LocationsPanelProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  const currentInstallationsByLocation = useMemo(() => {
    const map = new Map<string, Installation>();
    installations
      .filter((i) => i.action === 'instalar')
      .forEach((i) => {
        const key = `${i.location_name}|${i.location_detail || ''}`;
        const existing = map.get(key);
        if (!existing || new Date(i.installed_at) > new Date(existing.installed_at)) {
          map.set(key, i);
        }
      });
    return map;
  }, [installations]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return locations;
    return locations.filter(
      (l) =>
        l.name.toLowerCase().includes(term) ||
        (l.detail || '').toLowerCase().includes(term)
    );
  }, [locations, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  if (selectedLocation) {
    return (
      <LocationDetail
        location={selectedLocation}
        installations={installations}
        sims={sims}
        onBack={() => setSelectedLocation(null)}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-5 w-5 text-primary" />
          Ubicaciones
        </CardTitle>
        <CardDescription>
          Busca buses, sucursales o ubicaciones y revisa qué SIM está instalada actualmente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Buscar por bus, sucursal o detalle…"
            className="pl-9"
          />
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
            No se encontraron ubicaciones.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>SIM actual</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((loc) => {
                  const current = currentInstallationsByLocation.get(
                    `${loc.name}|${loc.detail || ''}`
                  );
                  const currentSim = current
                    ? sims.find((s) => s.sim_number === current.sim_number)
                    : undefined;

                  return (
                    <TableRow key={loc.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Bus className="h-4 w-4 text-muted-foreground" />
                          {loc.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {loc.detail || '—'}
                      </TableCell>
                      <TableCell>
                        {current ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs">{current.sim_number}</span>
                            <span className="text-xs text-muted-foreground">
                              {currentSim?.plan || 'Sin plan'}
                            </span>
                          </div>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Sin SIM
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLocation(loc)}
                        >
                          <History className="mr-1.5 h-4 w-4" />
                          Historial
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
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

function LocationDetail({
  location,
  installations,
  sims,
  onBack,
}: {
  location: Location;
  installations: Installation[];
  sims: Sim[];
  onBack: () => void;
}) {
  const history = useMemo(() => {
    return installations
      .filter(
        (i) =>
          i.location_name === location.name &&
          i.location_detail === location.detail
      )
      .sort(
        (a, b) =>
          new Date(b.installed_at).getTime() - new Date(a.installed_at).getTime()
      );
  }, [installations, location]);

  const currentSim = history.find((h) => h.action === 'instalar');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Volver
          </Button>
        </div>
        <CardTitle className="mt-2 flex items-center gap-2 text-base">
          <MapPin className="h-5 w-5 text-primary" />
          {location.name}
        </CardTitle>
        <CardDescription>
          {location.detail || 'Sin detalle'}
          {currentSim && (
            <span className="ml-2">
              · SIM actual:{' '}
              <span className="font-mono font-medium">{currentSim.sim_number}</span>
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {history.length === 0 ? (
          <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            No hay historial para esta ubicación.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>SIM</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>IMEI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => {
                  const sim = sims.find((s) => s.sim_number === h.sim_number);
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateCL(h.installed_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={h.action === 'instalar' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {h.action === 'instalar' ? 'Instalación' : 'Retiro'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{h.sim_number}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {sim?.plan || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {h.imei || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
