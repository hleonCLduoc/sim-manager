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
import { Camera, Loader2, X, ScanLine, CheckCircle2, RefreshCcw, AlertTriangle, Aperture } from 'lucide-react';
import { toast } from 'sonner';

const SIM_MIN_LEN = 15;
const SIM_MAX_LEN = 22;

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}

export function BarcodeScanner({ open, onOpenChange, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>();
  const [starting, setStarting] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [processing, setProcessing] = useState(false);

  const isSecureContext = typeof window !== 'undefined' &&
    (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  useEffect(() => {
    if (!open) return;

    setError(null);
    setLastCode(null);
    setProcessing(false);

    if (!isSecureContext) {
      setError('La cámara solo funciona en conexiones seguras (HTTPS). En localhost también debería funcionar.');
      return;
    }

    requestCameraAccess();

    return () => {
      stopCamera();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !selectedDeviceId || !videoRef.current) return;
    startCamera(selectedDeviceId);
    return () => stopCamera();
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
      const videoDevices = await navigator.mediaDevices.enumerateDevices();
      const cameras = videoDevices.filter((d) => d.kind === 'videoinput');
      setDevices(cameras);
      if (cameras.length === 0) {
        setError('No se detectaron cámaras en este dispositivo.');
        return;
      }
      const back = cameras.find((d) => /back|rear|environment/i.test(d.label));
      setSelectedDeviceId((back || cameras[0])?.deviceId);
    } catch {
      setError('No se pudo listar las cámaras del dispositivo.');
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startCamera(deviceId: string) {
    if (!videoRef.current) return;
    setStarting(true);
    setError(null);
    stopCamera();

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
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStarting(false);
    } catch {
      setStarting(false);
      setError('No se pudo iniciar la cámara seleccionada. Prueba con otra cámara o recarga la página.');
    }
  }

  async function captureAndRead() {
    if (!videoRef.current || !streamRef.current) return;

    setProcessing(true);
    setError(null);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo crear el canvas');

      // OCR 1: imagen completa
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const fullFrameDataUrl = canvas.toDataURL('image/png');

      // OCR 2: recorte central (similar al recuadro visible) para mejorar precisión.
      const cropCanvas = document.createElement('canvas');
      const cropW = Math.floor(canvas.width * 0.9);
      const cropH = Math.floor(canvas.height * 0.35);
      const cropX = Math.floor((canvas.width - cropW) / 2);
      const cropY = Math.floor((canvas.height - cropH) / 2);
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) throw new Error('No se pudo crear el recorte OCR');
      cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const cropDataUrl = cropCanvas.toDataURL('image/png');

      const tesseract = await import('tesseract.js');
      const worker = await tesseract.createWorker('spa', 1, {
        logger: () => {},
        errorHandler: () => {},
      });
      await worker.setParameters({
        tessedit_pageseg_mode: tesseract.PSM.SINGLE_BLOCK,
        tessedit_char_whitelist: '0123456789',
      });

      const [fullResult, cropResult] = await Promise.all([
        worker.recognize(fullFrameDataUrl),
        worker.recognize(cropDataUrl),
      ]);

      await worker.terminate();

      const cleaned = extractSimNumber(
        fullResult.data.text || '',
        cropResult.data.text || ''
      );

      if (cleaned) {
        setLastCode(cleaned);
        onDetected(cleaned);
        toast.success('Número leído', { description: cleaned });
        stopCamera();
        onOpenChange(false);
      } else {
        setError('No se detectó un número SIM válido. Intenta otra foto con más luz y mostrando completo el número dentro del recuadro.');
      }
    } catch (err) {
      console.error(err);
      setError('Error al procesar la imagen. Intenta de nuevo.');
    } finally {
      setProcessing(false);
    }
  }

  function normalizeCandidate(raw: string): string {
    return raw.replace(/\D/g, '');
  }

  function scoreCandidate(value: string): number {
    let score = 0;
    if (value.startsWith('89')) score += 4;
    if (value.length === 19) score += 3;
    if (value.length === 20) score += 2;
    if (value.length >= 18) score += 1;
    return score;
  }

  function extractSimNumber(...texts: string[]): string | null {
    const set = new Set<string>();

    for (const text of texts) {
      const digitsOnly = normalizeCandidate(text);
      if (digitsOnly.length >= SIM_MIN_LEN) {
        set.add(digitsOnly);
      }

      const matches = text.match(/\d[\d\s\-]{10,}\d/g);
      if (!matches) continue;
      for (const match of matches) {
        set.add(normalizeCandidate(match));
      }
    }

    const candidates = Array.from(set).filter(
      (v) => v.length >= SIM_MIN_LEN && v.length <= SIM_MAX_LEN
    );

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => {
      const scoreDiff = scoreCandidate(b) - scoreCandidate(a);
      if (scoreDiff !== 0) return scoreDiff;
      return b.length - a.length;
    });

    return candidates[0] || null;
  }

  function handleClose() {
    stopCamera();
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
            Enfoca el número impreso en la tarjeta SIM dentro del recuadro y toma la foto.
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
          {processing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-white">
              <Loader2 className="h-10 w-10 animate-spin" />
              <p className="text-sm">Leyendo número con OCR…</p>
            </div>
          )}
          {error && !starting && !processing && (
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

          <Button
            onClick={captureAndRead}
            disabled={starting || processing || permissionState !== 'granted'}
            className="w-full"
          >
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando…
              </>
            ) : (
              <>
                <Aperture className="mr-2 h-4 w-4" />
                Tomar foto y leer número
              </>
            )}
          </Button>

          <Button variant="outline" onClick={handleClose} className="w-full">
            <X className="mr-2 h-4 w-4" />
            Cerrar escáner
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
