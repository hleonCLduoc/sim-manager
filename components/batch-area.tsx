'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BatchImport } from '@/components/batch-import';
import { BatchDelete } from '@/components/batch-delete';
import { useAuth } from '@/hooks/use-auth';
import { Lock, Upload, Trash2 } from 'lucide-react';

interface BatchAreaProps {
  onImported: () => void;
  onDeleted: () => void;
}

export function BatchArea({ onImported, onDeleted }: BatchAreaProps) {
  const { can } = useAuth();
  const [subTab, setSubTab] = useState('import');

  const canImport = can('can_batch_import');
  const canDelete = can('can_batch_delete');

  if (!canImport && !canDelete) {
    return <NoPermission message="No tienes permisos para usar las funciones masivas." />;
  }

  return (
    <Tabs value={subTab} onValueChange={setSubTab} className="space-y-6">
      <div className="overflow-x-auto">
        <TabsList className="flex w-full justify-start gap-1 sm:w-auto">
          {canImport && (
            <TabsTrigger value="import" className="gap-2">
              <Upload className="h-4 w-4" />
              Ingreso masivo
            </TabsTrigger>
          )}
          {canDelete && (
            <TabsTrigger value="delete" className="gap-2">
              <Trash2 className="h-4 w-4" />
              Eliminación masiva
            </TabsTrigger>
          )}
        </TabsList>
      </div>

      {canImport && (
        <TabsContent value="import" className="outline-none">
          <BatchImport onImported={onImported} />
        </TabsContent>
      )}

      {canDelete && (
        <TabsContent value="delete" className="outline-none">
          <BatchDelete onDeleted={onDeleted} />
        </TabsContent>
      )}
    </Tabs>
  );
}

function NoPermission({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <Lock className="mb-3 h-10 w-10 text-muted-foreground/50" />
      <p className="font-medium">{message}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Contacta al administrador si necesitas acceso.
      </p>
    </div>
  );
}
