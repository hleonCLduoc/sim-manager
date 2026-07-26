/*
# Inventario de tarjetas SIM - esquema inicial

## Resumen
Crea la base de datos para gestionar el inventario e instalación de tarjetas SIM,
migrando la lógica del Excel "MODEMS 2026 MAESTRO" a un sistema web relacional.

## Tablas nuevas
1. `sims` — Inventario maestro de todas las SIM contratadas (era la Columna G/H/I del Excel).
   - `sim_number`: número de la SIM (único).
   - `plan`: detalle del plan, ej. "BAM LIBRE 300 GB" (Columna H).
   - `status`: 'libre' o 'instalada' (Columna I "USADO O NO?").
   - `imei`: dato informativo del equipo (Columna C).
   - `needs_review`: etiqueta "Pendiente de Revisión" cuando se instala una SIM que no existía en el maestro.
   - `created_at`, `updated_at`.

2. `locations` — Catálogo de ubicaciones (Bus/Sucursal, Columna A y B).
   - `name`: dónde está instalada (Columna A "Bus").
   - `detail`: detalle adicional o sucursal (Columna B "Línea").

3. `installations` — Historial completo de cada instalación y retiro de SIM.
   - `sim_id`: referencia a `sims` (puede ser nulo si la SIM se elimina del maestro).
   - `sim_number`: número desnormalizado para conservar el historial.
   - `location_id`: referencia a `locations`.
   - `location_name`, `location_detail`, `imei`: datos desnormalizados de la ubicación/equipo en el momento del movimiento.
   - `action`: 'instalar' o 'retirar'.
   - `installed_at`: fecha/hora real del movimiento.
   - `notes`: notas opcionales.

## Funciones nuevas
- `register_installation(...)`: registra una instalación o retiro de forma atómica.
  Upsert de la SIM (creándola con `needs_review = true` si no existía en el maestro),
  actualiza su estado e inserta el registro de historial. Devuelve un JSON con el
  resultado para que la interfaz pueda mostrar el aviso de "Pendiente de Revisión".

## Seguridad (RLS)
- Aplicación de un solo usuario (sin pantalla de inicio de sesión).
- RLS habilitada en las tres tablas con políticas CRUD para `anon, authenticated`
  ya que los datos son intencionalmente compartidos.
- La función `register_installation` se ejecuta como INVOKER (anon), que ya tiene
  permisos mediante las políticas.
*/

-- =========================================================
-- Tabla: sims (inventario maestro)
-- =========================================================
CREATE TABLE IF NOT EXISTS sims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_number text NOT NULL UNIQUE,
  plan text,
  status text NOT NULL DEFAULT 'libre' CHECK (status IN ('libre', 'instalada')),
  imei text,
  needs_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sims" ON sims;
CREATE POLICY "anon_select_sims" ON sims FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sims" ON sims;
CREATE POLICY "anon_insert_sims" ON sims FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sims" ON sims;
CREATE POLICY "anon_update_sims" ON sims FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sims" ON sims;
CREATE POLICY "anon_delete_sims" ON sims FOR DELETE
  TO anon, authenticated USING (true);

-- =========================================================
-- Tabla: locations (catálogo de ubicaciones)
-- =========================================================
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, detail)
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_locations" ON locations;
CREATE POLICY "anon_select_locations" ON locations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_locations" ON locations;
CREATE POLICY "anon_insert_locations" ON locations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_locations" ON locations;
CREATE POLICY "anon_update_locations" ON locations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_locations" ON locations;
CREATE POLICY "anon_delete_locations" ON locations FOR DELETE
  TO anon, authenticated USING (true);

-- =========================================================
-- Tabla: installations (historial)
-- =========================================================
CREATE TABLE IF NOT EXISTS installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_id uuid REFERENCES sims(id) ON DELETE SET NULL,
  sim_number text NOT NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  location_name text,
  location_detail text,
  imei text,
  action text NOT NULL CHECK (action IN ('instalar', 'retirar')),
  installed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE installations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_installations" ON installations;
CREATE POLICY "anon_select_installations" ON installations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_installations" ON installations;
CREATE POLICY "anon_insert_installations" ON installations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_installations" ON installations;
CREATE POLICY "anon_update_installations" ON installations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_installations" ON installations;
CREATE POLICY "anon_delete_installations" ON installations FOR DELETE
  TO anon, authenticated USING (true);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_sims_status ON sims(status);
CREATE INDEX IF NOT EXISTS idx_sims_needs_review ON sims(needs_review) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS idx_installations_sim_number ON installations(sim_number);
CREATE INDEX IF NOT EXISTS idx_installations_installed_at ON installations(installed_at DESC);
CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);

