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
import { Camera, Loader2, X, ScanLine, CheckCircle2 } from 'lucide-react';
import {
  BrowserMultiFormatReader,
  IScannerControls,
} from '@zxing/browser';
import { toast } from 'sonner';

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

  useEffect(() => {
    if (!open) return;

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    BrowserMultiFormatReader.listVideoInputDevices()
      .then((videoDevices) => {
        setDevices(videoDevices);
        const back = videoDevices.find((d) =>
          /back|rear|environment/i.test(d.label)
        );
        setSelectedDeviceId((back || videoDevices[0])?.deviceId);
      })
      .catch(() => {
        toast.error('No se pudo acceder a la cámara del dispositivo');
      });

    return () => {
      stopScanner();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !selectedDeviceId || !videoRef.current || !readerRef.current) return;
    startScanner(selectedDeviceId);
    return () => stopScanner();
  }, [open, selectedDeviceId]);

  function stopScanner() {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
  }

  function startScanner(deviceId: string) {
    if (!readerRef.current || !videoRef.current) return;
    setStarting(true);
    stopScanner();
    readerRef.current
      .decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
        if (result) {
          const code = result.getText().trim();
          setLastCode(code);
          onDetected(code);
          toast.success('Número leído', { description: code });
          handleClose();
        }
      })
      .then((controls) => {
        controlsRef.current = controls;
        setStarting(false);
      })
      .catch(() => {
        setStarting(false);
        toast.error('No se pudo iniciar la cámara');
      });
  }

  function handleClose() {
    stopScanner();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) stopScanner(); onOpenChange(v); }}>
      <DialogContent className="max-w-md overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Escáner de SIM
          </DialogTitle>
          <DialogDescription>
            Apunta la cámara al código de barras impreso en la tarjeta SIM.
          </DialogDescription>
        </DialogHeader>

        <div className="relative bg-black">
          <video
            ref={videoRef}
            className="h-[320px] w-full object-cover"
            muted
            playsInline
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-40 w-[85%] max-w-xs rounded-xl border-2 border-white/70 shadow-[0_0_0_1000px_rgba(0,0,0,0.35)]">
              <ScanLine className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-primary drop-shadow-lg" />
            </div>
          </div>
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          )}
        </div>

        <div className="space-y-3 px-5 pb-5">
          {devices.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Cámara</p>
              <Select
                value={selectedDeviceId}
                onValueChange={setSelectedDeviceId}
              >
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
