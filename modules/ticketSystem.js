const fs = require("fs");
const path = require("path");
const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");

module.exports = (client) => {
  // Rutas de los archivos
  const ticketReminders = require("./ticketReminders");
  const ticketLock = require('./ticketLock');
  const ticketsPath = path.join(__dirname, "../data/tickets.json");
  const statsPath = path.join(__dirname, "../data/ticketStats.json");

  // Validar si un canal es un ticket (versión mejorada)
const isTicketChannel = (channel) => {
  if (!channel) return false;
  
  // Patrones de nombre de canales de tickets
  const patterns = [
    /^.+-\d+$/, // Formato como "soporte-general-123" o "ticket-123"
    /^ticket-\d+$/, // Formato estándar "ticket-123"
    /^soporte-\d+$/ // Formato alternativo "soporte-123"
  ];
  
  // Verificar si el nombre del canal coincide con alguno de los patrones
  return channel.name && patterns.some(pattern => pattern.test(channel.name));
};

  // Rastrear solicitudes recientes para evitar duplicados
  const recentTicketRequests = new Map();
  const closingTickets = new Map();
  const activeTicketCreations = new Set();
  const ticketLocks = new Map();
  const fs = require('fs');
  const path = require('path');
  const pendingTicketCreations = new Map();

  // Cargar tickets
  const loadTickets = () => {
    try {
      if (fs.existsSync(ticketsPath)) {
        const fileContent = fs.readFileSync(ticketsPath, "utf8");
        try {
          const data = JSON.parse(fileContent);
          // Verificar estructura
          if (!data.tickets || !Array.isArray(data.tickets)) {
            console.error(
              "Archivo de tickets corrupto, creando estructura por defecto"
            );
            return { tickets: [], counter: 0 };
          }
          return data;
        } catch (jsonError) {
          console.error("Error al parsear tickets.json:", jsonError);
          // Crear copia de seguridad
          const backupPath = `${ticketsPath}.corrupto.${Date.now()}`;
          fs.copyFileSync(ticketsPath, backupPath);
          return { tickets: [], counter: 0 };
        }
      }
      return { tickets: [], counter: 0 };
    } catch (error) {
      console.error("Error al cargar tickets:", error);
      return { tickets: [], counter: 0 };
    }
  };

  // Guardar tickets
  const saveTickets = (data) => {
    try {
      // Crear copia de seguridad antes de sobrescribir
      if (fs.existsSync(ticketsPath)) {
        const backupPath = `${ticketsPath}.backup`;
        fs.copyFileSync(ticketsPath, backupPath);
      }

      fs.writeFileSync(ticketsPath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error("Error al guardar tickets:", error);
      return false;
    }
  };

  // Cargar estadísticas de tickets
  const loadStats = () => {
    try {
      if (fs.existsSync(statsPath)) {
        const fileContent = fs.readFileSync(statsPath, "utf8");
        try {
          const data = JSON.parse(fileContent);
          // Verificar estructura
          if (!data.servers || typeof data.servers !== "object") {
            return { servers: {}, lastUpdate: new Date().toISOString() };
          }
          return data;
        } catch (jsonError) {
          console.error("Error al parsear estadísticas:", jsonError);
          return { servers: {}, lastUpdate: new Date().toISOString() };
        }
      }
      return { servers: {}, lastUpdate: new Date().toISOString() };
    } catch (error) {
      console.error("Error al cargar estadísticas:", error);
      return { servers: {}, lastUpdate: new Date().toISOString() };
    }
  };

  const saveStats = (stats) => {
  try {
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    return true;
  } catch (error) {
    console.error('Error al guardar estadísticas:', error);
    return false;
  }
};

  // Modifica la función updateUserStats
const updateUserStats = (userId, action, guildId) => {
  if (!userId || !action) return false;

  const stats = loadStats();

  // Asegurarse de que exista la estructura para este servidor
  if (!stats.servers) {
    stats.servers = {};
  }
  
  if (!stats.servers[guildId]) {
    stats.servers[guildId] = { userStats: {} };
  }

  // Asegurarse de que exista el usuario en este servidor
  if (!stats.servers[guildId].userStats[userId]) {
    stats.servers[guildId].userStats[userId] = { claimed: 0, closed: 0, inactive: 0 };
  }

  // Actualizar la estadística correspondiente
  if (action === "claim") {
    stats.servers[guildId].userStats[userId].claimed = (stats.servers[guildId].userStats[userId].claimed || 0) + 1;
  } else if (action === "close") {
    stats.servers[guildId].userStats[userId].closed = (stats.servers[guildId].userStats[userId].closed || 0) + 1;
  } else if (action === "inactive") {
    stats.servers[guildId].userStats[userId].inactive = (stats.servers[guildId].userStats[userId].inactive || 0) + 1;
  }

  stats.lastUpdate = new Date().toISOString();
  return saveStats(stats); // Ahora llama a la función que acabamos de definir
};

  // Verificar si un usuario puede crear un nuevo ticket
  const canCreateTicket = (userId, guildId) => {
    if (!userId || !guildId) {
      return {
        allowed: false,
        reason: "invalid_params",
        message: "Parámetros inválidos",
      };
    }

    const data = loadTickets();

    // Verificar si ya tiene un ticket abierto
    const existingTicket = data.tickets.find(
      (t) => t.userId === userId && t.guildId === guildId && t.status === "open"
    );

    if (existingTicket) {
      return {
        allowed: false,
        reason: "existing_ticket",
        message: "Ya tienes un ticket abierto",
      };
    }

    // Verificar tickets recientes (prevenir spam)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000); // 30 minutos atrás

    const recentTickets = data.tickets.filter(
      (t) =>
        t.userId === userId &&
        t.guildId === guildId &&
        new Date(t.createdAt) > thirtyMinAgo
    );

    if (recentTickets.length >= 3) {
      return {
        allowed: false,
        reason: "rate_limit",
        message:
          "Has creado demasiados tickets recientemente. Por favor, espera antes de crear otro.",
      };
    }

    return { allowed: true };
  };


  // Actualizar canal de ranking
  const updateStatsChannel = async (guild) => {
    try {
      if (!guild) {
        console.error("updateStatsChannel: Se requiere un objeto guild válido");
        return false;
      }

      const stats = loadStats();
      const ticketData = loadTickets();

      // Encontrar canal de estadísticas
      const channel = guild.channels.cache.find(
        (c) => c.name === client.config.ticketStatsChannel
      );

      if (!channel) {
        console.log(
          `Canal de estadísticas "${client.config.ticketStatsChannel}" no encontrado en ${guild.name}`
        );
        return false;
      }

      // Filtrar tickets que pertenecen a este servidor
      const serverTickets = ticketData.tickets.filter(
        (t) => t.guildId === guild.id
      );

      // Preparar stats para este servidor
      const totalTickets = serverTickets.length;
      const openTickets = serverTickets.filter(
        (t) => t.status === "open"
      ).length;
      const closedTickets = totalTickets - openTickets;

      // Contar tickets cerrados por inactividad
      const inactiveTickets = serverTickets.filter(
        (t) =>
          t.status === "closed" &&
          t.closedReason &&
          t.closedReason.includes("Inactividad")
      ).length;

      // Obtener estadísticas de este servidor (compatible con ambos formatos)
      const serverStats = stats.servers?.[guild.id] || {};
      const userStats = serverStats.userStats || stats.userStats || {};

      // Preparar ranking de staff con manejo de errores
      const staffRanking = [];

      // Verificar que userStats existe antes de intentar iterarlo
      if (
        userStats &&
        typeof userStats === "object" &&
        Object.keys(userStats).length > 0
      ) {
        // Primero ordenar los entries para obtener el top
        const sortedStaff = Object.entries(userStats)
          .sort((a, b) => b[1].closed - a[1].closed)
          .slice(0, 10); // Top 10

        // Luego obtener los detalles de usuario
        for (const [userId, userData] of sortedStaff) {
          try {
            let username;
            try {
              const user = await client.users.fetch(userId);
              username = user.tag;
            } catch (err) {
              username = `Usuario (ID: ${userId})`;
            }

            staffRanking.push({
              userId,
              username,
              ticketsClosed: userData.closed || 0,
              ticketsInactive: userData.inactive || 0,
            });
          } catch (err) {
            console.error(`Error al obtener datos de usuario ${userId}:`, err);
          }
        }
      }

      let rankingText = "";

      if (staffRanking.length > 0) {
        for (let i = 0; i < staffRanking.length; i++) {
          rankingText += `${i + 1}. **${staffRanking[i].username}**: ${
            staffRanking[i].ticketsClosed
          } tickets cerrados (${
            staffRanking[i].ticketsInactive
          } por inactividad)\n`;
        }
      } else {
        rankingText = "No hay datos de tickets cerrados todavía.";
      }

      const embed = new EmbedBuilder()
        .setTitle("📊 Ranking de Soporte")
        .setColor("#0099FF")
        .setDescription(
          "Clasificación del equipo de soporte basada en tickets cerrados"
        )
        .addFields(
          {
            name: "Estadísticas Generales",
            value: `📝 Tickets totales: **${totalTickets}**\n🔓 Tickets abiertos: **${openTickets}**\n🔒 Tickets cerrados: **${closedTickets}**\n⏰ Cerrados por inactividad: **${inactiveTickets}**`,
          },
          { name: "Ranking de Staff", value: rankingText }
        )
        .setFooter({
          text: `Última actualización: ${new Date().toLocaleString()}`,
        })
        .setTimestamp();

      // Buscar mensaje existente o enviar uno nuevo
      let foundMessage = false;
      try {
        const messages = await channel.messages.fetch({ limit: 10 });
        const botMessage = messages.find((m) => m.author.id === client.user.id);

        if (botMessage) {
          await botMessage.edit({ embeds: [embed] });
          foundMessage = true;
        }
      } catch (err) {
        console.error("Error al buscar mensaje existente:", err);
      }

      if (!foundMessage) {
        await channel.send({ embeds: [embed] });
      }

      return true;
    } catch (error) {
      console.error("Error al actualizar canal de estadísticas:", error);
      return false;
    }
  };

  // Configurar permisos específicos por categoría
  const setupCategoryPermissions = async (channel, category, guild) => {
    try {
      // Verificar si hay configuración especial de permisos para esta categoría
      let categoryConfig = null;
      for (const cat of client.config.ticketCategories) {
        if (cat.name === category) {
          categoryConfig = cat;
          break;
        }
      }

      if (!categoryConfig || !categoryConfig.allowedRoles) {
        // Si no hay configuración especial, usar permisos por defecto
        return;
      }

      // Aplicar permisos específicos por rol
      for (const roleName of categoryConfig.allowedRoles) {
        const role = guild.roles.cache.find((r) => r.name === roleName);
        if (role) {
          await channel.permissionOverwrites.create(role, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          });
        }
      }
    } catch (error) {
      console.error("Error al configurar permisos por categoría:", error);
    }
  };

// Crear un nuevo ticket
const createTicket = async (options) => {
  try {
    // Verificar si se llamó con opciones o con parámetros individuales
    let guild, user, reason, categoryType, additionalInfo;
    
    if (typeof options === 'object' && options !== null && options.user) {
      // Llamada con objeto de opciones (desde el modal)
      guild = options.guild;
      user = options.user;
      reason = options.reason || "Ticket creado desde formulario";
      categoryType = options.category;
      additionalInfo = {
        minecraftNick: options.minecraftNick,
        details: options.details
      };
    } else {
      // Llamada con parámetros individuales (versión antigua)
      guild = options; // Primer parámetro es guild
      user = arguments[1]; 
      reason = arguments[2] || "No especificado";
      categoryType = arguments[3];
      additionalInfo = arguments[4];
    }

    // SISTEMA DE BLOQUEO CRÍTICO - Verificar si el usuario ya tiene un bloqueo activo
    if (ticketLock.isLocked(user.id)) {
      console.log(`[TICKET] Creación bloqueada para ${user.tag || user.username} - tiene un bloqueo activo`);
      return {
        success: false,
        reason: "duplicate_request",
        message: "Ya hay una solicitud de ticket en proceso. Por favor, espera unos segundos."
      };
    }
    
    // Crear un bloqueo para este usuario
    ticketLock.createLock(user.id, 15); // Bloquear por 15 segundos
    
    // Verificaciones de seguridad
    if (!guild) {
      ticketLock.releaseLock(user.id); // Liberar bloqueo en caso de error
      console.error("Error: Guild no proporcionado al crear ticket");
      return {
        success: false,
        reason: "internal_error",
        message: "Error interno al crear el ticket: servidor no definido"
      };
    }
    
    if (!user) {
      ticketLock.releaseLock(user.id); // Liberar bloqueo en caso de error
      console.error("Error: Usuario no proporcionado al crear ticket");
      return {
        success: false, 
        reason: "internal_error",
        message: "Error interno al crear el ticket: usuario no definido"
      };
    }
    
    // Verificar límite de tickets por usuario (configurable)
    const maxTicketsPerUser = client.config.maxTicketsPerUser || 3;
    
    // Cargar tickets existentes
    const data = loadTickets();
    
    // VERIFICACIÓN ADICIONAL: comprobar si ya existe un ticket abierto para este usuario en esta categoría
    const existingTicket = data.tickets.find(
      t => t.userId === user.id && 
          t.status === "open" && 
          t.category === categoryType &&
          t.guildId === guild.id
    );
    
    if (existingTicket) {
      ticketLock.releaseLock(user.id); // Liberar bloqueo
      return {
        success: false,
        reason: "duplicate_ticket",
        message: `Ya tienes un ticket abierto en esta categoría: <#${existingTicket.channelId}>`
      };
    }
    
    // Contar tickets abiertos del usuario
    const userOpenTickets = data.tickets.filter(
      t => t.userId === user.id && 
          t.status === "open" &&
          t.guildId === guild.id
    );
    
    if (userOpenTickets.length >= maxTicketsPerUser) {
      ticketLock.releaseLock(user.id);
      return {
        success: false,
        reason: "ticket_limit",
        message: `Solo puedes tener ${maxTicketsPerUser} tickets abiertos al mismo tiempo.`
      };
    }
    
    // VERIFICACIÓN DE TICKET RECIENTE: evitar spam de creación en la misma categoría
    const recentTickets = data.tickets.filter(
      t => t.userId === user.id && 
          t.category === categoryType &&
          t.guildId === guild.id &&
          (new Date() - new Date(t.createdAt)) < 60000 // Creado en el último minuto
    );
    
    if (recentTickets.length > 0) {
      ticketLock.releaseLock(user.id);
      return {
        success: false,
        reason: "rate_limit",
        message: "Has creado un ticket en esta categoría recientemente. Por favor, espera un momento."
      };
    }

    // Asegurarse de que guild.channels existe
    if (!guild.channels || !guild.channels.cache) {
      ticketLock.releaseLock(user.id);
      console.error("Error: guild.channels no disponible");
      return {
        success: false,
        reason: "internal_error",
        message: "Error interno: canales del servidor no disponibles"
      };
    }

    // Incrementar contador de tickets
    data.counter += 1;
    const ticketNumber = data.counter;

    // Preparar nombre del ticket
    let ticketName = `ticket-${ticketNumber}`;
    if (categoryType) {
      const cleanCategory = categoryType
        .toLowerCase()
        .replace(/\s+/g, "-")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      ticketName = `${cleanCategory}-${ticketNumber}`;
    }

    // Encontrar o crear categoría específica
    let categoryChannel;
    const categoryTypeName = categoryType || "General";
    const ticketCategoryName = `${client.config.ticketCategory} - ${categoryTypeName}`;

    // Buscar categoría existente
    categoryChannel = guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildCategory &&
        c.name.toLowerCase() === ticketCategoryName.toLowerCase()
    );

    // Si no existe, crearla
    if (!categoryChannel) {
      try {
        categoryChannel = await guild.channels.create({
          name: ticketCategoryName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
          ],
        });
      } catch (err) {
        console.error(`Error al crear categoría ${ticketCategoryName}:`, err);
        categoryChannel = guild.channels.cache.find(
          (c) =>
            c.type === ChannelType.GuildCategory &&
            c.name === client.config.ticketCategory
        );

        if (!categoryChannel) {
          ticketLock.releaseLock(user.id);
          return {
            success: false,
            reason: "category_error",
            message: "No se pudo crear la categoría para tickets",
          };
        }
      }
    }

    // Configurar permisos para el canal
    const supportRole = guild.roles.cache.find(
      (r) => r.name === client.config.supportRole
    );

    const channelOptions = {
      name: ticketName,
      type: ChannelType.GuildText,
      parent: categoryChannel.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    };

    if (supportRole) {
      channelOptions.permissionOverwrites.push({
        id: supportRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
        ],
      });
    }

    // Crear el canal
    let channel;
    try {
      channel = await guild.channels.create(channelOptions);
      
      if (!channel) {
        ticketLock.releaseLock(user.id);
        return {
          success: false,
          reason: "channel_error",
          message: "No se pudo crear el canal de ticket"
        };
      }
    } catch (channelError) {
      ticketLock.releaseLock(user.id);
      console.error("Error al crear canal de ticket:", channelError);
      return {
        success: false,
        reason: "channel_error",
        message: "Error al crear el canal de ticket: " + (channelError.message || "Error desconocido")
      };
    }

    // Guardar información del ticket
    const newTicket = {
      id: ticketNumber,
      userId: user.id,
      channelId: channel.id,
      guildId: guild.id,
      category: categoryType,
      reason: reason,
      status: "open",
      createdAt: new Date().toISOString(),
      claimedBy: null,
    };

    // Si hay datos adicionales, guardarlos también
    if (additionalInfo) {
      newTicket.additionalInfo = additionalInfo;
    }

    data.tickets.push(newTicket);
    
    try {
      saveTickets(data);
    } catch (saveError) {
      console.error("Error al guardar datos del ticket:", saveError);
      
      // Intentar eliminar el canal si falla el guardado
      try {
        await channel.delete("Error al guardar datos del ticket");
      } catch (deleteError) {
        console.error("Error al eliminar canal por fallo en guardado:", deleteError);
      }
      
      ticketLock.releaseLock(user.id);
      return {
        success: false,
        reason: "save_error",
        message: "Error al guardar datos del ticket en la base de datos"
      };
    }

    // Color para el embed basado en la categoría
    const selectedCategoryConfig = client.config.ticketCategories.find(
      (c) => c.name === categoryType
    );
    const categoryColor = selectedCategoryConfig?.color || "#5865F2";

    // Botones para el ticket
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setLabel("Reclamar Ticket")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("👋"),
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("Cerrar Ticket")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒"),
      new ButtonBuilder()
        .setCustomId("move_ticket")
        .setLabel("Mover Ticket")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📁")
    );

    // Crear mensaje inicial con información personalizada
    const embed = new EmbedBuilder()
      .setTitle(`Ticket #${ticketNumber}${categoryType ? ` - ${categoryType}` : ""}`)
      .setColor(categoryColor)
      .setDescription(`Bienvenido ${user}, el equipo de soporte te atenderá en breve.`)
      .setTimestamp();

    // Campos personalizados si existen
    if (additionalInfo) {
      if (additionalInfo.minecraftNick) {
        embed.addFields({
          name: '👤 Nick',
          value: additionalInfo.minecraftNick,
          inline: true
        });
      }
      
      if (additionalInfo.details) {
        embed.addFields({
          name: '📝 Razón',
          value: additionalInfo.details
        });
      }
    } else {
      // Si no hay información adicional, usar el motivo general
      embed.addFields({ name: '📝 Razón', value: reason });
    }

    // Añadir instrucciones y pie de página
    embed.addFields({
      name: '📌 Instrucciones',
      value: 'Cuando hayas resuelto tu problema, puedes cerrar el ticket usando el botón "Cerrar Ticket".'
    })
    .setFooter({ 
      text: `Ticket creado: ${new Date().toLocaleDateString()} • ${new Date().toLocaleTimeString()}` 
    });

    // Enviar mensaje inicial
    try {
      const supportRoleId = guild.roles.cache.find(r => r.name === client.config.supportRole)?.id || '';
      await channel.send({
        content: `<@${user.id}>${supportRoleId ? ` | <@&${supportRoleId}>` : ''}`,
        embeds: [embed],
        components: [row]
      });
    } catch (messageError) {
      console.error("Error al enviar mensaje inicial:", messageError);
      // No fallar por esto, continuar
    }

    // Registrar creación en logs
    try {
      logTicketAction(guild, {
        action: "create",
        ticket: newTicket,
        user: user,
      });
    } catch (logError) {
      console.error("Error al registrar acción en logs:", logError);
      // No fallar por esto, continuar
    }

    // Actualizar estadísticas
    try {
      updateTicketStats(guild.id, {
        action: "create",
        userId: user.id,
        category: categoryType,
      });
    } catch (statsError) {
      console.error("Error al actualizar estadísticas:", statsError);
      // No fallar por esto, continuar
    }

    console.log(`[TICKET] Ticket #${ticketNumber} creado exitosamente para ${user.tag || user.username}`);
    
    // Liberar bloqueo después de éxito
    ticketLock.releaseLock(user.id);
    
    // Devolver resultado con formato adecuado
    return {
      success: true,
      channelId: channel.id,
      ticketId: ticketNumber
    };
  } catch (error) {
    // Asegurarse de liberar el bloqueo en caso de error
    if (user && user.id) {
      ticketLock.releaseLock(user.id);
    }
    
    console.error("Error crítico al crear ticket:", error);
    return {
      success: false,
      reason: "internal_error",
      message: "Error interno al crear el ticket: " + (error.message || "Error desconocido")
    };
  }
};
// Sistema de tickets - función de cierre
const closeTicket = async (channel, closedBy) => {
  try {
    if (!channel || !closedBy) {
      return { 
        success: false, 
        reason: "Parámetros inválidos: se requiere canal y usuario que cierra" 
      };
    }

    // Usar la función de validación para comprobar si es un canal de ticket
    if (!isTicketChannel(channel)) {
      return { 
        success: false, 
        reason: "Este canal no es un ticket válido" 
      };
    }
    
    // Sistema antiduplicados para evitar múltiples cierres del mismo ticket
    const antiDuplicate = require('./antiDuplicateCache');
    const lockKey = `close_ticket_${channel.id}`;
    const duplicateCheck = antiDuplicate.checkAndLock(closedBy.id, lockKey, 8000);
    
    if (!duplicateCheck.allowed) {
      return { 
        success: true, // Devolvemos true para evitar mensajes de error
        reason: "Este ticket ya está en proceso de cierre" 
      };
    }

    // Verificar que el ticket existe en la base de datos
    const data = loadTickets();
    const ticket = data.tickets.find(
      t => t.channelId === channel.id && t.status === "open"
    );

    if (!ticket) {
      antiDuplicate.release(closedBy.id, lockKey);
      
      // Intentar recuperar el ticket por nombre del canal
      const channelMatch = channel.name.match(/-(\d+)$/);
      if (channelMatch && channelMatch[1]) {
        const ticketNumber = parseInt(channelMatch[1]);
        const ticketByNumber = data.tickets.find(
          t => t.id === ticketNumber && t.status === "open"
        );
        
        if (ticketByNumber) {
          // Actualizar el ID del canal y continuar
          console.log(`Corrigiendo inconsistencia: ticket #${ticketNumber} con canal incorrecto`);
          ticketByNumber.channelId = channel.id;
          saveTickets(data);
          // Continuar con este ticket
          ticket = ticketByNumber;
        } else {
          return { 
            success: false, 
            reason: "No se encontró un ticket activo asociado a este canal" 
          };
        }
      } else {
        return { 
          success: false, 
          reason: "No se encontró un ticket activo asociado a este canal" 
        };
      }
    }

    // Verificar permisos mejorados
    const permissionHandler = require('./permissionHandler')(client);
    const member = await channel.guild.members.fetch(closedBy.id).catch(() => null);
    
    let hasPermission = false;
    
    // Verificar diferentes condiciones para tener permiso
    if (member) {
      // Administradores siempre pueden cerrar tickets
      if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        hasPermission = true;
      }
      // El sistema de permisos mejorado para staff
      else if (permissionHandler.canManageTickets(member)) {
        hasPermission = true;
      }
      // El creador del ticket
      else if (ticket.userId === closedBy.id) {
        hasPermission = true;
      }
      // Quien reclamó el ticket
      else if (ticket.claimedBy === closedBy.id) {
        hasPermission = true;
      }
    } else {
      // Si no se puede obtener el miembro, verificar si es un bot o staff por ID
      if (closedBy.id === client.user.id) {
        hasPermission = true; // El propio bot siempre puede
      }
    }

    if (!hasPermission) {
      antiDuplicate.release(closedBy.id, lockKey);
      return {
        success: false,
        reason: `No tienes permiso para cerrar este ticket${ticket.claimedBy ? `. Ha sido reclamado por <@${ticket.claimedBy}>` : ''}`
      };
    }

    // Actualizar estado del ticket en la base de datos
    ticket.status = "closed";
    ticket.closedAt = new Date().toISOString();
    ticket.closedBy = closedBy.id;
    
    // Guardar cambios con manejo de errores
    try {
      saveTickets(data);
    } catch (saveError) {
      console.error("Error al guardar estado de ticket cerrado:", saveError);
      antiDuplicate.release(closedBy.id, lockKey);
      return { 
        success: false, 
        reason: "Error al actualizar la base de datos" 
      };
    }

    // Enviar mensaje con temporizador
    const CLOSE_DELAY_SECONDS = 5;
    const embed = new EmbedBuilder()
      .setTitle(`Ticket #${ticket.id} - En proceso de cierre`)
      .setColor('#FF0000')
      .setDescription(`Este ticket se cerrará en **${CLOSE_DELAY_SECONDS} segundos**.\nGracias por usar nuestro sistema de soporte.`)
      .setTimestamp();
    
    await channel.send({ embeds: [embed] });

    // Mostrar un mensaje de cuenta regresiva cada segundo
    for (let i = CLOSE_DELAY_SECONDS - 1; i > 0; i--) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await channel.send(`⏱️ **${i}** segundos hasta el cierre...`);
    }

    // Eliminar el canal después de la cuenta regresiva
    setTimeout(async () => {
      try {
        if (channel.guild && channel.guild.channels.cache.has(channel.id)) {
          await channel.send('🔒 Cerrando ticket...');
          
          // Intentar generar una transcripción si existe el módulo
          try {
            const transcriptModule = require('./ticketTranscript')(client);
            if (transcriptModule && typeof transcriptModule.generateTranscript === 'function') {
              const transcript = await transcriptModule.generateTranscript(channel);
              
              if (transcript) {
                // Buscar canal de logs
                const logChannelName = client.config.ticketLogChannel;
                const logChannel = channel.guild.channels.cache.find(c => c.name === logChannelName);
                
                if (logChannel && transcript.file) {
                  const logEmbed = new EmbedBuilder()
                    .setTitle(`Ticket #${ticket.id} - Cerrado`)
                    .setColor('#FF5500')
                    .setDescription(`El ticket fue cerrado por <@${closedBy.id}>`)
                    .addFields(
                      { name: 'Usuario', value: `<@${ticket.userId}>`, inline: true },
                      { name: 'Categoría', value: ticket.category || 'No especificada', inline: true }
                    )
                    .setTimestamp();
                  
                  await logChannel.send({ 
                    embeds: [logEmbed],
                    files: [transcript.file]
                  });
                }
              }
            }
          } catch (transcriptError) {
            console.error("Error al generar transcripción:", transcriptError);
          }
          
          // Eliminar el canal
          await channel.delete("Ticket cerrado");
        }
      } catch (deleteError) {
        console.error("Error al eliminar canal de ticket:", deleteError);
      } finally {
        // Siempre liberar el bloqueo
        antiDuplicate.release(closedBy.id, lockKey);
      }
    }, 1000); // Esperar un segundo más después de la cuenta regresiva

    return { success: true };
    
  } catch (error) {
    console.error("Error crítico al cerrar ticket:", error);
    
    // Intentar liberar el bloqueo en caso de error
    try {
      const antiDuplicate = require('./antiDuplicateCache');
      antiDuplicate.release(closedBy?.id, `close_ticket_${channel?.id}`);
    } catch (releaseError) {
      console.error("Error al liberar bloqueo anti-duplicado:", releaseError);
    }
    
    return { 
      success: false, 
      reason: "Error interno al procesar el cierre del ticket" 
    };
  }
};

  // Reclamar un ticket
