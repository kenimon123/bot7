module.exports = async (client, interaction) => {
  if (!interaction.isModalSubmit()) return;
  
  try {
    // Para formularios de tickets
    if (interaction.customId.startsWith('ticket_modal_simple_')) {
      // Diferir respuesta para evitar timeout
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
      
      try {
        const category = interaction.customId.replace('ticket_modal_simple_', '');
        const minecraftNick = interaction.fields.getTextInputValue('minecraft_nick');
        const details = interaction.fields.getTextInputValue('ticket_details');
        
        // Crear ticket con el sistema mejorado
        const ticketSystem = require('../modules/ticketSystem')(client);
        const result = await ticketSystem.createTicket({
          guild: interaction.guild,
          user: interaction.user,
          category: category,
          reason: "Ticket creado desde formulario",
          minecraftNick: minecraftNick,
          details: details
        });
        
        if (result.success) {
          await interaction.editReply({
            content: `✅ Tu ticket ha sido creado: <#${result.channelId}>`
          }).catch(() => {});
        } else {
          await interaction.editReply({
            content: `❌ Error al crear el ticket: ${result.message || result.reason || 'Error desconocido'}`
          }).catch(() => {});
        }
      } catch (error) {
        console.error("Error al procesar modal de ticket:", error);
        
        await interaction.editReply({
          content: "❌ Ocurrió un error al procesar tu solicitud de ticket."
        }).catch(() => {});
      } finally {
        // Liberar bloqueo al finalizar
        try {
          const ticketLock = require('../modules/ticketLock');
          ticketLock.releaseLock(interaction.user.id);
        } catch (err) {
          console.error("Error al liberar bloqueo:", err);
        }
      }
    }
    
    // Otros tipos de modales...
  } catch (error) {
    console.error("Error global en modalSubmit:", error);
    
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "❌ Ocurrió un error al procesar el formulario.",
          ephemeral: true
        }).catch(() => {});
      } catch (err) {
        // Ignorar errores de respuesta
      }
    }
  }
};