/*
Reset de inventario SIM antes de recargar seed.

ATENCION:
- Este script elimina TODO el inventario operativo actual.
- No toca auth.users ni profiles.
- Ejecutar primero este script, luego el seed generado desde Excel.
*/

BEGIN;

-- Truncar tablas relacionadas en una sola sentencia para respetar FKs
TRUNCATE TABLE installations, sims, locations;

COMMIT;