const claimTicket = async (channel, user) => {
  try {
    if (!channel || !user) {
      return {
        success: false,
        reason: "Parámetros inválidos: se requiere un canal y un usuario"
      };
    }

    // Usar la función de validación
    if (!isTicketChannel(channel)) {
      return {
        success: false,
        reason: "Este canal no es un ticket válido"
      };
    }

    const data = loadTickets();
    const ticket = data.tickets.find(
      (t) => t.channelId === channel.id && t.status === "open"
    );

    if (!ticket) {
      return {
        success: false,
        reason: "No se encontró un ticket activo asociado a este canal"
      };
    }

    try {
      const member = await channel.guild.members.fetch(user.id);
      
      // Verificar si es el creador del ticket
      const isTicketCreator = ticket.userId === user.id;

      // Los administradores o el personal de soporte puede reclamar tickets
      // También permitimos que el creador reclame su propio ticket
      const permissionHandler = require('./permissionHandler')(client);
      const hasPermission = permissionHandler.canManageTickets(member) || isTicketCreator;

      if (!hasPermission) {
        return {
          success: false,
          reason: `Necesitas el rol ${client.config.supportRole} para reclamar tickets`
        };
      }

      // Si ya está reclamado por el mismo usuario, no hacer nada
      if (ticket.claimedBy === user.id) {
        return {
          success: true,
          reason: "Ya has reclamado este ticket anteriormente"
        };
      }

      // Si está reclamado por otro, notificar cambio
      if (ticket.claimedBy) {
        const embed = new EmbedBuilder()
          .setColor("#FFA500")
          .setTitle(`Ticket #${ticket.id} - Cambio de Encargado`)
          .setDescription(`Este ticket ahora es atendido por ${user.tag}`)
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      }

      // Actualizar reclamante
      ticket.claimedBy = user.id;
      saveTickets(data);

      // Actualizar estadísticas
      updateUserStats(user.id, "claim", channel.guild.id);

      // Registrar en logs
      logTicketAction(channel.guild, {
        action: "claim",
        ticket: ticket,
        user: user,
      });

      // Actualizar actividad del ticket
      const reminderSystem = require("./ticketReminders")(client);
      reminderSystem.updateTicketActivity(channel.id, user.id);

      return {
        success: true
      };
    } catch (error) {
      console.error("Error al reclamar ticket:", error);
      return {
        success: false,
        reason: "Error interno al procesar la solicitud: " + error.message
      };
    }
  } catch (error) {
    console.error("Error crítico al reclamar ticket:", error);
    return {
      success: false,
      reason: "Error interno al procesar la solicitud"
    };
  }
};

  // Registrar acción de ticket en canal de logs
  const logTicketAction = async (guild, logData) => {
    try {
      const logChannel = guild.channels.cache.find(
        (c) => c.name === client.config.ticketLogChannel
      );

      if (!logChannel) return false;

      const { action, ticket, user, details } = logData;
      let ticketUser;

      try {
        ticketUser = await client.users.fetch(ticket.userId);
      } catch (err) {
        ticketUser = null;
      }

      let color, title, description;

      switch (action) {
        case "create":
          color = 0x00ff00; // Verde
          title = `Ticket #${ticket.id} Creado`;
          description = `${user} ha creado un nuevo ticket.`;
          break;
        case "claim":
          color = 0x0099ff; // Azul
          title = `Ticket #${ticket.id} Reclamado`;
          description = `${user} ha reclamado este ticket.`;
          break;
        case "close":
          color = 0xff0000; // Rojo
          title = `Ticket #${ticket.id} Cerrado`;
          description = `${user} ha cerrado este ticket.`;
          break;
        case "move":
          color = 0xff9900; // Naranja
          title = `Ticket #${ticket.id} Movido`;
          description = `${user} ha movido este ticket. ${details || ""}`;
          break;
        case "adduser": // Nuevo caso para añadir usuario
          color = 0x00ffff; // Cian
          title = `Ticket #${ticket.id} - Usuario Añadido`;
          description = `${user} ha añadido un nuevo usuario a este ticket. ${
            details || ""
          }`;
          break;
        case "rename": // Nuevo caso para renombrar ticket
          color = 0xffff00; // Amarillo
          title = `Ticket #${ticket.id} - Renombrado`;
          description = `${user} ha cambiado el nombre de este ticket. ${
            details || ""
          }`;
          break;
        default:
          color = 0x808080; // Gris
          title = `Ticket #${ticket.id} Actualizado`;
          description = `Se ha actualizado este ticket.`;
      }

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .addFields(
          {
            name: "Usuario",
            value: ticketUser
              ? `${ticketUser.tag} (${ticketUser.id})`
              : ticket.userId,
            inline: true,
          },
          {
            name: "Categoría",
            value: ticket.category || "No especificada",
            inline: true,
          },
          {
            name: "Estado",
            value: ticket.status === "open" ? "Abierto" : "Cerrado",
            inline: true,
          }
        )
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
      return true;
    } catch (error) {
      console.error("Error al registrar acción de ticket:", error);
      return false;
    }
  };

  // Configurar el sistema de tickets para un servidor
  const setupGuild = async (guild) => {
    try {
      if (!guild) {
        console.error("setupGuild: Se requiere un objeto guild válido");
        return false;
      }

      console.log(`Configurando sistema de tickets para ${guild.name}`);

      // 1. Crear categoría de tickets si no existe
      let ticketCategory = guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildCategory &&
          c.name.toUpperCase() === client.config.ticketCategory
      );

      if (!ticketCategory) {
        try {
          ticketCategory = await guild.channels.create({
            name: client.config.ticketCategory,
            type: ChannelType.GuildCategory,
            position: 0,
          });
          console.log(
            `Categoría ${client.config.ticketCategory} creada en ${guild.name}`
          );
        } catch (err) {
          console.error(
            `Error al crear categoría de tickets en ${guild.name}:`,
            err
          );
          return false;
        }
      }

      // 2. Crear o verificar rol de soporte
      let supportRole = guild.roles.cache.find(
        (r) => r.name === client.config.supportRole
      );

      if (!supportRole) {
        try {
          supportRole = await guild.roles.create({
            name: client.config.supportRole,
            color: "#00AAFF",
            mentionable: true,
            reason: "Rol necesario para el sistema de tickets",
          });
          console.log(
            `Rol de soporte ${client.config.supportRole} creado en ${guild.name}`
          );
        } catch (err) {
          console.error(`Error al crear rol de soporte en ${guild.name}:`, err);
        }
      }

      // 3. Crear canal de logs si no existe
      const logChannelName = client.config.ticketLogChannel;
      let logChannel = guild.channels.cache.find(
        (c) => c.name === logChannelName
      );

      if (!logChannel) {
        try {
          logChannel = await guild.channels.create({
            name: logChannelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
              {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel],
              },
            ],
          });

          // Añadir permisos para el rol de soporte
          if (supportRole) {
            await logChannel.permissionOverwrites.create(supportRole, {
              ViewChannel: true,
              ReadMessageHistory: true,
            });
          }

          console.log(
            `Canal de logs ${logChannelName} creado en ${guild.name}`
          );
        } catch (err) {
          console.error(`Error al crear canal de logs en ${guild.name}:`, err);
        }
      }

      // 4. Crear canal de estadísticas si no existe
      const statsChannelName = client.config.ticketStatsChannel;
      let statsChannel = guild.channels.cache.find(
        (c) => c.name === statsChannelName
      );

      if (!statsChannel) {
        try {
          statsChannel = await guild.channels.create({
            name: statsChannelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
              {
                id: guild.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.ReadMessageHistory,
                ],
                deny: [PermissionFlagsBits.SendMessages],
              },
            ],
          });
          console.log(
            `Canal de estadísticas ${statsChannelName} creado en ${guild.name}`
          );
        } catch (err) {
          console.error(
            `Error al crear canal de estadísticas en ${guild.name}:`,
            err
          );
        }
      }

      // 5. Crear categorías específicas para cada tipo de ticket
      if (
        client.config.ticketCategories &&
        client.config.ticketCategories.length > 0
      ) {
        for (const categoryConfig of client.config.ticketCategories) {
          const categoryName = `${client.config.ticketCategory} - ${categoryConfig.name}`;

          if (
            !guild.channels.cache.find(
              (c) =>
                c.type === ChannelType.GuildCategory && c.name === categoryName
            )
          ) {
            try {
              await guild.channels.create({
                name: categoryName,
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                  {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                  },
                ],
              });

              console.log(
                `Categoría de tickets ${categoryName} creada en ${guild.name}`
              );
            } catch (err) {
              console.error(
                `Error al crear categoría ${categoryName} en ${guild.name}:`,
                err
              );
            }
          }
        }
      }

      // Actualizar canal de estadísticas
      updateStatsChannel(guild);

      return true;
    } catch (error) {
      console.error("Error al configurar servidor para tickets:", error);
      return false;
    }
  };

  // Mover un ticket a otra categoría - FUNCIÓN QUE FALTABA
