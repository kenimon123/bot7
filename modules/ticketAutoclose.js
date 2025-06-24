const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
  const configPath = path.join(__dirname, '../data/autocloseConfig.json');
  const activityPath = path.join(__dirname, '../data/ticketActivity.json');
  const statsPath = path.join(__dirname, '../data/ticketStats.json');
  
  // Cargar o crear configuración
  const loadConfig = () => {
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
      
      // Configuración por defecto
      const defaultConfig = {
        enabled: true,
        warningHours: 24, // Horas de inactividad antes de advertir
        closeHours: 48,   // Horas de inactividad antes de cerrar
        exemptCategories: [] // Categorías exentas del cierre automático
      };
      
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      return defaultConfig;
    } catch (error) {
      console.error('Error al cargar configuración de cierre automático:', error);
      return {
        enabled: false,
        warningHours: 24,
        closeHours: 48,
        exemptCategories: []
      };
    }
  };
  
  // Guardar configuración
  const saveConfig = (config) => {
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      console.error('Error al guardar configuración de cierre automático:', error);
      return false;
    }
  };
  
  // Cargar estadísticas
  const loadStats = () => {
    try {
      if (fs.existsSync(statsPath)) {
        return JSON.parse(fs.readFileSync(statsPath, 'utf8'));
      }
      return { userStats: {}, lastUpdate: new Date().toISOString() };
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
      return { userStats: {}, lastUpdate: new Date().toISOString() };
    }
  };
  
  // Actualizar estadísticas - añadiendo tracking de tickets inactivos cerrados
  const updateStats = (userId, action) => {
    try {
      if (!userId || !action) return false;
      
      const stats = loadStats();
      
      if (!stats.userStats[userId]) {
        stats.userStats[userId] = { claimed: 0, closed: 0, inactive: 0 };
      }
      
      if (action === 'claim') {
        stats.userStats[userId].claimed = (stats.userStats[userId].claimed || 0) + 1;
      } else if (action === 'close') {
        stats.userStats[userId].closed = (stats.userStats[userId].closed || 0) + 1;
      } else if (action === 'inactive') {
        // Nueva estadística para tickets inactivos
        stats.userStats[userId].inactive = (stats.userStats[userId].inactive || 0) + 1;
      }
      
      stats.lastUpdate = new Date().toISOString();
      fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
      return true;
    } catch (error) {
      console.error('Error al actualizar estadísticas:', error);
      return false;
    }
  };
  
  // Verificar tickets para cierre automático
  const checkInactiveTickets = async () => {
    const config = loadConfig();
    if (!config.enabled) return;
    
    try {
      // Cargar datos de tickets y actividad
      const ticketSystem = require('./ticketSystem')(client);
      const ticketData = ticketSystem.loadTickets();
      
      let activityData = {};
      if (fs.existsSync(activityPath)) {
        activityData = JSON.parse(fs.readFileSync(activityPath, 'utf8'));
      }
      
      const now = Date.now();
      const warningThreshold = now - (config.warningHours * 60 * 60 * 1000);
      const closeThreshold = now - (config.closeHours * 60 * 60 * 1000);
      
      // Verificar cada ticket abierto
      for (const ticket of ticketData.tickets) {
        if (ticket.status !== 'open') continue;
        
        // Saltar tickets en categorías exentas
        if (config.exemptCategories.includes(ticket.category)) continue;
        
        const activity = activityData[ticket.channelId] || {
          lastActivityTime: new Date(ticket.createdAt).getTime(),
          warned: false
        };
        
        const guild = client.guilds.cache.get(ticket.guildId);
        if (!guild) continue;
        
        const channel = guild.channels.cache.get(ticket.channelId);
        if (!channel) continue; // El canal ya no existe
        
        // Verificar si es hora de cerrar el ticket
        if (activity.lastActivityTime < closeThreshold) {
          // Cerrar el ticket
          console.log(`Cerrando automáticamente ticket #${ticket.id} por inactividad`);
          
          // Crear embed de notificación
          const embed = new EmbedBuilder()
            .setTitle('🕒 Ticket Cerrado Automáticamente')
            .setColor('#FF0000')
            .setDescription(`Este ticket ha sido cerrado automáticamente después de **${config.closeHours} horas** de inactividad.`)
            .setTimestamp();
          
          await channel.send({ embeds: [embed] });
          
          // Registrar estadística para el staff que tenía el ticket asignado
          if (ticket.claimedBy) {
            updateStats(ticket.claimedBy, 'inactive');
          }
          
          // Marcar como cerrado en los datos
          ticket.status = 'closed';
          ticket.closedAt = new Date().toISOString();
          ticket.closedBy = client.user.id;
          ticket.closedReason = 'Inactividad - Cierre automático';
          
          ticketSystem.saveTickets(ticketData);
          
          // Generar transcripción
          try {
            const transcriptModule = require('./ticketTranscript')(client);
            const transcript = await transcriptModule.generateTranscript(channel);
            
            if (transcript) {
              // Buscar canal de logs
              const logChannelName = client.config.ticketLogChannel;
              const logChannel = guild.channels.cache.find(c => c.name === logChannelName);
              
              if (logChannel) {
                const logEmbed = new EmbedBuilder()
                  .setTitle(`Ticket #${ticket.id} - Cerrado por Inactividad`)
                  .setColor('#FF5500')
                  .setDescription(`El ticket fue cerrado automáticamente después de ${config.closeHours} horas sin actividad.`)
                  .addFields(
                    { name: 'Usuario', value: `<@${ticket.userId}>`, inline: true },
                    { name: 'Categoría', value: ticket.category || 'No especificada', inline: true },
                    { name: 'Asignado a', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Nadie', inline: true }
                  )
                  .setTimestamp();
                
                await logChannel.send({ 
                  embeds: [logEmbed],
                  files: [transcript.file]
                });
              }
            }
          } catch (err) {
            console.error('Error al generar transcripción para ticket inactivo:', err);
          }
          
          // Eliminar el canal después de un breve retraso
          setTimeout(() => {
            channel.delete()
              .catch(error => console.error(`Error al eliminar canal de ticket por inactividad: ${error}`));
          }, 5000);
          
          // No necesitamos seguir procesando este ticket
          continue;
        }
        
        // Verificar si es hora de advertir
        if (!activity.warned && activity.lastActivityTime < warningThreshold) {
          // Enviar advertencia
          console.log(`Enviando advertencia de cierre al ticket #${ticket.id} por inactividad`);
          
          const embed = new EmbedBuilder()
            .setTitle('⚠️ Advertencia de Inactividad')
            .setColor('#FFA500')
            .setDescription(`Este ticket no ha tenido actividad en las últimas **${config.warningHours} horas**.\n\nSe cerrará automáticamente en **${config.closeHours - config.warningHours} horas más** si no hay nueva actividad.`)
            .setFooter({ text: 'Envía cualquier mensaje para mantener el ticket abierto' })
            .setTimestamp();
          
          await channel.send({ 
            content: `<@${ticket.userId}> ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : ''}`,
            embeds: [embed] 
          });
          
          // Actualizar estado de advertencia
          activity.warned = true;
          activityData[ticket.channelId] = activity;
          fs.writeFileSync(activityPath, JSON.stringify(activityData, null, 2));
        }
      }
    } catch (error) {
      console.error('Error en verificación de cierre automático:', error);
    }
  };
  
  // Actualizar actividad de un ticket
  const updateActivity = (channelId, userId) => {
    try {
      // Cargar datos de actividad
      let activityData = {};
      if (fs.existsSync(activityPath)) {
        activityData = JSON.parse(fs.readFileSync(activityPath, 'utf8'));
      }
      
      // Actualizar o crear registro de actividad
      activityData[channelId] = {
        lastActivityTime: Date.now(),
        lastActiveUser: userId,
        warned: false  // Resetear advertencia si hubo nueva actividad
      };
      
      // Guardar datos actualizados
      fs.writeFileSync(activityPath, JSON.stringify(activityData, null, 2));
      return true;
    } catch (error) {
      console.error('Error al actualizar actividad:', error);
      return false;
    }
  };
  
  // Inicializar sistema
  const initialize = () => {
    console.log('Sistema de cierre automático de tickets inicializado');
    
    // Crear archivos si no existen
    loadConfig();
    if (!fs.existsSync(activityPath)) {
      fs.writeFileSync(activityPath, JSON.stringify({}, null, 2));
    }
    
    // Configurar verificación periódica cada 30 minutos
    setInterval(checkInactiveTickets, 30 * 60 * 1000);
    
    // Verificación inicial después de 5 minutos
    setTimeout(checkInactiveTickets, 5 * 60 * 1000);
  };
  
  return {
    initialize,
    loadConfig,
    saveConfig,
    updateActivity,
    checkInactiveTickets,
    updateStats
  };
};