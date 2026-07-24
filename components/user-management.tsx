'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserCog, UserPlus, Loader2, Shield } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import type { CreateUserResult, Profile, UserRole } from '@/lib/types';
import { formatDateOnlyCL } from '@/lib/format';
import { toast } from 'sonner';

interface UserManagementProps {
  onProfileChanged: () => void;
}

export function UserManagement({ onProfileChanged }: UserManagementProps) {
  const { user, refreshProfile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);

  async function loadUsers() {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_all_users');
    if (error) {
      toast.error('No se pudieron cargar los usuarios');
    } else {
      setUsers((data as Profile[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <UserCog className="h-5 w-5 text-primary" />
            Gestión de usuarios
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Crea usuarios y asigna permisos para las funciones del sistema.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Nuevo usuario
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              No hay usuarios registrados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Correo</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead className="hidden sm:table-cell">Permisos</TableHead>
                    <TableHead className="hidden md:table-cell">Creado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.display_name || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.email}
                      </TableCell>
                      <TableCell>
                        {u.role === 'super_admin' ? (
                          <Badge className="border-primary/30 bg-primary/10 text-primary">
                            <Shield className="mr-1 h-3 w-3" />
                            Super Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Usuario</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {u.can_batch_import && <PermChip label="Carga masiva" />}
                          {u.can_batch_delete && <PermChip label="Eliminación" />}
                          {u.can_manage_users && <PermChip label="Gest. usuarios" />}
                          {!u.can_batch_import && !u.can_batch_delete && !u.can_manage_users && u.role !== 'super_admin' && (
                            <span className="text-xs text-muted-foreground">Sin permisos</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {formatDateOnlyCL(u.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditTarget(u)}
                          disabled={u.id === user?.id}
                        >
                          <UserCog className="h-4 w-4" />
                          <span className="ml-1.5 hidden sm:inline">Editar</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { loadUsers(); onProfileChanged(); }}
      />
      <EditUserDialog
        target={editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        onSaved={() => { loadUsers(); refreshProfile(); onProfileChanged(); }}
      />
    </div>
  );
}

function PermChip({ label }: { label: string }) {
  return (
    <span className="rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">
      {label}
    </span>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('usuario');
  const [canBatchImport, setCanBatchImport] = useState(false);
  const [canBatchDelete, setCanBatchDelete] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Completa correo y contraseña');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_user', {
        p_email: email.trim(),
        p_password: password,
        p_display_name: displayName.trim() || null,
        p_role: role,
        p_can_batch_import: canBatchImport,
        p_can_batch_delete: canBatchDelete,
        p_can_manage_users: canManageUsers,
      });
      if (error) throw error;
      const result = data as CreateUserResult;
      if (!result?.success) {
        toast.error(result?.error || 'No se pudo crear el usuario');
        return;
      }
      toast.success('Usuario creado correctamente');
      setEmail('');
      setPassword('');
      setDisplayName('');
      setRole('usuario');
      setCanBatchImport(false);
      setCanBatchDelete(false);
      setCanManageUsers(false);
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error('Error al crear usuario');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear nuevo usuario</DialogTitle>
          <DialogDescription>
            Define el correo, contraseña y permisos del nuevo usuario.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-name">Nombre</Label>
              <Input
                id="new-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nombre del usuario"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Correo *</Label>
              <Input
                id="new-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@correo.com"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Contraseña *</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
            />
          </div>
          <div className="space-y-2">
            <Label>Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usuario">Usuario</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === 'usuario' && (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">Permisos</p>
              <PermissionRow
                label="Carga masiva de SIMs"
                description="Permite usar el ingreso masivo del proveedor"
                checked={canBatchImport}
                onChange={setCanBatchImport}
              />
              <PermissionRow
                label="Eliminación masiva"
                description="Permite eliminar SIMs del inventario por número"
                checked={canBatchDelete}
                onChange={setCanBatchDelete}
              />
              <PermissionRow
                label="Gestión de usuarios"
                description="Permite crear y editar usuarios del sistema"
                checked={canManageUsers}
                onChange={setCanManageUsers}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Crear usuario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: Profile | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<UserRole>('usuario');
  const [canBatchImport, setCanBatchImport] = useState(false);
  const [canBatchDelete, setCanBatchDelete] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (target) {
      setRole(target.role);
      setCanBatchImport(target.can_batch_import);
      setCanBatchDelete(target.can_batch_delete);
      setCanManageUsers(target.can_manage_users);
    }
  }, [target]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('update_user_permissions', {
        p_user_id: target.id,
        p_role: role,
        p_can_batch_import: canBatchImport,
        p_can_batch_delete: canBatchDelete,
        p_can_manage_users: canManageUsers,
      });
      if (error) throw error;
      const result = data as CreateUserResult;
      if (!result?.success) {
        toast.error(result?.error || 'No se pudieron actualizar los permisos');
        return;
      }
      toast.success('Permisos actualizados');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error('Error al actualizar permisos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (!target) return null;

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>
            {target.display_name} · {target.email}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label>Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usuario">Usuario</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === 'usuario' && (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">Permisos</p>
              <PermissionRow
                label="Carga masiva de SIMs"
                description="Permite usar el ingreso masivo del proveedor"
                checked={canBatchImport}
                onChange={setCanBatchImport}
              />
              <PermissionRow
                label="Eliminación masiva"
                description="Permite eliminar SIMs del inventario por número"
                checked={canBatchDelete}
                onChange={setCanBatchDelete}
              />
              <PermissionRow
                label="Gestión de usuarios"
                description="Permite crear y editar usuarios del sistema"
                checked={canManageUsers}
                onChange={setCanManageUsers}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PermissionRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}


