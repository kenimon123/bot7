const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purgartickets')
    .setDescription('Purga los tickets huérfanos (sin canal) del sistema')
    .addBooleanOption(option => 
      option.setName('simulacion')
        .setDescription('Mostrar qué se purgaría sin hacer cambios')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  category: 'ticket',
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      const ticketSystem = require('../../modules/ticketSystem')(interaction.client);
      const data = ticketSystem.loadTickets();
      const simulation = interaction.options.getBoolean('simulacion') ?? false;
      
      // Tickets abiertos cuyo canal ya no existe
      const orphanTickets = [];
      
      for (const ticket of data.tickets) {
        if (ticket.status === 'open') {
          const channel = interaction.guild.channels.cache.get(ticket.channelId);
          if (!channel) {
            orphanTickets.push(ticket);
            
            if (!simulation) {
              // Marcar como cerrado
              ticket.status = 'closed';
              ticket.closedAt = new Date().toISOString();
              ticket.closedBy = interaction.client.user.id;
              ticket.closedReason = 'Canal eliminado - purga automática';
            }
          }
        }
      }
      
      if (!simulation && orphanTickets.length > 0) {
        ticketSystem.saveTickets(data);
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`${simulation ? '🔍 Simulación' : '🧹 Purga'} de Tickets Huérfanos`)
        .setColor(simulation ? '#FFA500' : '#00FF00')
        .setDescription(`Se ${simulation ? 'encontraron' : 'purgaron'} **${orphanTickets.length}** tickets huérfanos.`);
      
      if (orphanTickets.length > 0) {
        let ticketList = orphanTickets
          .slice(0, 10)
          .map(t => `• Ticket #${t.id} - Usuario: <@${t.userId}>`)
          .join('\n');
        
        if (orphanTickets.length > 10) {
          ticketList += `\n... y ${orphanTickets.length - 10} más`;
        }
        
        embed.addFields({ name: 'Tickets Afectados', value: ticketList });
      }
      
      if (simulation && orphanTickets.length > 0) {
        embed.addFields({ 
          name: '⚠️ Modo Simulación', 
          value: 'Ejecuta el comando sin la opción "simulacion" para purgar realmente los tickets.'
        });
      }
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error al purgar tickets:', error);
      await interaction.editReply('❌ Ocurrió un error al purgar los tickets.');
    }
  },
};