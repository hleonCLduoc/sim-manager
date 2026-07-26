const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const filePath = path.join(__dirname, '..', 'Libro1.xlsx');
const outputPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260724000000_seed_data_from_excel.sql');
const workbook = xlsx.readFile(filePath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
const rows = data.slice(1);

const sims = [];
const locationMap = new Map(); // key: name|detail -> { id, name, detail }
const installations = [];

function normalize(str) {
  return String(str || '').trim();
}

function excelDateToIso(excelDate) {
  if (!excelDate || typeof excelDate !== 'number') return null;
  // Excel date serial number: días desde 1900-01-01 (con bug de 1900)
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const ms = excelDate * 24 * 60 * 60 * 1000;
  return new Date(epoch.getTime() + ms).toISOString();
}

rows.forEach((row, idx) => {
  const bus = normalize(row[0]);
  const linea = normalize(row[1]);
  const imei = normalize(row[2]);
  const d = normalize(row[3]);
  const g = normalize(row[6]);
  const plan = normalize(row[7]);
  const i = normalize(row[8]);
  const actualizado = row[10];

  if (!g) return;

  const isInstalled = i === g;
  const status = isInstalled ? 'instalada' : 'libre';

  sims.push({
    sim_number: g,
    plan: plan || null,
    status,
    imei: isInstalled ? (imei || null) : null,
    needs_review: false,
  });

  if (isInstalled) {
    const locationName = bus || 'Sin ubicación';
    const locationDetail = linea || null;
    const locKey = `${locationName}|${locationDetail || ''}`;

    if (!locationMap.has(locKey)) {
      locationMap.set(locKey, {
        id: uuidv4(),
        name: locationName,
        detail: locationDetail,
      });
    }

    const location = locationMap.get(locKey);

    installations.push({
      id: uuidv4(),
      sim_number: g,
      location_id: location.id,
      location_name: location.name,
      location_detail: location.detail,
      imei: imei || null,
      action: 'instalar',
      installed_at: excelDateToIso(actualizado) || new Date().toISOString(),
      notes: d && d !== g ? `SIM física anterior registrada en Excel: ${d}` : null,
    });
  }
});

const lines = [];
lines.push(`-- Migración de datos desde Libro1.xlsx`);
lines.push(`-- Fecha de generación: ${new Date().toISOString()}`);
lines.push(`-- Total SIMs: ${sims.length}`);
lines.push(`-- Total ubicaciones: ${locationMap.size}`);
lines.push(`-- Total instalaciones: ${installations.length}`);
lines.push('');
lines.push('BEGIN;');
lines.push('');

lines.push('-- 1. Insertar ubicaciones');
lines.push('INSERT INTO locations (id, name, detail) VALUES');
const locationValues = Array.from(locationMap.values()).map((loc, i, arr) => {
  const comma = i < arr.length - 1 ? ',' : '';
  return `  ('${loc.id}', ${escapeSql(loc.name)}, ${escapeSql(loc.detail)})${comma}`;
});
lines.push(...locationValues);
lines.push('ON CONFLICT (name, detail) DO UPDATE SET name = EXCLUDED.name;');
lines.push('');

lines.push('-- 2. Insertar SIMs (inventario maestro)');
lines.push('INSERT INTO sims (sim_number, plan, status, imei, needs_review) VALUES');
const simValues = sims.map((sim, i, arr) => {
  const comma = i < arr.length - 1 ? ',' : '';
  return `  (${escapeSql(sim.sim_number)}, ${escapeSql(sim.plan)}, ${escapeSql(sim.status)}, ${escapeSql(sim.imei)}, ${sim.needs_review})${comma}`;
});
lines.push(...simValues);
lines.push('ON CONFLICT (sim_number) DO UPDATE SET');
lines.push('  plan = EXCLUDED.plan,');
lines.push('  status = EXCLUDED.status,');
lines.push('  imei = COALESCE(EXCLUDED.imei, sims.imei),');
lines.push('  needs_review = EXCLUDED.needs_review,');
lines.push('  updated_at = now();');
lines.push('');

lines.push('-- 3. Insertar instalaciones actuales');
lines.push('INSERT INTO installations (id, sim_id, sim_number, location_id, location_name, location_detail, imei, action, installed_at, notes) VALUES');
const installationValues = installations.map((inst, i, arr) => {
  const comma = i < arr.length - 1 ? ',' : ';';
  return `  ('${inst.id}', (SELECT id FROM sims WHERE sim_number = ${escapeSql(inst.sim_number)}), ${escapeSql(inst.sim_number)}, (SELECT id FROM locations WHERE name = ${escapeSql(inst.location_name)} AND detail IS NOT DISTINCT FROM ${escapeSql(inst.location_detail)} LIMIT 1), ${escapeSql(inst.location_name)}, ${escapeSql(inst.location_detail)}, ${escapeSql(inst.imei)}, ${escapeSql(inst.action)}, ${escapeSql(inst.installed_at)}, ${escapeSql(inst.notes)})${comma}`;
});
lines.push(...installationValues);
lines.push('');
lines.push('COMMIT;');

fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
console.log(`Archivo generado: ${outputPath}`);
console.log(`- SIMs: ${sims.length}`);
console.log(`- Ubicaciones: ${locationMap.size}`);
console.log(`- Instalaciones: ${installations.length}`);

function escapeSql(value) {
  if (value === null || value === undefined) return 'NULL';
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}
