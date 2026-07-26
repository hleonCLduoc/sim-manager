'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SimStatusBadge } from '@/components/sim-status-badge';
import {
  Download,
  FileSpreadsheet,
  Loader2,
  Smartphone,
  CheckCircle2,
  Cpu,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Installation, Sim } from '@/lib/types';
import { formatDateCL, formatDateOnlyCL } from '@/lib/format';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ReportsProps {
  sims: Sim[];
  loading: boolean;
}

type ReportType = 'full' | 'installed' | 'free' | 'history';

export function Reports({ sims, loading }: ReportsProps) {
  const [exporting, setExporting] = useState<ReportType | null>(null);

  const stats = {
    total: sims.length,
    instaladas: sims.filter((s) => s.status === 'instalada').length,
    libres: sims.filter((s) => s.status === 'libre').length,
    pendientes: sims.filter((s) => s.needs_review).length,
  };

  function downloadExcel(filename: string, rows: string[][], headers: string[]) {
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
    XLSX.writeFile(workbook, filename);
  }

  function exportInventory(type: ReportType) {
    setExporting(type);
    try {
      let filtered: Sim[];
      let filename: string;
      let headers: string[];
      let rows: string[][];

      if (type === 'full') {
        filtered = sims;
        filename = `inventario_completo_${dateStamp()}.xlsx`;
        headers = ['Numero SIM', 'Plan', 'Estado', 'IMEI', 'Pendiente Revision', 'Actualizado'];
        rows = filtered.map((s) => [
          s.sim_number,
          s.plan || '',
          s.status === 'instalada' ? 'Instalada' : 'Libre',
          s.imei || '',
          s.needs_review ? 'Si' : 'No',
          formatDateOnlyCL(s.updated_at),
        ]);
      } else if (type === 'installed') {
        filtered = sims.filter((s) => s.status === 'instalada');
        filename = `sims_instaladas_${dateStamp()}.xlsx`;
        headers = ['Numero SIM', 'Plan', 'IMEI', 'Pendiente Revision', 'Actualizado'];
        rows = filtered.map((s) => [
          s.sim_number,
          s.plan || '',
          s.imei || '',
          s.needs_review ? 'Si' : 'No',
          formatDateOnlyCL(s.updated_at),
        ]);
      } else if (type === 'free') {
        filtered = sims.filter((s) => s.status === 'libre');
        filename = `sims_libres_${dateStamp()}.xlsx`;
        headers = ['Numero SIM', 'Plan', 'IMEI', 'Pendiente Revision', 'Actualizado'];
        rows = filtered.map((s) => [
          s.sim_number,
          s.plan || '',
          s.imei || '',
          s.needs_review ? 'Si' : 'No',
          formatDateOnlyCL(s.updated_at),
        ]);
      } else {
        return;
      }

      if (rows.length === 0) {
        toast.error('No hay datos para exportar en este informe');
        return;
      }

      downloadExcel(filename, rows, headers);
      toast.success(`Informe descargado: ${filename}`);
    } catch {
      toast.error('Error al generar el informe');
    } finally {
      setExporting(null);
    }
  }

  async function exportHistory() {
    setExporting('history');
    try {
      const { data, error } = await supabase
        .from('installations')
        .select('*')
        .order('installed_at', { ascending: false });

      if (error) throw error;

      const items = (data as Installation[]) ?? [];
      if (items.length === 0) {
        toast.error('No hay movimientos para exportar');
        return;
      }

      const headers = [
        'Fecha',
        'Numero SIM',
        'Accion',
        'Ubicacion',
        'Detalle',
        'IMEI',
        'Notas',
      ];
      const rows = items.map((it) => [
        formatDateCL(it.installed_at),
        it.sim_number,
        it.action === 'instalar' ? 'Instalacion' : 'Retiro',
        it.location_name || '',
        it.location_detail || '',
        it.imei || '',
        it.notes || '',
      ]);

      downloadExcel(`historial_movimientos_${dateStamp()}.xlsx`, rows, headers);
      toast.success('Historial descargado');
    } catch {
      toast.error('Error al descargar el historial');
    } finally {
      setExporting(null);
    }
  }

  function dateStamp(): string {
    return new Date().toISOString().slice(0, 10);
  }

  const installedSims = sims.filter((s) => s.status === 'instalada');
  const freeSims = sims.filter((s) => s.status === 'libre');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Informes y reportes
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Descarga informes completos de tu inventario en formato Excel (.xlsx).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total SIMs"
          value={stats.total}
          icon={Cpu}
          color="text-primary"
          bg="bg-primary/10"
        />
        <StatTile
          label="Instaladas"
          value={stats.instaladas}
          icon={Smartphone}
          color="text-primary"
          bg="bg-primary/10"
        />
        <StatTile
          label="Libres"
          value={stats.libres}
          icon={CheckCircle2}
          color="text-success"
          bg="bg-success/10"
        />
        <StatTile
          label="Pendientes revisión"
          value={stats.pendientes}
          icon={AlertTriangle}
          color="text-warning-foreground"
          bg="bg-warning/10"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ExportCard
          title="Inventario completo"
          description="Todas las SIMs con estado, plan e IMEI"
          count={stats.total}
          loading={exporting === 'full'}
          onExport={() => exportInventory('full')}
        />
        <ExportCard
          title="SIMs instaladas"
          description="Solo las SIMs que están actualmente en uso"
          count={stats.instaladas}
          loading={exporting === 'installed'}
          onExport={() => exportInventory('installed')}
        />
        <ExportCard
          title="SIMs libres"
          description="SIMs disponibles para instalar"
          count={stats.libres}
          loading={exporting === 'free'}
          onExport={() => exportInventory('free')}
        />
        <ExportCard
          title="Historial de movimientos"
          description="Todos los registros de instalación y retiro"
          loading={exporting === 'history'}
          onExport={exportHistory}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vista previa del inventario</CardTitle>
          <CardDescription>
            Resumen de las primeras SIMs del inventario actual.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : sims.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              No hay SIMs en el inventario todavía.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número SIM</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sims.slice(0, 50).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.sim_number}</TableCell>
                      <TableCell className="text-sm">{s.plan || '—'}</TableCell>
                      <TableCell>
                        <SimStatusBadge status={s.status} needsReview={s.needs_review} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {sims.length > 50 && (
                <p className="px-4 py-3 text-center text-xs text-muted-foreground">
                  Mostrando 50 de {sims.length} SIMs. Descarga el informe completo para ver todas.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bg: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString('es-CL')}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </Card>
  );
}

function ExportCard({
  title,
  description,
  count,
  loading,
  onExport,
}: {
  title: string;
  description: string;
  count?: number;
  loading: boolean;
  onExport: () => void;
}) {
  return (
    <Card className="flex flex-col justify-between p-5">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {count !== undefined && (
          <p className="mt-2 text-2xl font-bold tabular-nums text-primary">
            {count.toLocaleString('es-CL')}
          </p>
        )}
      </div>
      <Button onClick={onExport} disabled={loading} variant="outline" className="mt-4 w-full">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generando…
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            Descargar Excel
          </>
        )}
      </Button>
    </Card>
  );
}
