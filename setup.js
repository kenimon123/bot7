const fs = require('fs');
const path = require('path');

// Asegurarse de que existan los directorios
const dirs = [
  './commands',
  './commands/general',
  './commands/license',
  './commands/ticket',
  './modules',
  './data'
];

// Crear directorios si no existen
console.log('Creando directorios necesarios...');
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Creado: ${dir}`);
  } else {
    console.log(`Ya existe: ${dir}`);
  }
});

// Verificar y crear archivos de datos
const dataFiles = {
  './data/licenses.json': { licenses: {} },
  './data/tickets.json': { tickets: [], counter: 0 },
  './data/ticketStats.json': { userStats: {}, lastUpdate: new Date().toISOString() }
};

console.log('\nVerificando archivos de datos...');
Object.entries(dataFiles).forEach(([file, defaultContent]) => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultContent, null, 2));
    console.log(`Creado: ${file}`);
  } else {
    console.log(`Ya existe: ${file}`);
  }
});

// Los comandos que se deben verificar
const commandsToCheck = [
  'commands/general/help.js',
  'commands/license/generate.js',
  'commands/license/list.js',
  'commands/license/verify.js',
  'commands/ticket/close.js',
  'commands/ticket/list.js',
  'commands/ticket/move.js',
  'commands/ticket/setup.js',
  'commands/ticket/stats.js'
];

console.log('\nVerificando comandos...');
commandsToCheck.forEach(file => {
  if (!fs.existsSync(file)) {
    console.log(`⚠️ Falta el archivo: ${file}`);
  } else {
    console.log(`✅ Existe: ${file}`);
  }
});

// Verificar módulos esenciales
const modulesToCheck = [
  'modules/licenseSystem.js',
  'modules/ticketSystem.js'
];

console.log('\nVerificando módulos...');
modulesToCheck.forEach(file => {
  if (!fs.existsSync(file)) {
    console.log(`⚠️ Falta el módulo: ${file}`);
  } else {
    console.log(`✅ Existe: ${file}`);
  }
});

console.log('\n¡Verificación completada!');