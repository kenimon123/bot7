const fs = require('fs');
const path = require('path');

module.exports = (client) => {
  const eventsPath = path.join(__dirname, '../events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  
  console.log(`Cargando ${eventFiles.length} eventos...`);
  
  for (const file of eventFiles) {
    try {
      const filePath = path.join(eventsPath, file);
      const event = require(filePath);
      const eventName = file.split('.')[0];
      
      // Si el archivo exporta una función, se considera un manejador de eventos
      if (typeof event === 'function') {
        console.log(`📡 Registrando evento: ${eventName}`);
        
        // Registrar el evento con el cliente
        client.on(eventName, (...args) => event(client, ...args));
      } else {
        console.warn(`⚠️ El archivo ${file} no exporta una función de evento válida.`);
      }
    } catch (error) {
      console.error(`Error al cargar evento ${file}:`, error);
    }
  }
};