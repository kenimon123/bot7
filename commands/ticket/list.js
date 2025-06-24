const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('listatickets')
    .setDescription('Lista todos los tickets activos'),
  category: 'ticket',
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    // Verificar permisos
    const supportRole = interaction.guild.roles.cache.find(
      r => r.name === interaction.client.config.supportRole
    );
    
    if (!supportRole || !interaction.member.roles.cache.has(supportRole.id)) {
      return await interaction.editReply('❌ No tienes permisos para ver la lista de tickets.');
    }
    
    const ticketsPath = path.join(__dirname, '../../data/tickets.json');
    
    try {
      // Cargar tickets
      const data = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      const activeTickets = data.tickets.filter(
        t => t.guildId === interaction.guild.id && t.status === 'open'
      );
      
      if (activeTickets.length === 0) {
        return await interaction.editReply('No hay tickets activos.');
      }
      
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🎫 Tickets Activos')
        .setDescription(`Total: ${activeTickets.length} tickets abiertos`);
      
      for (const ticket of activeTickets.slice(0, 10)) {  // Limit to 10 tickets
        const channel = interaction.guild.channels.cache.get(ticket.channelId);
        const user = await interaction.client.users.fetch(ticket.userId).catch(() => null);
        const claimedByUser = ticket.claimedBy ? 
          await interaction.client.users.fetch(ticket.claimedBy).catch(() => null) : null;
        
        embed.addFields({
          name: `Ticket #${ticket.id}${ticket.category ? ` (${ticket.category})` : ''}`,
          value: `Usuario: ${user ? user.tag : 'Desconocido'}\n` +
                 `Canal: ${channel ? `<#${channel.id}>` : 'Eliminado'}\n` +
                 `Estado: ${claimedByUser ? `Reclamado por ${claimedByUser.tag}` : 'Sin reclamar'}`
        });
      }
      
      if (activeTickets.length > 10) {
        embed.setFooter({ text: `Mostrando 10 de ${activeTickets.length} tickets` });
      }
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error al listar tickets:', error);
      await interaction.editReply('❌ Ha ocurrido un error al obtener la lista de tickets.');
    }
  },
};