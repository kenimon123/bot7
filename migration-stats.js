const fs = require('fs');
const path = require('path');

// Ruta a los archivos de datos
const statsPath = path.join(__dirname, './data/ticketStats.json');
const ticketsPath = path.join(__dirname, './data/tickets.json');

// Función para migrar las estadísticas
async function migrateStats() {
  console.log('🔄 Iniciando migración de estadísticas...');
  
  try {
    // Verificar que los archivos existen
    if (!fs.existsSync(statsPath)) {
      console.error('❌ No se encontró el archivo de estadísticas.');
      return;
    }
    
    if (!fs.existsSync(ticketsPath)) {
      console.error('❌ No se encontró el archivo de tickets.');
      return;
    }
    
    // Cargar datos
    const statsData = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    const ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    
    // Comprobar si ya está en el nuevo formato
    if (statsData.servers) {
      console.log('✅ Las estadísticas ya están en el nuevo formato. No es necesaria la migración.');
      return;
    }
    
    // Crear estructura para el nuevo formato
    const newStatsData = {
      servers: {},
      lastUpdate: statsData.lastUpdate || new Date().toISOString()
    };
    
    // Agrupar tickets por servidor
    const ticketsByServer = {};
    
    for (const ticket of ticketsData.tickets) {
      const guildId = ticket.guildId;
      
      if (!guildId) continue;
      
      if (!ticketsByServer[guildId]) {
        ticketsByServer[guildId] = [];
      }
      
      ticketsByServer[guildId].push(ticket);
    }
    
    // Procesar cada servidor
    for (const [guildId, tickets] of Object.entries(ticketsByServer)) {
      // Inicializar estructura para este servidor
      newStatsData.servers[guildId] = {
        userStats: {}
      };
      
      // Procesar estadísticas de usuarios para este servidor
      for (const [userId, userData] of Object.entries(statsData.userStats || {})) {
        // Verificar si este usuario tiene tickets en este servidor
        const userTickets = tickets.filter(t => 
          t.claimedBy === userId || 
          t.closedBy === userId
        );
        
        if (userTickets.length > 0) {
          // Añadir este usuario a las estadísticas de este servidor
          newStatsData.servers[guildId].userStats[userId] = {
            claimed: userData.claimed || 0,
            closed: userData.closed || 0,
            inactive: userData.inactive || 0
          };
        }
      }
    }
    
    // Crear copia de seguridad del archivo original
    const backupPath = `${statsPath}.backup-${Date.now()}`;
    fs.copyFileSync(statsPath, backupPath);
    console.log(`📦 Copia de seguridad creada en: ${backupPath}`);
    
    // Guardar el nuevo formato
    fs.writeFileSync(statsPath, JSON.stringify(newStatsData, null, 2));
    
    console.log('✅ Migración completada con éxito.');
    console.log(`📊 Total de servidores procesados: ${Object.keys(newStatsData.servers).length}`);
    
    for (const [guildId, serverData] of Object.entries(newStatsData.servers)) {
      console.log(`   - Servidor ${guildId}: ${Object.keys(serverData.userStats).length} usuarios`);
    }
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
  }
}

// Ejecutar la migración
migrateStats();