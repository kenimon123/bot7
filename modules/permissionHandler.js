const { PermissionFlagsBits } = require('discord.js');

module.exports = (client) => {
  // Cache de roles para mejorar rendimiento
  const roleCache = new Map();
  
  // Limpiar caché cada 5 minutos para roles actualizados
  setInterval(() => roleCache.clear(), 5 * 60 * 1000);
  
  // Verificar si existe o crear rol de staff
  const ensureStaffRole = async (guild) => {
    try {
      if (!guild) return null;
      
      // Verificar si el rol ya existe
      let staffRole = guild.roles.cache.find(r => r.name === client.config.supportRole);
      
      // Si no existe, crearlo
      if (!staffRole) {
        console.log(`Creando rol de staff "${client.config.supportRole}" en ${guild.name}`);
        
        staffRole = await guild.roles.create({
          name: client.config.supportRole,
          color: '#00AA00',  // Verde
          reason: 'Rol necesario para el sistema de tickets'
        });
        
        console.log(`Rol "${client.config.supportRole}" creado con éxito.`);
      }
      
      return staffRole;
    } catch (error) {
      console.error(`Error al crear/verificar rol de staff en ${guild.name}:`, error);
      return null;
    }
  };
  
  // Verificar si un miembro tiene permisos de soporte/staff
  const canManageTickets = (member) => {
    if (!member) return false;
    
    try {
      // Permisos de administrador
      if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
      }
      
      // Verificar roles en caché primero (caso insensitivo)
      const guildId = member.guild.id;
      const userId = member.id;
      const cacheKey = `${guildId}:${userId}:support`;
      
      if (roleCache.has(cacheKey)) {
        return roleCache.get(cacheKey);
      }
      
      // Buscar todos los posibles nombres de roles de soporte
      const supportRoleNames = [
        client.config.supportRole,
        'Staff',
        'STAFF',
        'staff',
        'Support Team',
        'support',
        'Soporte',
        'soporte',
        'Helper',
        'Mod',
        'Moderator'
      ];
      
      // Verificar cada rol posible
      const hasRole = member.roles.cache.some(role => {
        return supportRoleNames.some(name => 
          role.name.toLowerCase() === name.toLowerCase()
        );
      });
      
      // Guardar resultado en caché
      roleCache.set(cacheKey, hasRole);
      
      return hasRole;
    } catch (error) {
      console.error('Error al verificar permisos de tickets:', error);
      return false;
    }
  };
  
  // Verificar permisos para sistema de licencias
  const canManageLicenses = (member) => {
    if (!member) return false;
    
    try {
      // Permisos de administrador
      if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
      }
      
      // Verificar caché
      const guildId = member.guild.id;
      const userId = member.id;
      const cacheKey = `${guildId}:${userId}:license`;
      
      if (roleCache.has(cacheKey)) {
        return roleCache.get(cacheKey);
      }
      
      // Posibles nombres del rol de licencias
      const licenseRoleNames = [
        client.config.licenseRole,
        'License Manager',
        'Licencias',
        'licencias',
        'License Admin'
      ];
      
      // Verificar cada rol posible (insensible a mayúsculas/minúsculas)
      const hasRole = member.roles.cache.some(role => {
        return licenseRoleNames.some(name => 
          role.name.toLowerCase() === name.toLowerCase()
        );
      });
      
      // Guardar resultado en caché
      roleCache.set(cacheKey, hasRole);
      
      return hasRole;
    } catch (error) {
      console.error('Error al verificar permisos de licencias:', error);
      return false;
    }
  };
  
  // Verificar si puede interactuar con un ticket específico
  const canInteractWithTicket = (member, ticket) => {
    // Si no hay miembro o ticket válido
    if (!member || !ticket) return false;
    
    try {
      // Permisos de administrador o rol de soporte
      if (canManageTickets(member)) {
        return true;
      }
      
      // Es el creador del ticket
      if (ticket.userId === member.id) {
        return true;
      }
      
      // Si el ticket tiene campo de usuarios adicionales
      if (ticket.additionalUsers && Array.isArray(ticket.additionalUsers)) {
        return ticket.additionalUsers.includes(member.id);
      }
      
      return false;
    } catch (error) {
      console.error('Error al verificar permisos para interactuar con ticket:', error);
      return false;
    }
  };
  
  return {
    canManageTickets,
    canManageLicenses,
    canInteractWithTicket,
    ensureStaffRole,
    
    // Nueva función para depuración
    logPermissionCheck: (member, requiredRole) => {
      if (!member) return 'Error: Miembro no válido';
      
      const userRoles = member.roles.cache.map(r => r.name).join(', ');
      return `Usuario: ${member.user.tag} (${member.id})\nRoles: ${userRoles}\nRequiere: ${requiredRole}`;
    }
  };
};