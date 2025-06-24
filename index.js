const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Collection, 
  REST, 
  Routes,
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Conjuntos para prevenir interacciones duplicadas
global.processedInteractions = new Set();
global.processedModals = new Set();

// Mapas para rastrear solicitudes recientes
const recentTicketCreations = new Map();
const recentRequests = new Map();
const closingTickets = new Map();
const pendingTicketCreations = new Map();

// Sistema anti-duplicación mejorado para tickets
const ticketLocks = new Map();
const LOCK_DURATION = 5000; // 5 segundos

function lockTicketCreation(userId) {
  ticketLocks.set(userId, Date.now() + LOCK_DURATION);
  
  // Limpiar después del tiempo de bloqueo
  setTimeout(() => {
    if (ticketLocks.has(userId)) {
      ticketLocks.delete(userId);
    }
  }, LOCK_DURATION + 100);
}

function isTicketLocked(userId) {
  if (!ticketLocks.has(userId)) return false;
  
  const lockExpiry = ticketLocks.get(userId);
  const now = Date.now();
  
  if (now >= lockExpiry) {
    ticketLocks.delete(userId);
    return false;
  }
  
  return true;
}

// Verificación de directorios necesarios
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Creado directorio de datos: ${dataDir}`);
}

// Crear directorios si no existen
const dirs = ['./data', './commands', './commands/license', './commands/ticket', './commands/general'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Creado directorio: ${dir}`);
  }
});

// Archivos de datos esenciales
const dataFiles = {
  './data/licenses.json': { licenses: {} },
  './data/tickets.json': { tickets: [], counter: 0 },
  './data/ticketStats.json': { servers: {}, lastUpdate: new Date().toISOString() },
  './data/ticketActivity.json': {},
  './data/autocloseConfig.json': { 
    enabled: true,
    warningHours: 24,
    closeHours: 48,
    exemptCategories: [] 
  },
  './data/duplicateCache.json': { entries: {}, lastSaved: Date.now() },
  './data/ticketLocks.json': { locks: [], lastSaved: Date.now() }
};

// Crear archivos de datos si no existen
Object.entries(dataFiles).forEach(([file, defaultData]) => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    console.log(`Creado archivo de datos: ${file}`);
  }
});

// Verificar archivo .env
if (!process.env.TOKEN) {
  console.error('¡ERROR CRÍTICO! No se encontró el token en el archivo .env');
  console.error('Crea un archivo .env en la raíz del proyecto con: TOKEN=tu_token_aquí');
  process.exit(1);
}

