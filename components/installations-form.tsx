'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SimStatusBadge } from '@/components/sim-status-badge';
import { BarcodeScanner } from '@/components/barcode-scanner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  AlertTriangle,
  Info,
  ScanLine,
  MapPin,
  Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Installation, Location, RegisterInstallationResult, Sim } from '@/lib/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface InstallationsFormProps {
  onRegistered: () => void;
}

interface LocationSuggestion {
  location: Location;
  currentSim?: Installation;
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

  const [locationQuery, setLocationQuery] = useState('');
  const [locationFocused, setLocationFocused] = useState(false);
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [allInstallations, setAllInstallations] = useState<Installation[]>([]);
  const [allSims, setAllSims] = useState<Sim[]>([]);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<LocationSuggestion | null>(null);
  const [createLocationConfirmOpen, setCreateLocationConfirmOpen] = useState(false);
  const [scanConfirmOpen, setScanConfirmOpen] = useState(false);
  const [pendingScannedSim, setPendingScannedSim] = useState('');

  const locationInputRef = useRef<HTMLInputElement>(null);
  const simInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from('locations')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => setAllLocations((data as Location[]) ?? []));
    supabase
      .from('installations')
      .select('*')
      .eq('action', 'instalar')
      .order('installed_at', { ascending: false })
      .then(({ data }) => setAllInstallations((data as Installation[]) ?? []));
    supabase
      .from('sims')
      .select('*')
      .order('sim_number', { ascending: true })
      .then(({ data }) => setAllSims((data as Sim[]) ?? []));
  }, []);

  const currentSimByLocation = useMemo(() => {
    const map = new Map<string, Installation>();
    allInstallations.forEach((i) => {
      const key = `${i.location_name}|${i.location_detail || ''}`;
      if (!map.has(key)) {
        map.set(key, i);
      }
    });
    return map;
  }, [allInstallations]);

  const locationSuggestions = useMemo<LocationSuggestion[]>(() => {
    const term = locationQuery.trim().toLowerCase();
    if (!term) return [];

    const scored = allLocations
      .map((loc) => {
        const name = loc.name.toLowerCase();
        const detail = (loc.detail || '').toLowerCase();
        const full = `${name} ${detail}`;

        let score = 0;
        if (name === term || detail === term) score += 100;
        if (name.includes(term) || detail.includes(term)) score += 50;
        if (full.includes(term)) score += 20;

        // fuzzy: cada palabra del término debe estar presente
        const words = term.split(/\s+/).filter(Boolean);
        if (words.length > 1 && words.every((w) => full.includes(w))) score += 10;

        return { loc, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((item) => ({
        location: item.loc,
        currentSim: currentSimByLocation.get(`${item.loc.name}|${item.loc.detail || ''}`),
      }));

    return scored;
  }, [locationQuery, allLocations, currentSimByLocation]);

  const simSuggestions = useMemo<Sim[]>(() => {
    const term = simNumber.trim();
    if (!term || term.length < 3) return [];
    const termLower = term.toLowerCase();
    const termDigits = term.replace(/\D/g, '');
    return allSims
      .filter((s) => {
        const simLower = s.sim_number.toLowerCase();
        const simDigits = s.sim_number.replace(/\D/g, '');
        if (simLower.includes(termLower)) return true;
        if (termDigits.length >= 6 && simDigits.endsWith(termDigits)) return true;
        return false;
      })
      .slice(0, 8);
  }, [simNumber, allSims]);

  const exactLocation = useMemo(() => {
    const name = locationName.trim();
    if (!name) return undefined;
    return allLocations.find(
      (l) =>
        l.name.toLowerCase() === name.toLowerCase() &&
        (l.detail || '').toLowerCase() === (locationDetail || '').toLowerCase()
    );
  }, [locationName, locationDetail, allLocations]);

  const currentSimAtExactLocation = useMemo(() => {
    if (!exactLocation) return undefined;
    return currentSimByLocation.get(`${exactLocation.name}|${exactLocation.detail || ''}`);
  }, [exactLocation, currentSimByLocation]);

  function isPlausibleIccid(value: string): boolean {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 18 || digits.length > 22) return false;
    return digits.startsWith('89');
  }

  async function lookupScannedSim(cleaned: string) {
    setExistingSim(undefined);

    const { data: freeSim } = await supabase
      .from('sims')
      .select('*')
      .eq('sim_number', cleaned)
      .eq('status', 'libre')
      .maybeSingle();

    if (freeSim) {
      const sim = freeSim as Sim;
      setSimNumber(sim.sim_number);
      setExistingSim(sim);
      toast.success('SIM disponible encontrada', {
        description: `${sim.sim_number}${sim.plan ? ` - ${sim.plan}` : ''}`,
      });
      return;
    }

    const { data: anySim } = await supabase
      .from('sims')
      .select('*')
      .eq('sim_number', cleaned)
      .maybeSingle();

    if (anySim) {
      const sim = anySim as Sim;
      setSimNumber(sim.sim_number);
      setExistingSim(sim);
      if (sim.status === 'instalada') {
        toast.info('SIM encontrada, pero ya está instalada', {
          description: `Número ${sim.sim_number}`,
        });
      } else {
        toast.success('SIM encontrada', {
          description: `Número ${sim.sim_number}`,
        });
      }
      return;
    }

    setExistingSim(null);
    toast.warning('SIM no encontrada en el inventario', {
      description: `Lectura detectada: ${cleaned}. Puedes editarla antes de registrar.`,
    });

    // Si no existe, dejamos el valor en el input para edición manual confirmada.
    setSimNumber(cleaned);
    requestAnimationFrame(() => {
      simInputRef.current?.focus();
      simInputRef.current?.select();
    });
  }

  async function handleScanDetected(code: string) {
    const cleaned = code.replace(/\D/g, '').trim();

    if (!isPlausibleIccid(cleaned)) {
      toast.warning('Lectura OCR poco confiable', {
        description: `Se detectó ${cleaned || 'vacío'}. Verifica y escribe el SIM manualmente.`,
      });
      return;
    }

    setPendingScannedSim(cleaned);
    setScanConfirmOpen(true);
  }

  async function confirmAndLookupScannedSim() {
    const candidate = pendingScannedSim;
    setScanConfirmOpen(false);
    if (!candidate) return;
    await lookupScannedSim(candidate);
  }

  function editScannedSimManually() {
    const candidate = pendingScannedSim;
    setScanConfirmOpen(false);
    if (!candidate) return;
    setExistingSim(undefined);
    setSimNumber(candidate);
    requestAnimationFrame(() => {
      simInputRef.current?.focus();
      simInputRef.current?.select();
    });
    toast.info('Puedes editar el número escaneado antes de buscar o registrar.');
  }

  function rescanSim() {
    setScanConfirmOpen(false);
    setPendingScannedSim('');
    setScannerOpen(true);
  }

  function selectSimSuggestion(s: Sim) {
    setSimNumber(s.sim_number);
    setExistingSim(s);
    simInputRef.current?.blur();
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

  function resetForm() {
    setSimNumber('');
    setLocationName('');
    setLocationDetail('');
    setLocationQuery('');
    setImei('');
    setNotes('');
    setExistingSim(undefined);
    setPendingReplace(null);
  }

  async function doSubmit(replaceExisting = false) {
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
        p_replace_existing: replaceExisting,
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
      } else if (result.replaced_sim) {
        toast.success('SIM reemplazada correctamente', {
          description: `Se retiró ${result.replaced_sim.sim_number} e instaló ${trimmedSim}`,
        });
      } else {
        toast.success(
          action === 'instalar' ? 'SIM instalada correctamente' : 'SIM retirada correctamente',
          { description: `Número ${trimmedSim}` }
        );
      }

      resetForm();
      onRegistered();
    } catch (err) {
      toast.error('Ocurrió un error al registrar el movimiento');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (action === 'instalar' && currentSimAtExactLocation) {
      const loc = exactLocation!;
      setPendingReplace({
        location: loc,
        currentSim: currentSimAtExactLocation,
      });
      setReplaceDialogOpen(true);
      return;
    }

    if (action === 'instalar' && locationName.trim() && !exactLocation) {
      setCreateLocationConfirmOpen(true);
      return;
    }

    await doSubmit(false);
  }

  function confirmReplace() {
    setReplaceDialogOpen(false);
    doSubmit(true);
  }

  function confirmCreateLocation() {
    setCreateLocationConfirmOpen(false);
    doSubmit(false);
  }

  function selectSuggestion(s: LocationSuggestion) {
    setLocationName(s.location.name);
    setLocationDetail(s.location.detail || '');
    setLocationQuery('');
    setLocationFocused(false);
    locationInputRef.current?.blur();
  }

  const simNotFound = simNumber.trim() !== '' && existingSim === null && !simFocused;
  const showSuggestions = locationFocused && locationSuggestions.length > 0;

  return (
    <>
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
                <div className="relative">
                  <Input
                    ref={simInputRef}
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
                    placeholder="Ej. 8956120… o los últimos 6 dígitos"
                    className="font-mono"
                    autoComplete="off"
                  />
                  {simFocused && simSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-md">
                      {simSuggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectSimSuggestion(s)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{s.sim_number}</span>
                            <span className="text-xs text-muted-foreground">
                              {s.plan || 'Sin plan'}
                            </span>
                          </div>
                          <SimStatusBadge
                            status={s.status}
                            needsReview={s.needs_review}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="location">
                  Ubicación {action === 'instalar' ? '*' : '(opcional)'}
                </Label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={locationInputRef}
                    id="location"
                    value={locationName}
                    onChange={(e) => {
                      setLocationName(e.target.value);
                      setLocationQuery(e.target.value);
                    }}
                    onFocus={() => setLocationFocused(true)}
                    onBlur={() => setTimeout(() => setLocationFocused(false), 150)}
                    placeholder="Busca por número de bus, sucursal, marca…"
                    className="pl-9"
                    autoComplete="off"
                  />
                  {showSuggestions && (
                    <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-md">
                      {locationSuggestions.map((s) => (
                        <button
                          key={s.location.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectSuggestion(s)}
                          className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <div>
                            <p className="font-medium">{s.location.name}</p>
                            {s.location.detail && (
                              <p className="text-xs text-muted-foreground">{s.location.detail}</p>
                            )}
                          </div>
                          {s.currentSim ? (
                            <span className="shrink-0 text-xs text-warning-foreground">
                              SIM: {s.currentSim.sim_number.slice(-6)}
                            </span>
                          ) : (
                            <span className="flex shrink-0 items-center gap-1 text-xs text-success">
                              <Check className="h-3 w-3" />
                              Libre
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {currentSimAtExactLocation && action === 'instalar' && (
                  <p className="flex items-center gap-1.5 text-xs text-warning-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Esta ubicación ya tiene la SIM{' '}
                    <span className="font-mono">{currentSimAtExactLocation.sim_number}</span>{' '}
                    instalada. Se preguntará si deseas reemplazarla.
                  </p>
                )}
                {action === 'instalar' && locationName.trim() && !exactLocation && !showSuggestions && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5" />
                    La ubicación no existe en el catálogo actual. Al continuar se te preguntará si deseas crearla.
                  </p>
                )}
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
                Al retirar, la SIM queda con estado <strong className="font-semibold">Libre</strong>{' '}
                y disponible para futuras instalaciones.
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

      <Dialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reemplazar SIM instalada</DialogTitle>
            <DialogDescription>
              La ubicación <strong>{pendingReplace?.location.name}</strong>{' '}
              {pendingReplace?.location.detail && `(${pendingReplace.location.detail})`} ya tiene una
              SIM instalada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg bg-muted p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">SIM actual:</span>
              <span className="font-mono font-medium">
                {pendingReplace?.currentSim?.sim_number}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nueva SIM:</span>
              <span className="font-mono font-medium">{simNumber.trim()}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplaceDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmReplace} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowDownToLine className="mr-2 h-4 w-4" />
              )}
              Sí, reemplazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scanConfirmOpen} onOpenChange={setScanConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar SIM detectada</DialogTitle>
            <DialogDescription>
              El lector detectó este número. Elige cómo continuar para evitar errores de OCR.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg bg-muted p-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Número leído:</span>
              <span className="break-all font-mono font-medium">{pendingScannedSim}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Consejo: si no coincide exactamente con la tarjeta, usa "Editar" o "Reescanear".
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={rescanSim}>
              <ScanLine className="mr-2 h-4 w-4" />
              Reescanear
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={editScannedSimManually}>
                Editar
              </Button>
              <Button onClick={confirmAndLookupScannedSim}>
                Usar y buscar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createLocationConfirmOpen} onOpenChange={setCreateLocationConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear nueva ubicación</DialogTitle>
            <DialogDescription>
              Esta ubicación no existe en el catálogo. Confirma si deseas crearla antes de registrar la instalación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg bg-muted p-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Ubicación:</span>
              <span className="font-medium">{locationName.trim()}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Detalle / Línea:</span>
              <span className="text-right">{locationDetail.trim() || 'Sin detalle'}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateLocationConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmCreateLocation} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="mr-2 h-4 w-4" />
              )}
              Sí, crear y continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
        active
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-input hover:bg-accent'
      )}
    >
      <RadioGroupItem value={value} id={`action-${value}`} className="sr-only" />
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg',
          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
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
