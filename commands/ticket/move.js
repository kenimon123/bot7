const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Mueve un ticket a otra categoría')
    .addStringOption(option => 
      option.setName('categoría')
        .setDescription('La categoría a la que mover el ticket')
        .setRequired(true)
        .addChoices(
          { name: 'Soporte general', value: 'Soporte general' },
          { name: 'Reportes', value: 'Reportes' },
          { name: 'Apelaciones', value: 'Apelaciones' },
          { name: 'Tienda', value: 'Tienda' },
          { name: 'Administración', value: 'Administración' },
          { name: 'Postulaciones', value: 'Postulaciones' }
        )),
  category: 'ticket',
  
  async execute(interaction) {
    if (!interaction.channel.name.match(/^[a-z]+-\d+$/)) {
      return await interaction.reply({ 
        content: '❌ Este comando solo puede usarse en un canal de ticket.', 
        flags: 64 
      });
    }
    
    await interaction.deferReply();
    
    const ticketSystem = require('../../modules/ticketSystem')(interaction.client);
    const newCategory = interaction.options.getString('categoría');
    
    const result = await ticketSystem.moveTicket(interaction.channel, newCategory, interaction.user);
    
    if (result.success) {
      await interaction.editReply(`✅ Ticket movido a la categoría **${newCategory}**.`);
    } else {
      await interaction.editReply(`❌ Error: ${result.reason || 'No se pudo mover el ticket.'}`);
    }
  },
};