// Configuración del cliente
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Cargar configuración
let config = {};
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  config = require('./config.json');
  console.log('Configuración cargada correctamente.');
} else {
  config = {
    licenseRole: 'License Manager',
    supportRole: 'Staff',
    ticketCategory: 'TICKETS',
    ticketLogChannel: 'registro-tickets',
    ticketStatsChannel: 'ranking-soporte',
    maxTicketsPerUser: 3,
    ticketCategories: [
      { name: 'Soporte general', emoji: '🔧', description: 'Ayuda y soporte general', color: '#5865F2', allowedRoles: ['Support Team', 'Moderador', 'Admin'] },
      { name: 'Reportes', emoji: '🔴', description: 'Reportes a usuarios', color: '#ED4245', allowedRoles: ['Support Team', 'Moderador', 'Admin', 'Helper'] },
      { name: 'Apelaciones', emoji: '⚖️', description: 'Apelaciones de sanciones', color: '#FAA81A', allowedRoles: ['Admin', 'Moderador'] },
      { name: 'Tienda', emoji: '🛒', description: 'Consultas sobre la tienda', color: '#57F287', allowedRoles: ['Support Team', 'Admin', 'Ventas'] },
      { name: 'Administración', emoji: '⚙️', description: 'Temas administrativos', color: '#9C84EF', allowedRoles: ['Admin'] },
      { name: 'Postulaciones', emoji: '📋', description: 'Postulaciones al staff', color: '#EB459E', allowedRoles: ['Admin', 'Recruiter'] }
    ]
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('Archivo de configuración creado con valores predeterminados.');
}

// Colecciones para comandos y cooldowns
client.commands = new Collection();
client.cooldowns = new Collection();
client.slashCommands = new Collection();
client.config = config;

// Función mejorada para manejar errores de interacción
const handleInteractionError = (error, interactionType) => {
  // Ignorar errores conocidos de interacciones expiradas o ya respondidas
  if (
    error.code === 10062 || // Unknown interaction
    error.code === 40060 || // Interaction already acknowledged
    error.message?.includes('The reply to this interaction has already been sent')
  ) {
    // Solo registrar estos errores con menos detalle
    console.log(`Interacción ${interactionType} ya expirada o respondida`);
    return;
  }
  
  // Registrar otros errores en detalle
  console.error(`Error en interacción ${interactionType}:`, error);
};

// Función mejorada para cargar comandos sin duplicados
const loadCommands = () => {
  try {
    console.log('Iniciando carga de comandos...');
    const commands = [];
    const commandsSet = new Set(); // Set para evitar duplicados
    const foldersPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(foldersPath);
    
    for (const folder of commandFolders) {
      const folderPath = path.join(foldersPath, folder);
      
      if (!fs.statSync(folderPath).isDirectory()) {
        continue;
      }
      
      console.log(`Explorando directorio: ${folderPath}`);
      const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
      
      for (const file of commandFiles) {
        try {
          const commandPath = path.join(folderPath, file);
          
          // Limpiar la caché para recargar el comando si ha cambiado
          delete require.cache[require.resolve(commandPath)];
          
          const command = require(commandPath);
          
          if (!command.data || !command.execute) {
            console.warn(`⚠️ El comando en ${file} no tiene la estructura correcta. Se omitirá.`);
            continue;
          }
          
          // Verificar si ya existe un comando con el mismo nombre
          if (commandsSet.has(command.data.name)) {
            console.warn(`⚠️ Comando duplicado detectado: ${command.data.name}. Ignorando duplicado.`);
            continue;
          }
          
          // Agregar al Set para prevenir duplicados
          commandsSet.add(command.data.name);
          
          // Asignar categoría basada en carpeta si no está definida
          if (!command.category) {
            command.category = folder;
          }
          
          // Registrar el comando
          commands.push(command.data.toJSON());
          client.slashCommands.set(command.data.name, command);
          
          console.log(`✅ Comando cargado: /${command.data.name}`);
        } catch (error) {
          console.error(`❌ Error al cargar el comando ${file}:`, error);
        }
      }
    }
    
    console.log(`Total de comandos cargados: ${commands.length}`);
    return commands;
  } catch (error) {
    console.error('Error general al cargar comandos:', error);
    return [];
  }
};

// Sistema anti-duplicados mejorado para tickets y otras acciones
const antiDuplicateCache = {
  cache: new Map(),
  timeouts: new Map(),
  
  check: function(userId, actionType, timeWindow = 3000) {
    const key = `${userId}-${actionType}`;
    const now = Date.now();
    
    // Verificar si ya existe una acción reciente
    if (this.cache.has(key)) {
      const lastTime = this.cache.get(key);
      if (now - lastTime < timeWindow) {
        return false; // No permitir, es muy reciente
      }
    }
    
    // Actualizar el tiempo de la última acción
    this.cache.set(key, now);
    
    // Limpiar después del tiempo de ventana
    if (this.timeouts.has(key)) {
      clearTimeout(this.timeouts.get(key));
    }
    
    const timeout = setTimeout(() => {
      this.cache.delete(key);
      this.timeouts.delete(key);
    }, timeWindow + 1000); // Añadir un segundo extra para seguridad
    
    this.timeouts.set(key, timeout);
    
    return true; // Permitir la acción
  },
  
  clear: function(userId, actionType) {
    const key = `${userId}-${actionType}`;
    this.cache.delete(key);
    
    if (this.timeouts.has(key)) {
      clearTimeout(this.timeouts.get(key));
      this.timeouts.delete(key);
    }
  }
};

// Funciones auxiliares para inicialización
async function initializeSystems() {
  console.log('Inicializando sistemas...');
  
  try {
    // Inicializar sistema de licencias
    const licenseSystem = require('./modules/licenseSystem')(client);
    await licenseSystem.initialize();
    console.log('✅ Sistema de licencias inicializado');
    
    // Inicializar sistema de tickets con verificación
    const ticketSystem = require('./modules/ticketSystem')(client);
    
    // Verificar que todas las funciones necesarias estén disponibles
    const requiredFunctions = [
      'initialize', 'createTicket', 'closeTicket', 'claimTicket', 
      'moveTicket', 'setupGuild', 'isTicketChannel'
    ];
    
    for (const funcName of requiredFunctions) {
      if (typeof ticketSystem[funcName] !== 'function') {
        throw new Error(`La función ${funcName} no está definida en el módulo ticketSystem`);
      }
    }
    
    await ticketSystem.initialize();
    console.log('✅ Sistema de tickets inicializado');
    
    // Verificar configuración de servidores
    for (const guild of client.guilds.cache.values()) {
      await ticketSystem.setupGuild(guild);
    }
    
    console.log('✅ Servidores configurados');
    
    // Continuar con la inicialización de los otros sistemas
    const ticketReminders = require('./modules/ticketReminders')(client);
    await ticketReminders.initialize();
    console.log('✅ Sistema de recordatorios inicializado');
    
    const ticketAutoclose = require('./modules/ticketAutoclose')(client);
    await ticketAutoclose.initialize();
    console.log('✅ Sistema de cierre automático inicializado');
    
    console.log('¡Todos los sistemas inicializados correctamente!');
    return true;
  } catch (error) {
    console.error('Error al inicializar sistemas:', error);
    return false;
  }
}

// Función mejorada para registrar comandos
async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    const commands = loadCommands();
    
    console.log(`Registrando ${commands.length} comandos en ${client.guilds.cache.size} servidores...`);
    
    // Procesar en lotes para no sobrecargar la API
    const guildArray = [...client.guilds.cache.values()];
    
    for (let i = 0; i < guildArray.length; i += 3) {
      const batch = guildArray.slice(i, i + 3);
      
      await Promise.all(batch.map(async guild => {
        try {
          await rest.put(
            Routes.applicationGuildCommands(client.user.id, guild.id),
            { body: commands }
          );
          console.log(`✅ Comandos registrados en: ${guild.name}`);
        } catch (err) {
          console.error(`❌ Error al registrar comandos en ${guild.name}:`, err);
        }
      }));
      
      // Esperar brevemente entre lotes
      if (i + 3 < guildArray.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    console.log('✅ Registro de comandos completado');
    return true;
  } catch (error) {
    console.error('Error al registrar comandos:', error);
    return false;
  }
}

// Cuando el bot está listo - VERSIÓN OPTIMIZADA
client.once('ready', async () => {
  console.log(`¡Bot iniciado como ${client.user.tag}!`);
  
  try {
    // Inicializar sistemas en secuencia para evitar problemas
    await initializeSystems();
    await registerCommands();
    
    console.log('¡Inicialización completa!');
    client.user.setActivity('/ayuda', { type: 0 });
  } catch (error) {
    console.error('Error en evento ready:', error);
  }
});

// Manejador completo de interacciones
client.on('interactionCreate', async interaction => {
  try {
    // SISTEMA ANTI-DUPLICADOS PARA TODAS LAS INTERACCIONES
    const interactionId = interaction.id;
    const userId = interaction.user.id;
    const actionType = `${interaction.type}-${interaction.customId || 'cmd'}`;
    
    // Para comandos y botones críticos, usar el sistema anti-duplicados
    if (
      interaction.isCommand() || 
      (interaction.isButton() && ['close_ticket', 'claim_ticket'].includes(interaction.customId))
    ) {
      // Si esta interacción ya está siendo procesada, ignorarla
      if (!antiDuplicateCache.check(userId, actionType)) {
        console.log(`Ignorando interacción duplicada de ${interaction.user.tag}: ${actionType}`);
        
        // Solo responder si no hay respuesta previa
        if (!interaction.replied && !interaction.deferred) {
          try {
            await interaction.reply({
              content: "Tu solicitud anterior está siendo procesada. Por favor espera un momento.",
              flags: 64
            }).catch(() => {});
          } catch (err) {
            // Ignorar errores - probablemente la interacción ya expiró
          }
        }
        return;
      }
    }
    
    // COMANDOS SLASH (APLICACIONES)
    if (interaction.isCommand()) {
      const command = client.slashCommands.get(interaction.commandName);
      
      if (!command) {
        console.log(`Comando no encontrado: ${interaction.commandName}`);
        antiDuplicateCache.clear(userId, actionType);
        return;
      }
      
      // Sistema anti-cooldown
      const { cooldowns } = client;
      
      if (!cooldowns.has(command.data.name)) {
        cooldowns.set(command.data.name, new Collection());
      }
      
      const now = Date.now();
      const timestamps = cooldowns.get(command.data.name);
      const cooldownAmount = (command.cooldown || 3) * 1000;
      
      if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
        
        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;
          antiDuplicateCache.clear(userId, actionType);
          return interaction.reply({ 
            content: `Por favor espera ${timeLeft.toFixed(1)} segundos antes de usar el comando \`${command.data.name}\` nuevamente.`, 
            flags: 64
          }).catch(() => {});
        }
      }
      
      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
      
      // Ejecutar el comando
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Error al ejecutar comando ${interaction.commandName}:`, error);
        
        const errorMessage = 'Ha ocurrido un error al ejecutar este comando.';
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ 
            content: errorMessage, 
            flags: 64
          }).catch(console.error);
        } else {
          await interaction.reply({ 
            content: errorMessage, 
            flags: 64
          }).catch(console.error);
        }
      } finally {
        // Siempre limpiar el caché anti-duplicado
        antiDuplicateCache.clear(userId, actionType);
      }
    }
    
    // BOTONES
    else if (interaction.isButton()) {
      const buttonId = interaction.customId;
      
      // Botón de cerrar ticket - con manejo mejorado
      if (buttonId === 'close_ticket') {
        const ticketSystem = require('./modules/ticketSystem')(client);
        
        if (!ticketSystem.isTicketChannel(interaction.channel)) {
          return await interaction.reply({ 
            content: '❌ Este botón solo funciona en canales de ticket.', 
            flags: 64 
          }).catch(() => {});
        }
        
        try {
          await interaction.deferReply();
          
          const result = await ticketSystem.closeTicket(interaction.channel, interaction.user);
          
          if (!result.success) {
            // Solo mostrar error si no está en proceso de cierre
            if (result.reason !== "Este ticket ya está en proceso de cierre") {
              await interaction.editReply(`❌ No se pudo cerrar este ticket: ${result.reason || 'Error desconocido'}`).catch(() => {});
            } else {
              await interaction.editReply('✅ El ticket ya está en proceso de cierre.').catch(() => {});
            }
          } else {
            await interaction.editReply('✅ Cerrando ticket...').catch(() => {});
          }
        } catch (error) {
          if (error.code !== 10062 && error.code !== 40060) {
            console.error('Error al cerrar ticket:', error);
            try {
              await interaction.editReply('❌ Ocurrió un error al cerrar el ticket.').catch(() => {});
            } catch (followupError) {
              // Ignorar errores secundarios
            }
          }
        } finally {
          antiDuplicateCache.clear(userId, actionType);
        }
      }
      
      // Botón de reclamar ticket - con permisos mejorados
      else if (buttonId === 'claim_ticket') {
        const ticketSystem = require('./modules/ticketSystem')(client);
        
        if (!ticketSystem.isTicketChannel(interaction.channel)) {
          return await interaction.reply({ 
            content: '❌ Este botón solo funciona en canales de ticket.', 
            flags: 64 
          }).catch(() => {});
        }
        
        // Verificar permisos de staff con sistema mejorado
        const permissionHandler = require('./modules/permissionHandler')(client);
        if (!permissionHandler.canManageTickets(interaction.member)) {
          return await interaction.reply({ 
            content: `❌ Necesitas el rol ${client.config.supportRole} para reclamar tickets.`, 
            flags: 64 
          }).catch(() => {});
        }
        
        try {
          await interaction.deferReply();
          
          const result = await ticketSystem.claimTicket(interaction.channel, interaction.user);
          
          if (!result.success) {
            await interaction.editReply(`❌ No se pudo reclamar este ticket: ${result.reason || 'Error desconocido'}`).catch(() => {});
          } else {
            await interaction.editReply('✅ Has reclamado este ticket. Ahora estás a cargo.').catch(() => {});
          }
        } catch (error) {
          if (error.code !== 10062 && error.code !== 40060) {
            console.error('Error al reclamar ticket:', error);
            try {
              await interaction.editReply('❌ Ocurrió un error al reclamar el ticket.').catch(() => {});
            } catch (followupError) {
              // Ignorar errores secundarios
            }
          }
        } finally {
          antiDuplicateCache.clear(userId, actionType);
        }
      }
      
      // Botón de mover ticket - implementado con menú de selección
      else if (buttonId === 'move_ticket') {
        const ticketSystem = require('./modules/ticketSystem')(client);
        
        if (!ticketSystem.isTicketChannel(interaction.channel)) {
          return await interaction.reply({ 
            content: '❌ Este botón solo funciona en canales de ticket.', 
            flags: 64 
          }).catch(() => {});
        }
        
        // Verificar permisos
        const permissionHandler = require('./modules/permissionHandler')(client);
        if (!permissionHandler.canManageTickets(interaction.member)) {
          return await interaction.reply({ 
            content: `❌ Necesitas el rol ${client.config.supportRole} para mover tickets.`, 
            flags: 64 
          }).catch(() => {});
        }
        
        // Crear opciones para el menú basadas en las categorías configuradas
        const options = [];
        for (const category of client.config.ticketCategories) {
          options.push({
            label: category.name,
            value: category.name,
            emoji: category.emoji || '📁',
            description: category.description || `Mover a ${category.name}`
          });
        }
        
        // Crear el menú de selección
        const row = new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('move_ticket_category')
              .setPlaceholder('Selecciona una categoría')
              .addOptions(options)
          );
        
        await interaction.reply({
          content: '📋 Selecciona la categoría a la que deseas mover este ticket:',
          components: [row],
          flags: 64
        }).catch(console.error);
      }
    }
    
    // MENÚS DE SELECCIÓN
    else if (interaction.isStringSelectMenu()) {
      try {
        // Sistema para evitar procesamiento duplicado de interacciones
        const interactionKey = `select-${interaction.user.id}-${Date.now()}`;
        
        // Si esta interacción ya fue procesada, salir inmediatamente
        if (global.processedInteractions.has(interactionKey)) {
          console.log(`Interacción duplicada detectada y ignorada para ${interaction.user.tag}`);
          return;
        }
        global.processedInteractions.add(interactionKey);
        setTimeout(() => global.processedInteractions.delete(interactionKey), 10000);
        
        // MANEJADOR DE MENÚ DE CATEGORÍAS DE TICKETS
        if (interaction.customId === 'ticket_category') {
          // Obtener la categoría seleccionada
          const selectedValue = interaction.values[0]; 
          
          const categoryName = client.config.ticketCategories.find(c => 
            c.name.toLowerCase() === selectedValue || 
            c.name === selectedValue || 
            selectedValue.includes(c.name.toLowerCase())
          )?.name || selectedValue;
          
          // Verificar límites de tickets utilizando el módulo correcto
          const ticketSystem = require('./modules/ticketSystem')(client);
          const checkLimit = ticketSystem.canCreateTicket(interaction.user.id, interaction.guild.id);
          
          if (!checkLimit.allowed) {
            await interaction.reply({
              content: `⚠️ ${checkLimit.message}`,
              flags: 64
            }).catch(() => {});
            return;
          }
          
          // Sistema anti-duplicados específico para tickets
          const antiDuplicate = require('./modules/antiduplicate');
          const duplicateCheck = antiDuplicate.check(interaction.user.id, 'select_ticket');
          
          if (!duplicateCheck.allowed) {
            await interaction.reply({
              content: `⚠️ ${duplicateCheck.message}`,
              flags: 64
            }).catch(() => {});
            return;
          }
          
          // Bloquear por 5 segundos para evitar múltiples selecciones
          antiDuplicate.lock(interaction.user.id, 'select_ticket', 5);
          
          // Mostrar modal simplificado con los campos requeridos
          try {
            await interaction.showModal({
              title: `Nuevo Ticket - ${categoryName}`,
              custom_id: `ticket_modal_simple_${selectedValue}`,
              components: [
                {
                  type: 1, // ActionRow
                  components: [
                    {
                      type: 4, // TextInput
                      custom_id: 'minecraft_nick',
                      label: 'Nick',
                      style: 1, // Short input
                      placeholder: 'Tu nombre en el juego',
                      required: true,
                      min_length: 3,
                      max_length: 32
                    }
                  ]
                },
                {
                  type: 1, // ActionRow
                  components: [
                    {
                      type: 4, // TextInput
                      custom_id: 'ticket_details',
                      label: 'Duda',
                      style: 2, // Paragraph
                      placeholder: 'Escribe tu duda o problema aquí',
                      required: true,
                      min_length: 10,
                      max_length: 1000
                    }
                  ]
                }
              ]
            });
          } catch (modalError) {
            // Liberar el bloqueo en caso de error
            antiDuplicate.release(interaction.user.id, 'select_ticket');
            
            if (modalError.code !== 10062) {
              console.error('Error al mostrar modal:', modalError);
              
              try {
                await interaction.reply({
                  content: 'Ocurrió un error al abrir el formulario. Por favor intenta nuevamente.',
                  flags: 64
                }).catch(() => {});
              } catch (replyError) {
                console.log('No se pudo responder a la interacción de modal:', replyError.message);
              }
            }
          }
        }
        // MENÚ DE CATEGORÍAS PARA MOVER TICKETS
        else if (interaction.customId === 'move_ticket_category') {
          try {
            const selectedCategory = interaction.values[0];
            
            // Asegurarse de que esta interacción sea de un ticket
            const ticketSystem = require('./modules/ticketSystem')(client);
            
            if (!ticketSystem.isTicketChannel(interaction.channel)) {
              await interaction.reply({
                content: '⚠️ Este comando solo puede usarse en canales de tickets.',
                flags: 64
              }).catch(console.error);
              return;
            }
            
            // Verificar que el módulo tiene la función moveTicket
            if (typeof ticketSystem.moveTicket !== 'function') {
              console.error('La función moveTicket no está definida en el módulo ticketSystem');
              await interaction.reply({
                content: '❌ Error interno: Función de mover ticket no implementada. Contacta al administrador.',
                flags: 64
              }).catch(console.error);
              return;
            }
            
            // Defer reply para operaciones que pueden tomar tiempo
            await interaction.deferReply({ flags: 64 }).catch(console.error);
            
            // Mover el ticket usando la función corregida
            const moveResult = await ticketSystem.moveTicket(
              interaction.channel, 
              selectedCategory, 
              interaction.user
            );
            
            if (moveResult.success) {
              await interaction.editReply({
                content: `✅ Ticket movido exitosamente a la categoría: ${selectedCategory}`
              }).catch(console.error);
            } else {
              await interaction.editReply({
                content: `❌ Error al mover el ticket: ${moveResult.reason || 'Error desconocido'}`
              }).catch(console.error);
            }
          } catch (error) {
            console.error('Error al mover ticket:', error);
            
            try {
              if (interaction.deferred) {
                await interaction.editReply({
                  content: '❌ Ocurrió un error al mover el ticket. Error: ' + (error.message || 'Desconocido')
                }).catch(console.error);
              } else {
                await interaction.reply({
                  content: '❌ Ocurrió un error al mover el ticket.',
                  flags: 64
                }).catch(console.error);
              }
            } catch (replyError) {
              console.log('Error al responder a interacción de mover ticket:', replyError);
            }
          }
        }
        
        // MENÚ DE AYUDA/SOPORTE
        else if (interaction.customId === 'help_menu') {
          try {
            const selectedHelp = interaction.values[0];
            
            // Determinar qué información mostrar
            let helpEmbed = new EmbedBuilder()
              .setColor('#5865F2')
              .setTitle('Ayuda y Soporte');
              
            switch (selectedHelp) {
              case 'commands':
                helpEmbed
                  .setDescription('Aquí tienes una lista de comandos disponibles:')
                  .addFields(
                    { name: '/setuptickets', value: 'Configura el sistema de tickets' },
                    { name: '/purgartickets', value: 'Elimina tickets antiguos' },
                    { name: '/stats', value: 'Ver estadísticas del sistema de tickets' },
                    { name: '/ayuda', value: 'Muestra este menú de ayuda' },
                    { name: '/renameticket', value: 'Cambia el nombre de un ticket' },
                    { name: '/adduser', value: 'Añade un usuario a un ticket existente' },
                    { name: '/move', value: 'Mueve un ticket a otra categoría' }
                  );
                break;
                
              case 'ticket_help':
                helpEmbed
                  .setDescription('Información sobre el sistema de tickets:')
                  .addFields(
                    { name: '¿Cómo crear un ticket?', value: 'Usa el panel de selección en el canal designado' },
                    { name: '¿Cómo cerrar un ticket?', value: 'Haz clic en el botón "Cerrar Ticket" dentro del ticket' },
                    { name: '¿Puedo reclamar tickets?', value: 'El staff puede reclamar tickets usando el botón correspondiente' },
                    { name: '¿Cómo mover un ticket?', value: 'Usa el comando `/move` o el botón "Mover Ticket" dentro del ticket' }
                  );
                break;
                
              case 'license_help':
                helpEmbed
                  .setDescription('Información sobre el sistema de licencias:')
                  .addFields(
                    { name: '¿Cómo generar una licencia?', value: 'Usa el comando `/generar`' },
                    { name: '¿Cómo verificar una licencia?', value: 'Usa el comando `/verificar`' },
                    { name: '¿Cómo renovar una licencia?', value: 'Usa el comando `/renovar`' },
                    { name: '¿Cómo ver estadísticas?', value: 'Usa el comando `/estadolicencias`' }
                  );
                break;
                
              default:
                helpEmbed
                  .setDescription('Selecciona una opción del menú para ver ayuda específica');
                break;
            }
            
            await interaction.reply({
              embeds: [helpEmbed],
              flags: 64
            }).catch(() => {});
          } catch (error) {
            if (error.code !== 10062 && error.code !== 40060) {
              console.error('Error al mostrar menú de ayuda:', error);
              
              try {
                await interaction.reply({
                  content: '❌ Ocurrió un error al mostrar la ayuda.',
                  flags: 64
                }).catch(() => {});
              } catch (e) {
                console.log('Interacción help_menu ya expirada o respondida');
              }
            }
          }
        }
      } catch (error) {
        // Error general en el procesamiento del menú de selección
        if (error.code !== 10062 && error.code !== 40060) {
          console.error('Error crítico al procesar menú de selección:', error);
          
          try {
            await interaction.reply({
              content: 'Ocurrió un error al procesar tu selección.',
              flags: 64
            }).catch(() => {
              console.log('No se pudo responder a la interacción:', error.message);
            });
          } catch (err) {
            console.log('Error al responder a menú de selección:', err.message);
          }
        }
      }
    }
    
    // MODALES - CON SISTEMA ANTI-DUPLICADOS MEJORADO
    else if (interaction.isModalSubmit()) {
      try {
        // Modales de tickets
        if (interaction.customId.startsWith('ticket_modal_simple_')) {
          // Usar el nuevo sistema anti-duplicados mejorado
          const antiDuplicate = require('./modules/antiduplicate');
          
          // Verificar si ya está creando un ticket
          const checkResult = antiDuplicate.check(interaction.user.id, 'create_ticket');
          if (!checkResult.allowed) {
            try {
              await interaction.reply({
                content: `⚠️ ${checkResult.message}`,
                flags: 64  // Ephemeral
              }).catch(() => {});
            } catch (e) {
              console.log('Error al responder a interacción duplicada:', e.message);
            }
            return;
          }
          
          // Bloquear por 10 segundos
          antiDuplicate.lock(interaction.user.id, 'create_ticket', 10);
          
          try {
            await interaction.deferReply({ flags: 64 }).catch(() => {});
            
            const category = interaction.customId.replace('ticket_modal_simple_', '');
            const minecraftNick = interaction.fields.getTextInputValue('minecraft_nick');
            const details = interaction.fields.getTextInputValue('ticket_details');
            
            const ticketSystem = require('./modules/ticketSystem')(client);
            
            const result = await ticketSystem.createTicket({
              user: interaction.user,
              guild: interaction.guild,
              category: category,
              minecraftNick: minecraftNick,
              details: details
            });
            
            if (result.success) {
              await interaction.editReply({
                content: `✅ Tu ticket ha sido creado: <#${result.channelId}>`
              }).catch(e => {
                console.error("Error al responder sobre ticket creado:", e);
              });
              
              // Liberar el bloqueo después de éxito
              setTimeout(() => {
                antiDuplicate.release(interaction.user.id, 'create_ticket');
              }, 2000);
            } else {
              await interaction.editReply({
                content: `❌ Error al crear el ticket: ${result.message || result.reason || 'Error desconocido'}`
              }).catch(e => {
                console.error("Error al responder sobre fallo de ticket:", e);
              });
              
              // Liberar el bloqueo inmediatamente en caso de error
              antiDuplicate.release(interaction.user.id, 'create_ticket');
            }
          } catch (error) {
            // Liberar el bloqueo en caso de error
            antiDuplicate.release(interaction.user.id, 'create_ticket');
            
            if (error.code !== 10062 && error.code !== 40060) {
              console.error('Error al procesar modal de ticket:', error);
              
              try {
                if (interaction.deferred) {
                  await interaction.editReply({
                    content: '❌ Ocurrió un error al procesar el formulario.'
                  }).catch(() => {});
                } else {
                  await interaction.reply({
                    content: '❌ Ocurrió un error al procesar el formulario.',
                    flags: 64
                  }).catch(() => {});
                }
              } catch (e) {
                console.log('Error al responder a modal:', e.message);
              }
            }
          }
        }
        // Aquí puedes añadir manejo para otros tipos de modales
      } catch (error) {
        console.error('Error general al procesar modal:', error);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ Ocurrió un error al procesar el formulario.',
              flags: 64
            }).catch(() => {});
          } else if (interaction.deferred) {
            await interaction.editReply({
              content: '❌ Ocurrió un error al procesar el formulario.'
            }).catch(() => {});
          }
        } catch (e) {
          console.log('Error fatal al responder a modal:', e.message);
        }
      } finally {
        // Asegurarse de que la limpieza siempre se ejecute
        setTimeout(() => {
          if (interaction.customId && interaction.customId.startsWith('ticket_modal_simple_')) {
            const modalKey = `ticket-${interaction.user.id}`;
            global.processedModals.delete(modalKey);
            antiDuplicateCache.clear(interaction.user.id, 'create_ticket');
          }
        }, 10000);
      }
    }
  } catch (error) {
    // Manejo general de errores para cualquier interacción
    if (error.code !== 10062 && error.code !== 40060) {
      console.error('Error crítico al procesar interacción:', error);
      handleInteractionError(error, 'general');
    }
  }
});