-- =========================================================
-- Función: register_installation
-- Registra una instalación o retiro de SIM de forma atómica.
-- =========================================================
CREATE OR REPLACE FUNCTION register_installation(
  p_sim_number text,
  p_location_name text,
  p_location_detail text DEFAULT NULL,
  p_imei text DEFAULT NULL,
  p_action text DEFAULT 'instalar',
  p_notes text DEFAULT NULL,
  p_replace_existing boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_sim sims%ROWTYPE;
  v_sim_id uuid;
  v_location_id uuid;
  v_created_sim boolean := false;
  v_replaced_sim sims%ROWTYPE;
  v_installation installations%ROWTYPE;
  v_existing_installation installations%ROWTYPE;
BEGIN
  -- Normalizar número de SIM
  p_sim_number := btrim(p_sim_number);
  IF p_sim_number IS NULL OR p_sim_number = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El número de SIM es obligatorio');
  END IF;

  IF p_action NOT IN ('instalar', 'retirar') THEN
    RETURN jsonb_build_object('success', false, 'error', 'La acción debe ser instalar o retirar');
  END IF;

  -- Buscar la SIM en el maestro
  SELECT * INTO v_sim FROM sims WHERE sim_number = p_sim_number;

  -- Si no existe, crearla con etiqueta de revisión
  IF NOT FOUND THEN
    INSERT INTO sims (sim_number, status, needs_review, imei)
    VALUES (p_sim_number, 'libre', true, p_imei)
    RETURNING * INTO v_sim;
    v_created_sim := true;
  END IF;

  v_sim_id := v_sim.id;

  -- Resolver o crear la ubicación
  IF p_location_name IS NOT NULL AND btrim(p_location_name) <> '' THEN
    p_location_name := btrim(p_location_name);
    INSERT INTO locations (name, detail)
    VALUES (p_location_name, p_location_detail)
    ON CONFLICT (name, detail) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_location_id;
  END IF;

  -- Si se instala y se solicita reemplazo, retirar la SIM actual de la ubicación
  IF p_action = 'instalar' AND p_replace_existing AND v_location_id IS NOT NULL THEN
    SELECT i.* INTO v_existing_installation
    FROM installations i
    WHERE i.location_id = v_location_id
      AND i.action = 'instalar'
      AND i.sim_number <> p_sim_number
      AND NOT EXISTS (
        SELECT 1 FROM installations i2
        WHERE i2.location_id = v_location_id
          AND i2.sim_number = i.sim_number
          AND i2.action = 'retirar'
          AND i2.installed_at > i.installed_at
      )
    ORDER BY i.installed_at DESC
    LIMIT 1;

    IF FOUND THEN
      SELECT * INTO v_replaced_sim FROM sims WHERE sim_number = v_existing_installation.sim_number;

      UPDATE sims
      SET status = 'libre', updated_at = now()
      WHERE sim_number = v_existing_installation.sim_number;

      INSERT INTO installations (sim_id, sim_number, location_id, location_name, location_detail, imei, action, notes)
      VALUES (
        v_replaced_sim.id,
        v_replaced_sim.sim_number,
        v_location_id,
        p_location_name,
        p_location_detail,
        v_existing_installation.imei,
        'retirar',
        'Retiro automático por reemplazo en ' || p_location_name
      );
    END IF;
  END IF;

  -- Actualizar el estado de la SIM
  IF p_action = 'instalar' THEN
    UPDATE sims
    SET status = 'instalada',
        imei = COALESCE(NULLIF(btrim(p_imei), ''), imei),
        updated_at = now()
    WHERE id = v_sim_id;
  ELSE
    UPDATE sims
    SET status = 'libre',
        updated_at = now()
    WHERE id = v_sim_id;
  END IF;

  -- Insertar registro de historial
  INSERT INTO installations (sim_id, sim_number, location_id, location_name, location_detail, imei, action, notes)
  VALUES (v_sim_id, p_sim_number, v_location_id, p_location_name, p_location_detail, p_imei, p_action, p_notes)
  RETURNING * INTO v_installation;

  RETURN jsonb_build_object(
    'success', true,
    'created_sim', v_created_sim,
    'needs_review', v_sim.needs_review OR v_created_sim,
    'replaced_sim', to_jsonb(v_replaced_sim),
    'sim', to_jsonb(v_sim),
    'installation', to_jsonb(v_installation)
  );
END;
$$;

-- Permisos para que anon pueda ejecutar la función
GRANT EXECUTE ON FUNCTION register_installation TO anon, authenticated;
