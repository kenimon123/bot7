const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ayuda')
    .setDescription('Muestra información de ayuda sobre los comandos'),
  
  async execute(interaction) {
    const client = interaction.client;
    
    // Agrupar comandos por categoría
    const commandsByCategory = {
      license: [],
      ticket: [],
      general: []
    };
    
    client.slashCommands.forEach(command => {
      const category = command.category || 'general';
      if (commandsByCategory[category]) {
        commandsByCategory[category].push(command);
      } else {
        commandsByCategory.general.push(command);
      }
    });
    
    const embed = new EmbedBuilder()
      .setTitle('📋 Comandos del Bot')
      .setColor('#0099FF')
      .setDescription('Aquí tienes una lista de todos los comandos disponibles:');
    
    // Añadir campos para cada categoría
    if (commandsByCategory.license?.length > 0) {
      embed.addFields({
        name: '🔑 Sistema de Licencias',
        value: commandsByCategory.license.map(cmd => 
          `**/${cmd.data.name}**: ${cmd.data.description}`
        ).join('\n')
      });
    }
    
    if (commandsByCategory.ticket?.length > 0) {
      embed.addFields({
        name: '🎫 Sistema de Tickets',
        value: commandsByCategory.ticket.map(cmd => 
          `**/${cmd.data.name}**: ${cmd.data.description}`
        ).join('\n')
      });
    }
    
    if (commandsByCategory.general?.length > 0) {
      embed.addFields({
        name: '💬 Comandos Generales',
        value: commandsByCategory.general.map(cmd => 
          `**/${cmd.data.name}**: ${cmd.data.description}`
        ).join('\n')
      });
    }
    
    embed.setFooter({ text: 'Para más información sobre un comando, usa /ayuda comando' });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
