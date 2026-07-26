'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Installation, Location, Sim } from '@/lib/types';

interface AppData {
  sims: Sim[];
  locations: Location[];
  installations: Installation[];
  stats: { total: number; instaladas: number; libres: number; pendientes: number };
  loading: boolean;
  refresh: () => void;
}

export function useAppData(): AppData {
  const [sims, setSims] = useState<Sim[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchAllInstallations(): Promise<Installation[]> {
    const pageSize = 1000;
    let from = 0;
    let keepGoing = true;
    const rows: Installation[] = [];

    while (keepGoing) {
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from('installations')
        .select('*')
        .order('installed_at', { ascending: false })
        .range(from, to);

      if (error) {
        throw error;
      }

      const batch = (data as Installation[]) ?? [];
      rows.push(...batch);

      if (batch.length < pageSize) {
        keepGoing = false;
      } else {
        from += pageSize;
      }
    }

    return rows;
  }

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([
      supabase.from('sims').select('*').order('updated_at', { ascending: false }),
      supabase.from('locations').select('*').order('name', { ascending: true }),
      fetchAllInstallations(),
    ])
      .then(([simsRes, locRes, instRes]) => {
        setSims((simsRes.data as Sim[]) ?? []);
        setLocations((locRes.data as Location[]) ?? []);
        setInstallations((instRes as Installation[]) ?? []);
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

  return { sims, locations, installations, stats, loading, refresh };
}
