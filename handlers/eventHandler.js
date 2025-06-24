const fs = require('fs');
const path = require('path');

module.exports = (client) => {
  // Evitar registrar handlers múltiples veces
  if (client._eventsLoaded) {
    console.log("⚠️ Los eventos ya fueron cargados anteriormente. Evitando duplicación.");
    return;
  }

  try {
    // Cargar eventos desde el directorio
    const eventsPath = path.join(__dirname, '../events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    
    console.log(`Cargando ${eventFiles.length} archivos de eventos...`);
    
    for (const file of eventFiles) {
      try {
        const filePath = path.join(eventsPath, file);
        // Limpiar caché para recargar el archivo si ha cambiado
        delete require.cache[require.resolve(filePath)];
        
        const event = require(filePath);
        const eventName = file.split('.')[0];
        
        // Registrar el evento
        if (eventName === 'ready') {
          // El evento ready solo debe dispararse una vez
          client.once(eventName, (...args) => event(client, ...args));
        } else {
          client.on(eventName, (...args) => event(client, ...args));
        }
        
        console.log(`✅ Evento cargado: ${eventName}`);
      } catch (error) {
        console.error(`❌ Error al cargar evento ${file}:`, error);
      }
    }
    
    // Marcar como cargado para evitar duplicación
    client._eventsLoaded = true;
    console.log('Eventos cargados correctamente.');
  } catch (error) {
    console.error('Error al cargar eventos:', error);
  }
};