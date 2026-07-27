/*
Reset de inventario SIM antes de recargar seed.

ATENCION:
- Este script elimina TODO el inventario operativo actual.
- No toca auth.users ni profiles.
- Ejecutar primero este script, luego el seed generado desde Excel.
*/

BEGIN;

-- 1) Eliminar historial primero por FK
TRUNCATE TABLE installations;

-- 2) Limpiar maestro y catalogo
TRUNCATE TABLE sims;
TRUNCATE TABLE locations;

COMMIT;