const moveTicket = async (channel, newCategory, user) => {
  try {
    if (!channel || !newCategory || !user) {
      return { success: false, reason: "Parámetros inválidos" };
    }

    // Usar la función de validación
    if (!isTicketChannel(channel)) {
      return { success: false, reason: "Este canal no es un ticket válido" };
    }

    // Cargar datos del ticket
    const data = loadTickets();
    const ticket = data.tickets.find(
      t => t.channelId === channel.id && t.status === "open"
    );

    if (!ticket) {
      return {
        success: false,
        reason: "No se encontró un ticket activo asociado a este canal"
      };
    }

    // Verificar permisos
    const permHandler = require('./permissionHandler')(client);
    let hasPermission = false;

    try {
      const member = await channel.guild.members.fetch(user.id);
      hasPermission = permHandler.canManageTickets(member);
    } catch (err) {
      console.error("Error al verificar permisos:", err);
    }

    if (!hasPermission && ticket.userId !== user.id && ticket.claimedBy !== user.id) {
      return {
        success: false,
        reason: "No tienes permiso para mover este ticket"
      };
    }

    // Guardar la categoría anterior
    const oldCategory = ticket.category;
    
    // Actualizar categoría del ticket
    ticket.category = newCategory;
    saveTickets(data);

    // Actualizar mensaje de bienvenida
    try {
      const messages = await channel.messages.fetch({ limit: 10 });
      const firstMessage = messages.last();

      if (
        firstMessage &&
        firstMessage.author.id === client.user.id &&
        firstMessage.embeds.length > 0
      ) {
        const originalEmbed = firstMessage.embeds[0];

        const updatedEmbed = EmbedBuilder.from(originalEmbed).setTitle(
          `Ticket #${ticket.id} - ${newCategory}`
        );

        await firstMessage.edit({ embeds: [updatedEmbed] });
      }
    } catch (err) {
      console.error("Error al actualizar mensaje de bienvenida:", err);
    }

    // Intentar mover el canal a la categoría correspondiente
    try {
      const guild = channel.guild;
      const categoryTypeName = newCategory || "General";
      const ticketCategoryName = `${client.config.ticketCategory} - ${categoryTypeName}`;

      // Buscar categoría existente
      let categoryChannel = guild.channels.cache.find(
        c =>
          c.type === ChannelType.GuildCategory &&
          c.name.toLowerCase() === ticketCategoryName.toLowerCase()
      );

      // Si no existe, crearla
      if (!categoryChannel) {
        categoryChannel = await guild.channels.create({
          name: ticketCategoryName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel]
            }
          ]
        });
      }

      // Mover el canal a la nueva categoría
      await channel.setParent(categoryChannel.id, { lockPermissions: false });

      // Actualizar permisos específicos para la nueva categoría
      await setupCategoryPermissions(channel, newCategory, guild);
    } catch (err) {
      console.error("Error al mover canal a nueva categoría:", err);
      // Continuamos aunque no se haya podido mover el canal físicamente
    }

    // Registrar en logs
    logTicketAction(channel.guild, {
      action: "move",
      ticket: ticket,
      user: user,
      details: `Movido de ${oldCategory || 'Sin categoría'} a ${newCategory}`
    });

    return { success: true };
  } catch (error) {
    console.error("Error al mover ticket:", error);
    return {
      success: false,
      reason: "Error interno al procesar la solicitud"
    };
  }
};

  // Crear mensaje para selección de categorías de tickets
  const createTicketMessage = async (channel) => {
    try {
      if (!channel || !channel.isTextBased()) {
        console.error(
          "createTicketMessage: Se requiere un canal de texto válido"
        );
        return null;
      }

      // Embed principal con el aspecto visual de la imagen
      const embed = new EmbedBuilder()
        .setColor(0x00ff00) // Color verde brillante para el borde
        .setAuthor({
          name: "Kenibox Network",
          iconURL:
            "https://media.discordapp.net/attachments/1214738601183543306/1239393499518861402/1715233140208.png?width=40&height=40",
        })
        .setDescription(
          "**¡PIDE SOPORTE AQUÍ!** ✅\n\nBienvenido al Sistema de Tickets\nde KENIBOX\nPor favor, seleccione una\ncategoría:\n\n**🔧 Soporte**\n**🔴 Reportes a usuarios**\n**⚖️ Apelaciones**\n**🛒 Tienda**\n**⚙️ Administración**\n**📋 Postulaciones**"
        )
        .setThumbnail(
          "https://media.discordapp.net/attachments/1214738601183543306/1239393499518861402/1715233140208.png"
        )
        .setImage(
          "https://media.discordapp.net/attachments/1274812367250657342/1328827889898229843/SeleccionesucategorC3ADa.png"
        )
        .setFooter({
          text: `Copyright © ${new Date().getFullYear()} Kenibox Network`,
          iconURL:
            "https://media.discordapp.net/attachments/1214738601183543306/1239393499518861402/1715233140208.png?width=20&height=20",
        });

      // Menú de selección de categorías
      const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket_category")
          .setPlaceholder("Seleccione su categoría")
          .addOptions([
            {
              label: "Soporte",
              value: "Soporte general",
              emoji: "🔧",
            },
            {
              label: "Reportes",
              value: "Reportes",
              emoji: "🔴",
            },
            {
              label: "Apelaciones",
              value: "Apelaciones",
              emoji: "⚖️",
            },
            {
              label: "Tienda",
              value: "Tienda",
              emoji: "🛒",
            },
            {
              label: "Administración",
              value: "Administración",
              emoji: "⚙️",
            },
            {
              label: "Postulaciones",
              value: "Postulaciones",
              emoji: "📋",
            },
          ])
      );

      // Enviar mensaje con el embed y el menú de selección
      const message = await channel.send({
        embeds: [embed],
        components: [selectMenu],
      });

      return message;
    } catch (error) {
      console.error("Error al crear mensaje de tickets:", error);
      return null;
    }
  };

return {
  initialize: () => {
    console.log("Sistema de tickets inicializado.");
    
    // Verificar archivos de datos
    if (!fs.existsSync(ticketsPath)) {
      saveTickets({ tickets: [], counter: 0 });
    }
    
    if (!fs.existsSync(statsPath)) {
      saveStats({ userStats: {}, lastUpdate: new Date().toISOString() });
    }
  },
  pendingTicketCreations, // Exportar el mapa para poder verificarlo externamente
  createTicket,
  closeTicket,
  claimTicket,
  moveTicket,
  setupGuild,
  createTicketMessage,
  loadTickets,
  saveTickets,
  updateStatsChannel,
  canCreateTicket,
  isTicketChannel,
  setupCategoryPermissions,
  updateUserStats,
};
};
