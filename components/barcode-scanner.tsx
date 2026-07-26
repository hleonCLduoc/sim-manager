'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Camera, Loader2, X, ScanLine, CheckCircle2, RefreshCcw, AlertTriangle } from 'lucide-react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { toast } from 'sonner';

function createReader() {
  return new BrowserMultiFormatReader();
}

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}

export function BarcodeScanner({ open, onOpenChange, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>();
  const [starting, setStarting] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'unknown' | 'granted' | 'denied'>('unknown');

  const isSecureContext = typeof window !== 'undefined' &&
    (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  useEffect(() => {
    if (!open) return;

    setError(null);
    setLastCode(null);
    const reader = createReader();
    readerRef.current = reader;

    if (!isSecureContext) {
      setError('La cámara solo funciona en conexiones seguras (HTTPS). En localhost también debería funcionar.');
      return;
    }

    requestCameraAccess();

    return () => {
      stopScanner();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !selectedDeviceId || !videoRef.current || !readerRef.current) return;
    startScanner(selectedDeviceId);
    return () => stopScanner();
  }, [open, selectedDeviceId]);

  async function requestCameraAccess() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Tu navegador no soporta acceso a la cámara.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      setPermissionState('granted');
      await loadDevices();
    } catch (err) {
      setPermissionState('denied');
      setError('Permiso de cámara denegado. Activa el permiso en la configuración del navegador.');
    }
  }

  async function loadDevices() {
    try {
      const videoDevices = await BrowserMultiFormatReader.listVideoInputDevices();
      setDevices(videoDevices);
      if (videoDevices.length === 0) {
        setError('No se detectaron cámaras en este dispositivo.');
        return;
      }
      const back = videoDevices.find((d) => /back|rear|environment/i.test(d.label));
      setSelectedDeviceId((back || videoDevices[0])?.deviceId);
    } catch {
      setError('No se pudo listar las cámaras del dispositivo.');
    }
  }

  function stopScanner() {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        // ignore
      }
      controlsRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  }

  async function startScanner(deviceId: string) {
    if (!readerRef.current || !videoRef.current) return;
    setStarting(true);
    setError(null);
    stopScanner();

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: { exact: deviceId },
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const controls = await readerRef.current.decodeFromVideoElement(videoRef.current, (result, err) => {
        if (result) {
          const code = result.getText().trim();
          setLastCode(code);
          onDetected(code);
          toast.success('Número leído', { description: code });
          handleClose();
        }
      });
      controlsRef.current = controls;
      setStarting(false);
    } catch {
      setStarting(false);
      setError('No se pudo iniciar la cámara seleccionada. Prueba con otra cámara o recarga la página.');
    }
  }

  function handleClose() {
    stopScanner();
    onOpenChange(false);
  }

  function handleRetry() {
    setError(null);
    requestCameraAccess();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Escáner de SIM
          </DialogTitle>
          <DialogDescription>
            Apunta la cámara al código de barras impreso en la tarjeta SIM. Mantén la tarjeta bien iluminada y dentro del recuadro.
          </DialogDescription>
        </DialogHeader>

        <div className="relative bg-black">
          <video
            ref={videoRef}
            className="h-[360px] w-full object-cover"
            muted
            playsInline
            autoPlay
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-32 w-[90%] max-w-xs rounded-xl border-2 border-white/70 shadow-[0_0_0_1000px_rgba(0,0,0,0.35)]">
              <ScanLine className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-primary drop-shadow-lg" />
            </div>
          </div>
          {starting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Iniciando cámara…</p>
            </div>
          )}
          {error && !starting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center text-white">
              <AlertTriangle className="h-10 w-10 text-warning-foreground" />
              <p className="text-sm">{error}</p>
              <Button size="sm" variant="secondary" onClick={handleRetry}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Reintentar
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-3 px-5 pb-5">
          {devices.length > 1 && permissionState === 'granted' && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Cámara</p>
              <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona la cámara" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || `Cámara ${d.deviceId.slice(0, 6)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {permissionState === 'denied' && (
            <p className="text-xs text-muted-foreground">
              Si ya bloqueaste el permiso, debes habilitarlo manualmente en la configuración de tu navegador para este sitio.
            </p>
          )}

          {lastCode && (
            <div className="flex items-center gap-2 rounded-lg bg-success/10 p-2.5 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <span className="font-mono text-xs">{lastCode}</span>
            </div>
          )}

          <Button variant="outline" onClick={handleClose} className="w-full">
            <X className="mr-2 h-4 w-4" />
            Cerrar escáner
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
