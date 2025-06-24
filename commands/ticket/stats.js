const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Muestra estadísticas de tickets'),
  category: 'ticket',
  
  async execute(interaction) {
    await interaction.deferReply();
    
    const statsPath = path.join(__dirname, '../../data/ticketStats.json');
    const ticketsPath = path.join(__dirname, '../../data/tickets.json');
    
    try {
      // Verificar que existan los archivos
      if (!fs.existsSync(statsPath) || !fs.existsSync(ticketsPath)) {
        return await interaction.editReply('❌ No hay estadísticas disponibles todavía.');
      }
      
      // Cargar datos
      const statsData = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
      const ticketData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
      
      // Obtener estadísticas específicas para este servidor
      const guildId = interaction.guild.id;
      const serverStats = statsData.servers?.[guildId] || { userStats: {} };
      
      // Filtrar tickets que pertenecen a este servidor
      const serverTickets = ticketData.tickets.filter(t => t.guildId === guildId);
      
      // Contar tickets por categoría para este servidor
      const categoryCounts = {};
      for (const ticket of serverTickets) {
        const category = ticket.category || 'Sin categoría';
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      }
      
      // Contar tickets por estado para este servidor
      const openTickets = serverTickets.filter(t => t.status === 'open').length;
      const closedTickets = serverTickets.filter(t => t.status === 'closed').length;
      
      // Tickets cerrados por inactividad para este servidor
      const inactiveTickets = serverTickets.filter(t => 
        t.status === 'closed' && t.closedReason && t.closedReason.includes('Inactividad')
      ).length;
      
      // Crear embed
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle(`📊 Estadísticas de Tickets - ${interaction.guild.name}`)
        .addFields(
          { name: 'Total de Tickets', value: `${serverTickets.length}`, inline: true },
          { name: 'Tickets Abiertos', value: `${openTickets}`, inline: true },
          { name: 'Tickets Cerrados', value: `${closedTickets}`, inline: true },
          { name: 'Cerrados por Inactividad', value: `${inactiveTickets}`, inline: true }
        )
        .setTimestamp()
        .setFooter({ 
          text: `Última actualización: ${new Date(statsData.lastUpdate || Date.now()).toLocaleDateString()}`,
          iconURL: interaction.guild.iconURL()
        });
      
      // Añadir estadísticas por categoría si hay datos
      if (Object.keys(categoryCounts).length > 0) {
        let categoryStats = '';
        for (const [category, count] of Object.entries(categoryCounts)) {
          categoryStats += `${category}: **${count}**\n`;
        }
        embed.addFields({ name: 'Tickets por Categoría', value: categoryStats });
      }
      
      // Añadir top 5 de staff para este servidor
      if (serverStats.userStats && Object.keys(serverStats.userStats).length > 0) {
        // Ordenar por tickets cerrados
        const topStaff = Object.entries(serverStats.userStats)
          .sort((a, b) => b[1].closed - a[1].closed)
          .slice(0, 5);
        
        let staffStats = '';
        for (const [userId, userData] of topStaff) {
          const user = await interaction.client.users.fetch(userId).catch(() => null);
          if (user) {
            // Incluir tickets inactivos en las estadísticas
            const inactive = userData.inactive || 0;
            staffStats += `${user.tag}: **${userData.closed}** cerrados (**${inactive}** por inactividad)\n`;
          }
        }
        
        if (staffStats) {
          embed.addFields({ name: 'Top Staff', value: staffStats });
        }
      } else {
        embed.addFields({ name: 'Top Staff', value: 'No hay datos suficientes aún.' });
      }
      
      // Añadir estadística de tiempo promedio de respuesta si está disponible
      if (serverStats.avgResponseTime) {
        const avgHours = Math.floor(serverStats.avgResponseTime / 60);
        const avgMinutes = serverStats.avgResponseTime % 60;
        embed.addFields({ 
          name: '⏱️ Tiempo promedio de respuesta', 
          value: `${avgHours}h ${avgMinutes}min`, 
          inline: true 
        });
      }
      
      // Añadir información de tickets recientes si hay datos
      const recentTickets = serverTickets
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 3);
        
      if (recentTickets.length > 0) {
        let recentTicketsText = '';
        for (const ticket of recentTickets) {
          const createdDate = new Date(ticket.createdAt).toLocaleString();
          const status = ticket.status === 'open' ? '🟢 Abierto' : '🔴 Cerrado';
          recentTicketsText += `#${ticket.id} - ${status} - ${createdDate}\n`;
        }
        
        embed.addFields({ 
          name: 'Tickets Recientes', 
          value: recentTicketsText 
        });
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error al mostrar estadísticas:', error);
      await interaction.editReply('❌ Ha ocurrido un error al obtener las estadísticas.');
    }
  },
};