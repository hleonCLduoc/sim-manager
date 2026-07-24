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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trash2, Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { DeleteSimsResult } from '@/lib/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface BatchDeleteProps {
  onDeleted: () => void;
}

export function BatchDelete({ onDeleted }: BatchDeleteProps) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<DeleteSimsResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function parseNumbers(): string[] {
    return text
      .split(/[\r\n,;\t]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function handlePreview() {
    const nums = parseNumbers();
    setParsed(nums);
    setResult(null);
  }

  function handleDeleteClick() {
    if (!parsed || parsed.length === 0) return;
    setConfirmOpen(true);
  }

  async function handleDelete() {
    if (!parsed) return;
    setConfirmOpen(false);
    setDeleting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc('delete_sims_by_numbers', {
        p_sim_numbers: parsed,
      });
      if (error) throw error;
      const res = data as DeleteSimsResult;
      if (!res?.success) {
        toast.error(res?.error || 'No se pudo completar la eliminación');
        setResult(res);
        return;
      }
      setResult(res);
      toast.success(`${res.deleted} SIM${res.deleted !== 1 ? 's' : ''} eliminada${res.deleted !== 1 ? 's' : ''}`);
      setText('');
      setParsed(null);
      onDeleted();
    } catch (err) {
      toast.error('Error al eliminar SIMs');
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Eliminación masiva de SIMs
          </CardTitle>
          <CardDescription>
            Pega una lista de números de SIM (uno por línea) para eliminarlas del
            inventario maestro. El historial de instalaciones se conserva. Solo se
            aceptan números de SIM.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Esta acción <strong>no se puede deshacer</strong>. Las SIMs eliminadas
              saldrán del inventario maestro pero su historial de movimientos se
              conservará.
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delete-batch">Números de SIM a eliminar</Label>
            <Textarea
              id="delete-batch"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setParsed(null);
                setResult(null);
              }}
              placeholder={'895601000000123456\n895601000000123457\n895601000000123458'}
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
              variant="destructive"
              onClick={handleDeleteClick}
              disabled={deleting || !parsed || parsed.length === 0}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando…
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar {parsed && parsed.length > 0 ? `${parsed.length} SIMs` : ''}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {parsed && !result && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <p className="mb-3 text-sm text-muted-foreground">
              Se eliminarán <strong>{parsed.length}</strong> SIMs del inventario maestro:
            </p>
            <div className="max-h-60 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Número SIM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.map((num, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{num}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            {result.success ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-lg bg-success/10 p-4 text-sm">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <span>
                    <strong>{result.deleted}</strong> SIMs eliminadas correctamente.
                  </span>
                </div>

                {result.not_found && result.not_found.length > 0 && (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <XCircle className="h-4 w-4" />
                      No encontradas en el inventario ({result.not_found.length}):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {result.not_found.map((n, i) => (
                        <span
                          key={i}
                          className={cn(
                            'rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground'
                          )}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <span>{result.error}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmar eliminación
            </DialogTitle>
            <DialogDescription>
              Vas a eliminar <strong>{parsed?.length}</strong> SIMs del inventario
              maestro. Esta acción no se puede deshacer. ¿Estás seguro?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Sí, eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
