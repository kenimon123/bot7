const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
  // Ruta para almacenar la configuración de recordatorios
  const reminderConfigPath = path.join(__dirname, '../data/reminderConfig.json');
  const ticketActivityPath = path.join(__dirname, '../data/ticketActivity.json');
  
  // Cargar configuración de recordatorios
  const loadReminderConfig = () => {
    try {
      if (fs.existsSync(reminderConfigPath)) {
        return JSON.parse(fs.readFileSync(reminderConfigPath, 'utf8'));
      }
      
      // Configuración por defecto
      const defaultConfig = {
        enabled: true,
        reminderIntervals: [2, 6, 24], // Horas antes de enviar recordatorios (2h, 6h, 24h)
        channelReminders: true, // Recordatorios en el canal
        dmReminders: true       // Recordatorios por DM
      };
      
      fs.writeFileSync(reminderConfigPath, JSON.stringify(defaultConfig, null, 2));
      return defaultConfig;
    } catch (error) {
      console.error('Error al cargar configuración de recordatorios:', error);
      return {
        enabled: true,
        reminderIntervals: [2, 6, 24],
        channelReminders: true,
        dmReminders: true
      };
    }
  };
  
  // Guardar configuración de recordatorios
  const saveReminderConfig = (config) => {
    try {
      fs.writeFileSync(reminderConfigPath, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      console.error('Error al guardar configuración de recordatorios:', error);
      return false;
    }
  };
  
  // Cargar actividad de tickets
  const loadTicketActivity = () => {
    try {
      if (fs.existsSync(ticketActivityPath)) {
        return JSON.parse(fs.readFileSync(ticketActivityPath, 'utf8'));
      }
      return {};
    } catch (error) {
      console.error('Error al cargar actividad de tickets:', error);
      return {};
    }
  };
  
  // Guardar actividad de tickets
  const saveTicketActivity = (activity) => {
    try {
      fs.writeFileSync(ticketActivityPath, JSON.stringify(activity, null, 2));
      return true;
    } catch (error) {
      console.error('Error al guardar actividad de tickets:', error);
      return false;
    }
  };
  
  // Actualizar la actividad de un ticket
  const updateTicketActivity = (channelId, userId) => {
    const activity = loadTicketActivity();
    
    activity[channelId] = {
      lastActivityTime: Date.now(),
      lastActivityUser: userId,
      sentReminders: []
    };
    
    return saveTicketActivity(activity);
  };
  
  // Verificar tickets inactivos y enviar recordatorios
  const checkInactiveTickets = async () => {
    // Solo ejecutar si está habilitado
    const config = loadReminderConfig();
    if (!config.enabled) return;
    
    const ticketSystem = require('./ticketSystem')(client);
    const activityData = loadTicketActivity();
    const ticketData = ticketSystem.loadTickets();
    
    // Hora actual
    const now = Date.now();
    
    // Verificar cada ticket abierto
    for (const ticket of ticketData.tickets) {
      if (ticket.status !== 'open' || !ticket.claimedBy) continue;
      
      // Obtener datos de actividad del ticket
      const activity = activityData[ticket.channelId] || {
        lastActivityTime: ticket.createdAt ? new Date(ticket.createdAt).getTime() : now,
        lastActivityUser: ticket.userId,
        sentReminders: []
      };
      
      // Ver si debemos enviar recordatorios para este ticket
      for (const intervalHours of config.reminderIntervals) {
        const intervalMs = intervalHours * 60 * 60 * 1000;
        const timeThreshold = now - intervalMs;
        
        // Verificar si la última actividad es más antigua que el intervalo
        // y que no hayamos enviado ya un recordatorio para este intervalo
        if (activity.lastActivityTime < timeThreshold && 
            !activity.sentReminders.includes(intervalHours)) {
          
          // Marcar que enviamos este recordatorio
          activity.sentReminders.push(intervalHours);
          activityData[ticket.channelId] = activity;
          
          // Intentar enviar recordatorios
          await sendReminder(ticket, intervalHours);
        }
      }
    }
    
    // Guardar datos actualizados de actividad
    saveTicketActivity(activityData);
  };
  
  // Enviar un recordatorio para un ticket
  const sendReminder = async (ticket, hours) => {
    try {
      const config = loadReminderConfig();
      
      // Buscar información necesaria
      const guild = client.guilds.cache.get(ticket.guildId);
      if (!guild) return false;
      
      const channel = guild.channels.cache.get(ticket.channelId);
      if (!channel) return false;
      
      // Obtener usuario que reclamó el ticket
      let staffUser;
      try {
        staffUser = await client.users.fetch(ticket.claimedBy);
      } catch (err) {
        console.error(`No se pudo encontrar al usuario ${ticket.claimedBy}:`, err);
        return false;
      }
      
      // Obtener el usuario que creó el ticket
      let ticketUser;
      try {
        ticketUser = await client.users.fetch(ticket.userId);
      } catch (err) {
        ticketUser = { tag: 'Usuario desconocido' };
      }
      
      // Crear el embed para el recordatorio
      const embed = new EmbedBuilder()
        .setTitle(`⏰ Recordatorio - Ticket #${ticket.id}`)
        .setColor('#FFA500')
        .setDescription(`Este ticket lleva **${hours} horas** sin actividad.`)
        .addFields(
          { name: 'Usuario', value: ticketUser.tag || 'Desconocido', inline: true },
          { name: 'Categoría', value: ticket.category || 'General', inline: true },
          { name: 'Asignado a', value: staffUser.tag, inline: true },
          { name: 'Enlace', value: `[Ir al ticket](https://discord.com/channels/${ticket.guildId}/${ticket.channelId})` }
        )
        .setTimestamp();
      
      // Enviar recordatorio en el canal si está habilitado
      if (config.channelReminders) {
        try {
          await channel.send({ 
            content: `<@${ticket.claimedBy}>, este ticket necesita tu atención.`,
            embeds: [embed]
          });
        } catch (err) {
          console.error(`Error al enviar recordatorio en canal para ticket #${ticket.id}:`, err);
        }
      }
      
      // Enviar recordatorio por DM si está habilitado
      if (config.dmReminders) {
        try {
          await staffUser.send({ 
            content: `Tienes un ticket sin actividad en ${guild.name}:`,
            embeds: [embed]
          });
        } catch (err) {
          console.error(`Error al enviar DM de recordatorio para ticket #${ticket.id}:`, err);
          
          // Intentar notificar en el canal que no se pudo enviar DM
          if (config.channelReminders) {
            await channel.send(`⚠️ No se pudo enviar un recordatorio por DM a ${staffUser}.`);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Error al enviar recordatorio para ticket #${ticket.id}:`, error);
      return false;
    }
  };
  
  // Iniciar el sistema de recordatorios
  const initialize = () => {
    console.log('Sistema de recordatorios de tickets inicializado.');
    
    // Crear archivos si no existen
    if (!fs.existsSync(reminderConfigPath)) {
      const defaultConfig = {
        enabled: true,
        reminderIntervals: [2, 6, 24], // Horas
        channelReminders: true,
        dmReminders: true
      };
      fs.writeFileSync(reminderConfigPath, JSON.stringify(defaultConfig, null, 2));
    }
    
    if (!fs.existsSync(ticketActivityPath)) {
      fs.writeFileSync(ticketActivityPath, JSON.stringify({}, null, 2));
    }
    
    // Iniciar verificación periódica (cada 15 minutos)
    setInterval(checkInactiveTickets, 15 * 60 * 1000);
    
    // También ejecutar una verificación inicial
    setTimeout(checkInactiveTickets, 60 * 1000);
  };
  
  // Exportar funciones
  return {
    initialize,
    updateTicketActivity,
    loadReminderConfig,
    saveReminderConfig,
    checkInactiveTickets
  };
};