// Manejar nuevo miembro del servidor
client.on('guildCreate', async (guild) => {
  console.log(`¡Bot añadido a un nuevo servidor: ${guild.name} (${guild.id})!`);
  const ticketSystem = require('./modules/ticketSystem')(client);
  ticketSystem.setupGuild(guild);
  
  // Registrar comandos para este servidor específico
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    const commands = loadCommands();
    
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: commands }
    );
    
    console.log(`Comandos registrados para el nuevo servidor: ${guild.name}`);
  } catch (error) {
    console.error(`Error al registrar comandos para el servidor ${guild.name}:`, error);
  }
});

// Procesar mensajes para actualizar actividad de tickets
client.on('messageCreate', async message => {
  // Ignorar mensajes de bots
  if (message.author.bot) return;
  
  // Solo procesar mensajes en canales de texto de servidores
  if (!message.guild || !message.channel) return;
  
  // Verificar si es un canal de ticket
  const ticketSystem = require('./modules/ticketSystem')(client);
  if (ticketSystem.isTicketChannel(message.channel)) {
    // Actualizar actividad para recordatorios y cierre automático
    const ticketReminders = require('./modules/ticketReminders')(client);
    const ticketAutoclose = require('./modules/ticketAutoclose')(client);
    
    ticketReminders.updateTicketActivity(message.channel.id, message.author.id);
    ticketAutoclose.updateActivity(message.channel.id, message.author.id);
  }
});

// Capturar errores no manejados
process.on('uncaughtException', (error) => {
  console.error('Error no manejado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Rechazo no manejado:', reason);
});

// Cargar eventos una sola vez (FUERA de cualquier evento)
console.log('Cargando eventos del sistema...');
const eventHandler = require('./handlers/eventHandler');
eventHandler(client);
console.log('✅ Eventos cargados correctamente');

// Iniciar sesión con el token
client.login(process.env.TOKEN)
  .then(() => {
    console.log('Inicio de sesión exitoso.');
  })
  .catch(error => {
    console.error('Error al iniciar sesión:', error);
    console.error('Verifica que el token en el archivo .env sea correcto y que el bot tenga los permisos de intents necesarios.');
  });