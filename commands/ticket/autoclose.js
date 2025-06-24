const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoclose')
    .setDescription('Configura el cierre automático de tickets inactivos')
    .addSubcommand(subcommand =>
      subcommand
        .setName('activar')
        .setDescription('Activa o desactiva el cierre automático')
        .addBooleanOption(option =>
          option
            .setName('estado')
            .setDescription('Estado del cierre automático')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('aviso')
        .setDescription('Configura las horas antes de avisar')
        .addIntegerOption(option =>
          option
            .setName('horas')
            .setDescription('Horas de inactividad antes de avisar')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(168) // 1 semana
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cierre')
        .setDescription('Configura las horas antes de cerrar')
        .addIntegerOption(option =>
          option
            .setName('horas')
            .setDescription('Horas de inactividad antes de cerrar')
            .setRequired(true)
            .setMinValue(2)
            .setMaxValue(336) // 2 semanas
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('exentar')
        .setDescription('Exentar una categoría del cierre automático')
        .addStringOption(option =>
          option
            .setName('categoría')
            .setDescription('Categoría a exentar')
            .setRequired(true)
            .addChoices(
              { name: 'Soporte general', value: 'Soporte general' },
              { name: 'Reportes', value: 'Reportes' },
              { name: 'Apelaciones', value: 'Apelaciones' },
              { name: 'Tienda', value: 'Tienda' },
              { name: 'Administración', value: 'Administración' },
              { name: 'Postulaciones', value: 'Postulaciones' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ver')
        .setDescription('Ver la configuración actual del cierre automático')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  category: 'ticket',
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      const autocloseSystem = require('../../modules/ticketAutoclose')(interaction.client);
      const config = autocloseSystem.loadConfig();
      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === 'activar') {
        const enabled = interaction.options.getBoolean('estado');
        config.enabled = enabled;
        autocloseSystem.saveConfig(config);
        
        return await interaction.editReply(`✅ El cierre automático de tickets ha sido ${enabled ? 'activado' : 'desactivado'}.`);
      }
      else if (subcommand === 'aviso') {
        const hours = interaction.options.getInteger('horas');
        
        if (hours >= config.closeHours) {
          return await interaction.editReply('❌ Las horas de aviso deben ser menores que las horas de cierre.');
        }
        
        config.warningHours = hours;
        autocloseSystem.saveConfig(config);
        
        return await interaction.editReply(`✅ Se avisará de inactividad después de **${hours} horas**.`);
      }
      else if (subcommand === 'cierre') {
        const hours = interaction.options.getInteger('horas');
        
        if (hours <= config.warningHours) {
          return await interaction.editReply('❌ Las horas de cierre deben ser mayores que las horas de aviso.');
        }
        
        config.closeHours = hours;
        autocloseSystem.saveConfig(config);
        
        return await interaction.editReply(`✅ Los tickets se cerrarán automáticamente después de **${hours} horas** de inactividad.`);
      }
      else if (subcommand === 'exentar') {
        const category = interaction.options.getString('categoría');
        
        const index = config.exemptCategories.indexOf(category);
        if (index !== -1) {
          // Ya está en la lista, lo quitamos
          config.exemptCategories.splice(index, 1);
          autocloseSystem.saveConfig(config);
          
          return await interaction.editReply(`✅ La categoría **${category}** ya no está exenta del cierre automático.`);
        } else {
          // No está en la lista, lo añadimos
          config.exemptCategories.push(category);
          autocloseSystem.saveConfig(config);
          
          return await interaction.editReply(`✅ La categoría **${category}** ahora está exenta del cierre automático.`);
        }
      }
      else if (subcommand === 'ver') {
        const embed = new EmbedBuilder()
          .setTitle('⚙️ Configuración de Cierre Automático')
          .setColor('#0099FF')
          .addFields(
            { name: 'Estado', value: config.enabled ? '✅ Activado' : '❌ Desactivado', inline: true },
            { name: 'Aviso', value: `${config.warningHours} horas`, inline: true },
            { name: 'Cierre', value: `${config.closeHours} horas`, inline: true }
          );
        
        if (config.exemptCategories.length > 0) {
          embed.addFields({
            name: 'Categorías Exentas',
            value: config.exemptCategories.join('\n') || 'Ninguna'
          });
        }
        
        return await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error en comando autoclose:', error);
      return await interaction.editReply('❌ Ha ocurrido un error al configurar el cierre automático.');
    }
  },
};