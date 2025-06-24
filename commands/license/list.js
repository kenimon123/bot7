const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('licencias')
    .setDescription('Lista todas las licencias activas')
    .addIntegerOption(option => 
      option.setName('pagina')
        .setDescription('Número de página')
        .setMinValue(1)
        .setRequired(false)),
  category: 'license',
  
  async execute(interaction) {
    // Verificar permisos
    const licenseRole = interaction.guild.roles.cache.find(r => r.name === interaction.client.config.licenseRole);
    if (!licenseRole || !interaction.member.roles.cache.has(licenseRole.id)) {
      return interaction.reply({ 
        content: `❌ Necesitas el rol ${interaction.client.config.licenseRole} para usar este comando.`,
        flags: 64 
      });
    }
    
    await interaction.deferReply({ flags: 64 });
    
    const licenseSystem = require('../../modules/licenseSystem')(interaction.client);
    const data = licenseSystem.loadLicenses();
    
    const activeLicenses = Object.entries(data.licenses).filter(([_, l]) => l.active);
    
    if (activeLicenses.length === 0) {
      return interaction.editReply('No hay licencias activas.');
    }
    
    // Paginación
    const itemsPerPage = 5;
    const page = interaction.options.getInteger('pagina') || 1;
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedLicenses = activeLicenses.slice(startIndex, endIndex);
    const totalPages = Math.ceil(activeLicenses.length / itemsPerPage);
    
    if (paginatedLicenses.length === 0) {
      return interaction.editReply(`No hay licencias en la página ${page}. El máximo es página ${totalPages}.`);
    }
    
    const embed = new EmbedBuilder()
      .setTitle('📋 Lista de Licencias Activas')
      .setColor(0x0099FF)
      .setFooter({ text: `Página ${page}/${totalPages} • Total: ${activeLicenses.length} licencias` });
    
    for (const [key, license] of paginatedLicenses) {
      const expirationDate = new Date(license.expiresAt);
      const daysLeft = Math.ceil((expirationDate - new Date()) / (1000 * 60 * 60 * 24));
      
      embed.addFields({
        name: key,
        value: `**Cliente:** ${license.clientName}\n` +
               `**Expira:** ${expirationDate.toLocaleDateString()} (${daysLeft > 0 ? `${daysLeft} días restantes` : 'Expirada'})\n` +
               `**Servidor:** ${license.serverId || 'Cualquiera'}`
      });
    }
    
    await interaction.editReply({ 
      content: `Mostrando ${paginatedLicenses.length} de ${activeLicenses.length} licencias:`,
      embeds: [embed] 
    });
  },
};