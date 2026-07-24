'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SimStatusBadge } from '@/components/sim-status-badge';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { ArrowDownToLine, ArrowUpFromLine, Loader2, AlertTriangle, Info, ScanLine } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { RegisterInstallationResult, Sim } from '@/lib/types';
import { toast } from 'sonner';

interface InstallationsFormProps {
  onRegistered: () => void;
}

export function InstallationsForm({ onRegistered }: InstallationsFormProps) {
  const [simNumber, setSimNumber] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationDetail, setLocationDetail] = useState('');
  const [imei, setImei] = useState('');
  const [notes, setNotes] = useState('');
  const [action, setAction] = useState<'instalar' | 'retirar'>('instalar');
  const [loading, setLoading] = useState(false);
  const [existingSim, setExistingSim] = useState<Sim | null | undefined>(undefined);
  const [simFocused, setSimFocused] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  function handleScanDetected(code: string) {
    setSimNumber(code);
    setExistingSim(undefined);
    checkSim(code);
  }

  async function checkSim(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setExistingSim(undefined);
      return;
    }
    const { data } = await supabase
      .from('sims')
      .select('*')
      .ilike('sim_number', `%${trimmed}%`)
      .maybeSingle();
    setExistingSim((data as Sim | null) ?? null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedSim = simNumber.trim();
    if (!trimmedSim) {
      toast.error('Ingresa el número de SIM');
      return;
    }
    if (action === 'instalar' && !locationName.trim()) {
      toast.error('Indica la ubicación donde se instala la SIM');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('register_installation', {
        p_sim_number: trimmedSim,
        p_location_name: locationName.trim() || null,
        p_location_detail: locationDetail.trim() || null,
        p_imei: imei.trim() || null,
        p_action: action,
        p_notes: notes.trim() || null,
      });

      if (error) throw error;

      const result = data as RegisterInstallationResult;
      if (!result?.success) {
        toast.error(result?.error || 'No se pudo registrar el movimiento');
        return;
      }

      if (result.created_sim) {
        toast.warning('SIM no estaba en el inventario maestro', {
          description: 'Se registró con etiqueta "Pendiente de Revisión".',
        });
      } else if (result.needs_review) {
        toast.warning('SIM marcada como Pendiente de Revisión', {
          description: 'Verifica su plan en el inventario maestro.',
        });
      } else {
        toast.success(
          action === 'instalar' ? 'SIM instalada correctamente' : 'SIM retirada correctamente',
          {
            description: `Número ${trimmedSim}`,
          }
        );
      }

      setSimNumber('');
      setLocationName('');
      setLocationDetail('');
      setImei('');
      setNotes('');
      setExistingSim(undefined);
      onRegistered();
    } catch (err) {
      toast.error('Ocurrió un error al registrar el movimiento');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const simNotFound =
    simNumber.trim() !== '' && existingSim === null && !simFocused;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar movimiento</CardTitle>
        <CardDescription>
          Instala o retira una SIM de una ubicación. Si la SIM no existe en el
          inventario maestro, se registrará con etiqueta{' '}
          <span className="font-medium text-warning-foreground">Pendiente de Revisión</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label className="mb-2 block">Acción</Label>
            <RadioGroup
              value={action}
              onValueChange={(v) => setAction(v as 'instalar' | 'retirar')}
              className="grid grid-cols-2 gap-3"
            >
              <ActionOption
                value="instalar"
                label="Instalar"
                description="Colocar SIM en una ubicación"
                icon={ArrowDownToLine}
                active={action === 'instalar'}
              />
              <ActionOption
                value="retirar"
                label="Retirar"
                description="Liberar SIM de su ubicación"
                icon={ArrowUpFromLine}
                active={action === 'retirar'}
              />
            </RadioGroup>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="sim">Número de SIM *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setScannerOpen(true)}
                  className="h-7 gap-1.5 px-2 text-xs text-primary hover:text-primary"
                >
                  <ScanLine className="h-3.5 w-3.5" />
                  Escanear
                </Button>
              </div>
              <Input
                id="sim"
                value={simNumber}
                onChange={(e) => {
                  setSimNumber(e.target.value);
                  setExistingSim(undefined);
                }}
                onBlur={(e) => {
                  setSimFocused(false);
                  checkSim(e.target.value);
                }}
                onFocus={() => setSimFocused(true)}
                placeholder="Ej. 8956120…"
                className="font-mono"
              />
              {simNumber.trim() !== '' && existingSim && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {existingSim.plan || 'Sin plan'}
                  </span>
                  <SimStatusBadge
                    status={existingSim.status}
                    needsReview={existingSim.needs_review}
                  />
                </div>
              )}
              {simNotFound && (
                <p className="flex items-center gap-1.5 text-xs text-warning-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  SIM no encontrada en el maestro — se registrará como Pendiente de Revisión.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">
                Ubicación {action === 'instalar' ? '*' : '(opcional)'}
              </Label>
              <Input
                id="location"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Ej. Bus 1024 / Sucursal Centro"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="detail">Detalle / Línea</Label>
              <Input
                id="detail"
                value={locationDetail}
                onChange={(e) => setLocationDetail(e.target.value)}
                placeholder="Sucursal o línea (opcional)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="imei">IMEI (informativo)</Label>
              <Input
                id="imei"
                value={imei}
                onChange={(e) => setImei(e.target.value)}
                placeholder="Dato del equipo"
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones del movimiento"
            />
          </div>

          {action === 'retirar' && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Al retirar, la SIM queda con estado <strong className="font-semibold">Libre</strong> y
              disponible para futuras instalaciones.
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full sm:w-auto">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Registrando…
              </>
            ) : action === 'instalar' ? (
              <>
                <ArrowDownToLine className="mr-2 h-4 w-4" />
                Registrar instalación
              </>
            ) : (
              <>
                <ArrowUpFromLine className="mr-2 h-4 w-4" />
                Registrar retiro
              </>
            )}
          </Button>
        </form>
      </CardContent>

      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleScanDetected}
      />
    </Card>
  );
}

function ActionOption({
  value,
  label,
  description,
  icon: Icon,
  active,
}: {
  value: string;
  label: string;
  description: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Label
      htmlFor={`action-${value}`}
      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
        active
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-input hover:bg-accent'
      }`}
    >
      <RadioGroupItem value={value} id={`action-${value}`} className="sr-only" />
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </Label>
  );
}
