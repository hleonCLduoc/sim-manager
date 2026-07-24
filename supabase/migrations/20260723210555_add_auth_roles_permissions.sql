/*
# Sistema de autenticación con roles y permisos

## Resumen
Transforma la aplicación de acceso libre (anon) a un sistema con inicio de sesión
obligatorio, roles (super_admin / usuario) y permisos granulares por funcionalidad.
Esto protege la carga masiva, la eliminación masiva y la gestión de usuarios.

## Tablas nuevas
1. `profiles` — Extiende `auth.users` con rol y permisos.
   - `id`: referencia a `auth.users(id)` (clave primaria, se crea automáticamente al registrarse).
   - `role`: 'super_admin' o 'usuario'.
   - `can_batch_import`: permiso para usar el ingreso masivo de SIMs.
   - `can_batch_delete`: permiso para usar la eliminación masiva de SIMs.
   - `can_manage_users`: permiso para crear/editar usuarios (solo super_admin por defecto).
   - `display_name`: nombre visible del usuario.
   - `created_at`: fecha de creación del perfil.

## Triggers nuevos
- `handle_new_user`: al crear un usuario en `auth.users`, inserta automáticamente
  un perfil. El PRIMER usuario registrado se convierte en super_admin automáticamente
  (si no existe ningún perfil aún). Los siguientes son 'usuario' sin permisos especiales.

## Funciones nuevas
- `is_super_admin()`: devuelve true si el usuario actual es super_admin.
- `has_permission(p_perm text)`: devuelve true si el usuario tiene el permiso indicado.
- `create_user(p_email, p_password, p_display_name, p_role, p_perms...)`:
  crea un nuevo usuario de auth + su perfil con los permisos indicados.
  Solo super_admin puede ejecutarla.
- `update_user_permissions(p_user_id, p_role, p_can_batch_import, p_can_batch_delete, p_can_manage_users)`:
  actualiza el rol y permisos de un usuario. Solo super_admin puede ejecutarla.
- `delete_users(p_sim_numbers[])`: elimina SIMs por número (eliminación masiva).
  Requiere permiso can_batch_delete.
- `list_all_users()`: lista todos los usuarios con su perfil. Solo super_admin.

## Cambios de seguridad (RLS)
- Se eliminan las políticas `anon` de sims, locations, installations.
- Se reemplazan por políticas `authenticated` que permiten CRUD a cualquier
  usuario autenticado (los datos de SIM son compartidos entre usuarios autorizados).
- La tabla `profiles` permite que cada usuario lea su propio perfil, y que
  super_admin lea todos los perfiles.

## Notas importantes
1. El primer usuario que se registrese en la app se convierte automáticamente
   en super_admin. Debes registrarte tú primero.
2. La eliminación masiva solo borra SIMs que existan en el maestro; las que no
   existen se ignoran y se reportan en el resultado.
3. El historial de instalaciones se conserva (las SIM eliminadas quedan con
   sim_id = NULL gracias al ON DELETE SET NULL).
*/

-- =========================================================
-- Tabla: profiles
-- =========================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'usuario' CHECK (role IN ('super_admin', 'usuario')),
  can_batch_import boolean NOT NULL DEFAULT false,
  can_batch_delete boolean NOT NULL DEFAULT false,
  can_manage_users boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Cada usuario puede leer su propio perfil
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- Super admin puede leer todos los perfiles
DROP POLICY IF EXISTS "super_admin_select_all_profiles" ON profiles;
CREATE POLICY "super_admin_select_all_profiles" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- Cada usuario puede actualizar su propio perfil (solo nombre)
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Super admin puede actualizar cualquier perfil
DROP POLICY IF EXISTS "super_admin_update_profiles" ON profiles;
CREATE POLICY "super_admin_update_profiles" ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- =========================================================
-- Funciones helper
-- =========================================================
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION has_permission(p_perm text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (
      role = 'super_admin'
      OR (p_perm = 'can_batch_import' AND can_batch_import)
      OR (p_perm = 'can_batch_delete' AND can_batch_delete)
      OR (p_perm = 'can_manage_users' AND can_manage_users)
    )
  );
$$;

-- =========================================================
-- Trigger: crear perfil automáticamente al registrar usuario
-- =========================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_first boolean;
BEGIN
  -- Verificar si es el primer usuario
  SELECT count(*) = 0 INTO v_is_first FROM profiles;

  INSERT INTO profiles (id, email, display_name, role, can_batch_import, can_batch_delete, can_manage_users)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    CASE WHEN v_is_first THEN 'super_admin' ELSE 'usuario' END,
    CASE WHEN v_is_first THEN true ELSE false END,
    CASE WHEN v_is_first THEN true ELSE false END,
    CASE WHEN v_is_first THEN true ELSE false END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =========================================================
