'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Installation, Sim } from '@/lib/types';

interface AppData {
  sims: Sim[];
  installations: Installation[];
  stats: { total: number; instaladas: number; libres: number; pendientes: number };
  loading: boolean;
  refresh: () => void;
}

export function useAppData(): AppData {
  const [sims, setSims] = useState<Sim[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([
      supabase.from('sims').select('*').order('updated_at', { ascending: false }),
      supabase
        .from('installations')
        .select('*')
        .order('installed_at', { ascending: false })
        .limit(20),
    ])
      .then(([simsRes, instRes]) => {
        setSims((simsRes.data as Sim[]) ?? []);
        setInstallations((instRes.data as Installation[]) ?? []);
      })
      .catch((err) => {
        console.error('Error cargando datos', err);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const stats = {
    total: sims.length,
    instaladas: sims.filter((s) => s.status === 'instalada').length,
    libres: sims.filter((s) => s.status === 'libre').length,
    pendientes: sims.filter((s) => s.needs_review).length,
  };

  return { sims, installations, stats, loading, refresh };
}
