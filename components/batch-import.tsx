'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import { ClipboardPaste, Loader2, Upload, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface BatchImportProps {
  onImported: () => void;
}

interface ParsedRow {
  sim: string;
  plan: string;
  ok: boolean;
  reason?: string;
}

export function BatchImport({ onImported }: BatchImportProps) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<{ added: number; updated: number; errors: number } | null>(null);

  function parseText(): ParsedRow[] {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    return lines.map((line) => {
      const parts = line.split('\t').map((p) => p.trim());
      if (parts.length < 2) {
        const [sim, ...rest] = line.split(/[,;\t]+/).map((p) => p.trim());
        const plan = rest.join(' ').trim();
        if (!sim) return { sim: '', plan: '', ok: false, reason: 'Línea vacía' };
        return { sim, plan, ok: true };
      }
      return { sim: parts[0], plan: parts[1], ok: Boolean(parts[0]) };
    });
  }

  function handlePreview() {
    const rows = parseText();
    const validated = rows.map((r) => {
      if (!r.sim) return { ...r, ok: false, reason: 'Número de SIM vacío' };
      if (r.sim.length < 5)
        return { ...r, ok: false, reason: 'Número de SIM demasiado corto' };
      return { ...r, ok: true };
    });
    setParsed(validated);
    setImported(null);
  }

  async function handleImport() {
    if (!parsed) return;
    const validRows = parsed.filter((r) => r.ok);
    if (validRows.length === 0) {
      toast.error('No hay filas válidas para importar');
      return;
    }

    setImporting(true);
    setImported(null);
    try {
      const toUpsert = validRows.map((r) => ({
        sim_number: r.sim,
        plan: r.plan || null,
      }));

      const { data, error } = await supabase
        .from('sims')
        .upsert(toUpsert, { onConflict: 'sim_number', ignoreDuplicates: false })
        .select();

      if (error) throw error;

      const result = data as { sim_number: string }[];
      const added = result.length;
      setImported({ added, updated: 0, errors: parsed.length - validRows.length });
      toast.success(`${added} SIM${added !== 1 ? 's' : ''} procesada${added !== 1 ? 's' : ''} correctamente`);

      setText('');
      setParsed(null);
      onImported();
    } catch (err) {
      toast.error('Error al importar las SIMs');
      console.error(err);
    } finally {
      setImporting(false);
    }
  }

  function handleLoadExample() {
    setText('895601000000123456\tBAM LIBRE 300 GB\n895601000000123457\tBAM LIBRE 500 GB\n895601000000123458\tBAM LIBRE 300 GB');
  }

  const validCount = parsed?.filter((r) => r.ok).length ?? 0;
  const invalidCount = parsed ? parsed.length - validCount : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5 text-primary" />
            Ingreso masivo de SIMs
          </CardTitle>
          <CardDescription>
            Pega aquí la lista que envía el proveedor. Cada fila debe contener el{' '}
            <strong>número de SIM</strong> y el <strong>plan</strong>, separados por
            tabulación, coma o punto y coma.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="batch">Datos del proveedor</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleLoadExample}
                className="text-xs"
              >
                Cargar ejemplo
              </Button>
            </div>
            <Textarea
              id="batch"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setParsed(null);
                setImported(null);
              }}
              placeholder={'895601000000123456\tBAM LIBRE 300 GB\n895601000000123457\tBAM LIBRE 500 GB'}
              className="min-h-[180px] font-mono text-xs"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              disabled={!text.trim()}
            >
              Previsualizar
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={importing || !parsed || validCount === 0}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar {validCount > 0 ? `${validCount} SIMs` : ''}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {parsed && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-success">
                <CheckCircle2 className="h-4 w-4" />
                {validCount} válidas
              </span>
              {invalidCount > 0 && (
                <span className="flex items-center gap-1.5 font-medium text-destructive">
                  <XCircle className="h-4 w-4" />
                  {invalidCount} con error
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Número SIM</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'font-mono text-xs',
                          !row.ok && 'text-muted-foreground'
                        )}
                      >
                        {row.sim || '—'}
                      </TableCell>
                      <TableCell className="text-xs">{row.plan || '—'}</TableCell>
                      <TableCell>
                        {row.ok ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Lista
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                            <XCircle className="h-3.5 w-3.5" />
                            {row.reason}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {imported && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <span>
            Importación completada: <strong>{imported.added}</strong> SIMs procesadas
            {imported.errors > 0 && (
              <>
                {' '}
                · <strong>{imported.errors}</strong> con error
              </>
            )}
            .
          </span>
        </div>
      )}
    </div>
  );
}
