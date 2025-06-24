const { ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const antiDuplicateCache = require('../modules/antiDuplicateCache');

module.exports = async (client, interaction) => {
  try {
    // SISTEMA ANTIDUPLICADO PARA TODAS LAS INTERACCIONES
    const userId = interaction.user.id;
    const interactionType = interaction.type;
    const customId = interaction.customId || 'unknown';
    
    // Crear clave específica para esta interacción
    const interactionKey = `${userId}_${customId}_${interactionType}`;
    
    // Verificar si esta interacción ya fue procesada
    if (global.processedInteractions && global.processedInteractions.has(interactionKey)) {
      console.log(`Interacción duplicada bloqueada: ${interactionKey}`);
      return;
    }
    
    // Marcar como procesada
    if (!global.processedInteractions) global.processedInteractions = new Set();
    global.processedInteractions.add(interactionKey);
    
    // Auto-limpieza después de 10 segundos
    setTimeout(() => {
      if (global.processedInteractions) {
        global.processedInteractions.delete(interactionKey);
      }
    }, 10000);
    
    // COMANDOS SLASH - Con verificación de permisos
    if (interaction.isCommand()) {
      const command = client.slashCommands.get(interaction.commandName);
      
      if (!command) {
        console.log(`Comando no encontrado: ${interaction.commandName}`);
        return;
      }
      
      // Verificar permisos para comandos de tickets y licencias
      if (command.category === 'ticket') {
        const permissionHandler = require('../modules/permissionHandler')(client);
        const hasPermission = permissionHandler.canManageTickets(interaction.member);
        
        // Excepción para comandos administrativos
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const isSetupCommand = interaction.commandName === 'setuptickets';
        
        // Solo permitir comandos de tickets a staff o administradores (setuptickets solo para admin)
        if ((isSetupCommand && !isAdmin) || (!isSetupCommand && !hasPermission && !isAdmin)) {
          return interaction.reply({ 
            content: `❌ Necesitas el rol ${client.config.supportRole} o ser administrador para usar este comando.`, 
            flags: 64 
          });
        }
      }
      
      // Sistema anti-cooldown mejorado
      const { cooldowns } = client;
      
      if (!cooldowns.has(command.data.name)) {
        cooldowns.set(command.data.name, new Map());
      }
      
      const now = Date.now();
      const timestamps = cooldowns.get(command.data.name);
      const cooldownAmount = (command.cooldown || 3) * 1000;
      
      if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
        
        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;
          return interaction.reply({ 
            content: `Por favor espera ${timeLeft.toFixed(1)} segundos antes de usar el comando \`${command.data.name}\` nuevamente.`, 
            flags: 64 
          }).catch(console.error);
        }
      }
      
      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
      
      // Ejecutar el comando con manejo de errores mejorado
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
      }
    }
    
    // BOTONES - Con manejo de permisos y anti-duplicación
    else if (interaction.isButton()) {
      const buttonId = interaction.customId;
      
      // Sistema de antiduplicación para botones
      const duplicateCheck = antiDuplicateCache.checkAndLock(interaction.user.id, `button_${buttonId}`, 5000);
      if (!duplicateCheck.allowed) {
        return await interaction.reply({
          content: `Por favor, espera antes de usar este botón nuevamente. ${duplicateCheck.timeLeft ? `(${duplicateCheck.timeLeft}s)` : ''}`,
          flags: 64
        }).catch(console.error);
      }
      
      try {
        // BOTÓN DE CERRAR TICKET
        if (buttonId === 'close_ticket') {
          const ticketSystem = require('../modules/ticketSystem')(client);
          
          if (!ticketSystem.isTicketChannel(interaction.channel)) {
            antiDuplicateCache.release(interaction.user.id, `button_${buttonId}`);
            return await interaction.reply({
              content: '❌ Este botón solo funciona en canales de ticket.', 
              flags: 64 
            }).catch(console.error);
          }
          
          await interaction.deferReply();
          
          const result = await ticketSystem.closeTicket(interaction.channel, interaction.user);
          
          if (!result.success && result.reason !== "Este ticket ya está en proceso de cierre") {
            await interaction.editReply(`❌ No se pudo cerrar este ticket: ${result.reason || 'Error desconocido'}`).catch(console.error);
          } else {
            await interaction.editReply('✅ Cerrando ticket...');
          }
          
          // Liberar el bloqueo después de procesar
          antiDuplicateCache.release(interaction.user.id, `button_${buttonId}`);
        }
        
        // BOTÓN DE RECLAMAR TICKET
        else if (buttonId === 'claim_ticket') {
          const ticketSystem = require('../modules/ticketSystem')(client);
          
          if (!ticketSystem.isTicketChannel(interaction.channel)) {
            antiDuplicateCache.release(interaction.user.id, `button_${buttonId}`);
            return await interaction.reply({
              content: '❌ Este botón solo funciona en canales de ticket.', 
              flags: 64 
            }).catch(console.error);
          }
          
          await interaction.deferReply();
          
          const result = await ticketSystem.claimTicket(interaction.channel, interaction.user);
          
          if (!result.success) {
            await interaction.editReply(`❌ No se pudo reclamar este ticket: ${result.reason || 'Error desconocido'}`).catch(console.error);
          } else {
            await interaction.editReply('✅ Has reclamado este ticket. Ahora estás a cargo.').catch(console.error);
          }
          
          antiDuplicateCache.release(interaction.user.id, `button_${buttonId}`);
        }
        
        // BOTÓN DE MOVER TICKET
        else if (buttonId === 'move_ticket') {
          const ticketSystem = require('../modules/ticketSystem')(client);
          const permissionHandler = require('../modules/permissionHandler')(client);
          
          if (!ticketSystem.isTicketChannel(interaction.channel)) {
            antiDuplicateCache.release(interaction.user.id, `button_${buttonId}`);
            return await interaction.reply({
              content: '❌ Este botón solo funciona en canales de ticket.', 
              flags: 64 
            }).catch(console.error);
          }
          
          // Verificar permisos
          if (!permissionHandler.canManageTickets(interaction.member)) {
            antiDuplicateCache.release(interaction.user.id, `button_${buttonId}`);
            return await interaction.reply({
              content: `❌ Necesitas el rol ${client.config.supportRole} para mover tickets.`, 
              flags: 64 
            }).catch(console.error);
          }
          
          // Crear opciones para el menú de categorías
          const options = client.config.ticketCategories.map(category => ({
            label: category.name,
            value: category.name,
            emoji: category.emoji,
            description: category.description || `Mover a ${category.name}`
          }));
          
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
          
          antiDuplicateCache.release(interaction.user.id, `button_${buttonId}`);
        }
      } catch (error) {
        console.error('Error al procesar botón:', error);
        
        // Asegurarse de liberar el bloqueo
        antiDuplicateCache.release(interaction.user.id, `button_${buttonId}`);
        
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
              content: 'Ocurrió un error al procesar tu solicitud.',
              flags: 64
            }).catch(() => {});
          } else {
            await interaction.reply({
              content: 'Ocurrió un error al procesar tu solicitud.',
              flags: 64
            }).catch(() => {});
          }
        } catch (replyError) {
          console.error('Error al responder a interacción de botón:', replyError);
        }
      }
    }
    
    // MENÚS DE SELECCIÓN - Implementación completa
    else if (interaction.isStringSelectMenu()) {
      const menuId = interaction.customId;
      
      // Sistema de antiduplicación para menús de selección
      const duplicateCheck = antiDuplicateCache.checkAndLock(interaction.user.id, `menu_${menuId}`, 5000);
      if (!duplicateCheck.allowed) {
        return await interaction.reply({
          content: `Por favor, espera antes de usar este menú nuevamente. ${duplicateCheck.timeLeft ? `(${duplicateCheck.timeLeft}s)` : ''}`,
          flags: 64
        }).catch(console.error);
      }
      
      try {
        // MENÚ PARA CREAR TICKETS
if (menuId === 'ticket_category') {
  // Evitar procesar varias veces la misma interacción
  const selectedValue = interaction.values[0];
  const uniqueKey = `ticket_select_${interaction.user.id}_${Date.now()}`;
  
  if (global.processedTicketSelections && global.processedTicketSelections.has(interaction.user.id)) {
    console.log(`[Tickets] Selección duplicada bloqueada para ${interaction.user.tag}`);
    return await interaction.reply({
      content: "Procesando tu solicitud anterior. Por favor, espera...",
      flags: 64
    }).catch(console.error);
  }
  
  // Marcar como procesado
  if (!global.processedTicketSelections) global.processedTicketSelections = new Set();
  global.processedTicketSelections.add(interaction.user.id);
  
  // Auto-limpieza después de 10 segundos
  setTimeout(() => {
    if (global.processedTicketSelections) {
      global.processedTicketSelections.delete(interaction.user.id);
    }
  }, 10000);
  
  const ticketSystem = require('../modules/ticketSystem')(client);
  
  // Verificar si puede crear un ticket
  const checkResult = ticketSystem.canCreateTicket(interaction.user.id, interaction.guild.id);
  if (!checkResult.allowed) {
    antiDuplicateCache.release(interaction.user.id, `menu_${menuId}`);
    return await interaction.reply({
      content: `⚠️ ${checkResult.message}`,
      flags: 64
    }).catch(console.error);
  }

  try {
    // Mostrar modal con campos para completar
    const categoryName = client.config.ticketCategories.find(c => 
      c.name.toLowerCase() === selectedValue.toLowerCase() || 
      c.name === selectedValue
    )?.name || selectedValue;
    
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
    // Limpiar registro en caso de error
    global.processedTicketSelections.delete(interaction.user.id);
    antiDuplicateCache.release(interaction.user.id, `menu_${menuId}`);
    
    if (modalError.code !== 10062) {
      console.error('Error al mostrar modal:', modalError);
      
      try {
        await interaction.reply({
          content: 'Ocurrió un error al abrir el formulario. Por favor intenta nuevamente.',
          flags: 64
        }).catch(() => {});
      } catch (replyError) {
        console.error('No se pudo responder a la interacción de modal:', replyError.message);
      }
    }
  }
}
        
        // MENÚ PARA MOVER TICKETS ENTRE CATEGORÍAS
        else if (menuId === 'move_ticket_category') {
          const ticketSystem = require('../modules/ticketSystem')(client);
          const selectedCategory = interaction.values[0];
          
          if (!ticketSystem.isTicketChannel(interaction.channel)) {
            antiDuplicateCache.release(interaction.user.id, `menu_${menuId}`);
            return await interaction.reply({
              content: '❌ Este menú solo funciona en canales de ticket.',
              flags: 64
            }).catch(console.error);
          }
          
          await interaction.deferReply({ flags: 64 });
          
          const result = await ticketSystem.moveTicket(interaction.channel, selectedCategory, interaction.user);
          
          if (result.success) {
            await interaction.editReply({
              content: `✅ Ticket movido a la categoría **${selectedCategory}**`
            });
            
            // Mensaje para todos en el canal
            await interaction.channel.send({
              content: `📁 ${interaction.user} ha movido este ticket a la categoría **${selectedCategory}**`
            });
          } else {
            await interaction.editReply({
              content: `❌ Error al mover el ticket: ${result.reason || 'Error desconocido'}`
            });
          }
          
          antiDuplicateCache.release(interaction.user.id, `menu_${menuId}`);
        }
        
        // Otros manejadores de menús aquí...
        
      } catch (error) {
        console.error('Error al procesar menú de selección:', error);
        
        // Liberar bloqueo
        antiDuplicateCache.release(interaction.user.id, `menu_${menuId}`);
        
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
              content: 'Ocurrió un error al procesar tu selección.',
              flags: 64
            }).catch(() => {});
          } else {
            await interaction.reply({
              content: 'Ocurrió un error al procesar tu selección.',
              flags: 64
            }).catch(() => {});
          }
        } catch (replyError) {
          console.error('Error al responder a interacción de menú:', replyError);
        }
      }
    }
    
    // MODALES - Con sistema antiduplicados
    else if (interaction.isModalSubmit()) {
      const modalId = interaction.customId;
      
      // Sistema de antiduplicación para modales
      const duplicateCheck = antiDuplicateCache.checkAndLock(interaction.user.id, `modal_${modalId}`, 10000); // Mayor tiempo para modales
      if (!duplicateCheck.allowed) {
        return await interaction.reply({
          content: `Por favor, espera antes de enviar este formulario nuevamente.`,
          flags: 64
        }).catch(console.error);
      }
      
      try {
        // Para modales de creación de tickets
        if (modalId.startsWith('ticket_modal_simple_')) {
          try {
            await interaction.deferReply({ flags: 64 });
            
            const category = modalId.replace('ticket_modal_simple_', '');
            const minecraftNick = interaction.fields.getTextInputValue('minecraft_nick');
            const details = interaction.fields.getTextInputValue('ticket_details');
            
            const ticketSystem = require('../modules/ticketSystem')(client);
            
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
              });
            } else {
              await interaction.editReply({
                content: `❌ Error al crear el ticket: ${result.message || result.reason || 'Error desconocido'}`
              });
            }
          } catch (error) {
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
              console.error('Error al responder a modal:', e.message);
            }
          }
        }
        
        // Liberar bloqueo al finalizar
        antiDuplicateCache.release(interaction.user.id, `modal_${modalId}`);
      } catch (error) {
        console.error('Error al procesar modal:', error);
        antiDuplicateCache.release(interaction.user.id, `modal_${modalId}`);
        
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'Ocurrió un error al procesar tu formulario.',
              flags: 64
            }).catch(() => {});
          } else if (interaction.deferred) {
            await interaction.editReply({
              content: 'Ocurrió un error al procesar tu formulario.'
            }).catch(() => {});
          }
        } catch (replyError) {
          console.error('Error al responder a interacción de modal:', replyError);
        }
      }
    }
    
  } catch (error) {
    console.error('Error general al procesar interacción:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Ocurrió un error al procesar tu solicitud.',
          flags: 64
        }).catch(() => {});
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: 'Ocurrió un error al procesar tu solicitud.'
        }).catch(() => {});
      }
    } catch (replyError) {
      console.error('Error fatal al responder a interacción:', replyError);
    }
  }
};
