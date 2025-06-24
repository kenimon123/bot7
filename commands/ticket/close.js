const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cerrarticket')
    .setDescription('Cierra el ticket actual'),
  category: 'ticket',
  
  async execute(interaction) {
    const ticketSystem = require('../../modules/ticketSystem')(interaction.client);
    
    // Usar la nueva función para validar el canal
    if (!ticketSystem.isTicketChannel(interaction.channel)) {
      return await interaction.reply({ 
        content: '❌ Este comando solo puede usarse en un canal de ticket.', 
        ephemeral: true 
      });
    }
    
    await interaction.deferReply();
    
    try {
      const result = await ticketSystem.closeTicket(interaction.channel, interaction.user);
      
      if (!result.success) {
        await interaction.editReply(`❌ No se pudo cerrar este ticket: ${result.reason || 'Error desconocido'}`);
      } else {
        // Cerrado correctamente - el canal se eliminará pronto
        await interaction.editReply('✅ Cerrando ticket...');
      }
    } catch (error) {
      console.error('Error al cerrar ticket:', error);
      await interaction.editReply('❌ Ocurrió un error al cerrar el ticket.');
    }
  },
};