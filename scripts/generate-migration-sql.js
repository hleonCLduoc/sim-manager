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

const contractedBySim = new Map(); // sim -> { sim_number, plan }
const installedBySim = new Map(); // sim -> installation payload
const locationMap = new Map(); // key: name|detail -> { id, name, detail }

const anomalies = {
  installedNotContracted: [],
  duplicateInstalledRows: [],
};

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
  const g = normalize(row[6]); // Base de SIMs contratadas
  const plan = normalize(row[7]);

  if (!g) return;

  // Maestro contratado (columna G/H), una sola vez por SIM.
  if (!contractedBySim.has(g)) {
    contractedBySim.set(g, {
      sim_number: g,
      plan: plan || null,
    });
  }
});

rows.forEach((row, idx) => {
  const bus = normalize(row[0]);
  const linea = normalize(row[1]);
  const imei = normalize(row[2]);
  const d = normalize(row[3]);
  const actualizado = row[10];

  // Regla de negocio: D es la SIM instalada actualmente en A/B.
  if (!d) return;

  // Debe existir primero en base contratada G.
  if (!contractedBySim.has(d)) {
    anomalies.installedNotContracted.push({ row: idx + 2, sim: d, bus, linea });
    return;
  }

  if (installedBySim.has(d)) {
    const previous = installedBySim.get(d);
    anomalies.duplicateInstalledRows.push({
      sim: d,
      previousRow: previous.row,
      newRow: idx + 2,
    });
  }

  installedBySim.set(d, {
    row: idx + 2,
    id: uuidv4(),
    sim_number: d,
    location_name: bus || 'Sin ubicación',
    location_detail: linea || null,
    imei: imei || null,
    action: 'instalar',
    installed_at: excelDateToIso(actualizado) || new Date().toISOString(),
    notes: null,
  });
});

const sims = Array.from(contractedBySim.values()).map((sim) => {
  const installed = installedBySim.get(sim.sim_number);
  return {
    sim_number: sim.sim_number,
    plan: sim.plan,
    status: installed ? 'instalada' : 'libre',
    imei: installed ? installed.imei : null,
    needs_review: false,
  };
});

const installations = Array.from(installedBySim.values()).map((inst) => {
  const locKey = `${inst.location_name}|${inst.location_detail || ''}`;
  if (!locationMap.has(locKey)) {
    locationMap.set(locKey, {
      id: uuidv4(),
      name: inst.location_name,
      detail: inst.location_detail,
    });
  }

  const location = locationMap.get(locKey);
  return {
    id: inst.id,
    sim_number: inst.sim_number,
    location_id: location.id,
    location_name: location.name,
    location_detail: location.detail,
    imei: inst.imei,
    action: inst.action,
    installed_at: inst.installed_at,
    notes: inst.notes,
  };
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
console.log(`- D no contratadas en G (omitidas): ${anomalies.installedNotContracted.length}`);
console.log(`- D duplicadas (se mantiene última fila): ${anomalies.duplicateInstalledRows.length}`);

if (anomalies.installedNotContracted.length > 0) {
  console.log('Primeras D no contratadas en G:', anomalies.installedNotContracted.slice(0, 10));
}

if (anomalies.duplicateInstalledRows.length > 0) {
  console.log('Primeras D duplicadas:', anomalies.duplicateInstalledRows.slice(0, 10));
}

function escapeSql(value) {
  if (value === null || value === undefined) return 'NULL';
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}