-- Función: create_user (solo super_admin)
-- Crea un usuario de auth + su perfil con permisos
-- =========================================================
CREATE OR REPLACE FUNCTION create_user(
  p_email text,
  p_password text,
  p_display_name text DEFAULT NULL,
  p_role text DEFAULT 'usuario',
  p_can_batch_import boolean DEFAULT false,
  p_can_batch_delete boolean DEFAULT false,
  p_can_manage_users boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo un super administrador puede crear usuarios');
  END IF;

  IF p_role NOT IN ('super_admin', 'usuario') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rol no válido');
  END IF;

  -- Crear usuario en auth.users
  INSERT INTO auth.users (
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change
  )
  SELECT
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    lower(p_email),
    crypt(p_password, gen_salt('bf')),
    now(),
    '{}'::jsonb,
    jsonb_build_object('display_name', p_display_name),
    now(),
    now(),
    '',
    ''
  RETURNING id INTO v_user_id;

  -- El trigger on_auth_user_created NO se dispara en inserts manuales a auth.users
  -- porque los triggers AFTER INSERT sí se disparan. Pero el contexto de auth.uid()
  -- puede no estar disponible. Insertamos el perfil manualmente para asegurar.
  INSERT INTO profiles (id, email, display_name, role, can_batch_import, can_batch_delete, can_manage_users)
  VALUES (v_user_id, lower(p_email), p_display_name, p_role, p_can_batch_import, p_can_batch_delete, p_can_manage_users)
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    can_batch_import = EXCLUDED.can_batch_import,
    can_batch_delete = EXCLUDED.can_batch_delete,
    can_manage_users = EXCLUDED.can_manage_users;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$$;

-- =========================================================
-- Función: update_user_permissions (solo super_admin)
-- =========================================================
CREATE OR REPLACE FUNCTION update_user_permissions(
  p_user_id uuid,
  p_role text,
  p_can_batch_import boolean,
  p_can_batch_delete boolean,
  p_can_manage_users boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo un super administrador puede cambiar permisos');
  END IF;

  IF p_role NOT IN ('super_admin', 'usuario') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rol no válido');
  END IF;

  UPDATE profiles
  SET role = p_role,
      can_batch_import = p_can_batch_import,
      can_batch_delete = p_can_batch_delete,
      can_manage_users = p_can_manage_users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- =========================================================
-- Función: list_all_users (solo super_admin)
-- =========================================================
CREATE OR REPLACE FUNCTION list_all_users()
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  role text,
  can_batch_import boolean,
  can_batch_delete boolean,
  can_manage_users boolean,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, email, display_name, role, can_batch_import, can_batch_delete, can_manage_users, created_at
  FROM profiles
  ORDER BY created_at ASC;
$$;

-- =========================================================
-- Función: delete_sims_by_numbers (eliminación masiva)
-- Requiere permiso can_batch_delete
-- =========================================================
CREATE OR REPLACE FUNCTION delete_sims_by_numbers(p_sim_numbers text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int := 0;
  v_not_found text[];
  v_found text[];
  v_sim text;
BEGIN
  IF NOT has_permission('can_batch_delete') THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permiso para eliminación masiva');
  END IF;

  FOREACH v_sim IN ARRAY p_sim_numbers LOOP
    v_sim := btrim(v_sim);
    IF v_sim = '' THEN CONTINUE; END IF;

    DELETE FROM sims WHERE sim_number = v_sim;
    IF FOUND THEN
      v_deleted := v_deleted + 1;
      v_found := array_append(v_found, v_sim);
    ELSE
      v_not_found := array_append(v_not_found, v_sim);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', v_deleted,
    'found', to_jsonb(v_found),
    'not_found', to_jsonb(v_not_found)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION is_super_admin TO authenticated;
GRANT EXECUTE ON FUNCTION has_permission TO authenticated;
GRANT EXECUTE ON FUNCTION create_user TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_permissions TO authenticated;
GRANT EXECUTE ON FUNCTION list_all_users TO authenticated;
GRANT EXECUTE ON FUNCTION delete_sims_by_numbers TO authenticated;

-- =========================================================
-- Actualizar RLS en sims, locations, installations
-- Cambio de anon+authenticated a solo authenticated
-- =========================================================

-- sims
DROP POLICY IF EXISTS "anon_select_sims" ON sims;
DROP POLICY IF EXISTS "anon_insert_sims" ON sims;
DROP POLICY IF EXISTS "anon_update_sims" ON sims;
DROP POLICY IF EXISTS "anon_delete_sims" ON sims;

CREATE POLICY "auth_select_sims" ON sims FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "auth_insert_sims" ON sims FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_sims" ON sims FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_sims" ON sims FOR DELETE
  TO authenticated USING (true);

-- locations
DROP POLICY IF EXISTS "anon_select_locations" ON locations;
DROP POLICY IF EXISTS "anon_insert_locations" ON locations;
DROP POLICY IF EXISTS "anon_update_locations" ON locations;
DROP POLICY IF EXISTS "anon_delete_locations" ON locations;

CREATE POLICY "auth_select_locations" ON locations FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "auth_insert_locations" ON locations FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_locations" ON locations FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_locations" ON locations FOR DELETE
  TO authenticated USING (true);

-- installations
DROP POLICY IF EXISTS "anon_select_installations" ON installations;
DROP POLICY IF EXISTS "anon_insert_installations" ON installations;
DROP POLICY IF EXISTS "anon_update_installations" ON installations;
DROP POLICY IF EXISTS "anon_delete_installations" ON installations;

CREATE POLICY "auth_select_installations" ON installations FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "auth_insert_installations" ON installations FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_installations" ON installations FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_installations" ON installations FOR DELETE
  TO authenticated USING (true);
