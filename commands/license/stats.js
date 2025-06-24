const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('estadolicencias')
    .setDescription('Muestra estadísticas de las licencias'),
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
    
    const licenses = Object.values(data.licenses);
    
    if (licenses.length === 0) {
      return interaction.editReply('No hay licencias registradas.');
    }
    
    // Estadísticas generales
    const totalLicenses = licenses.length;
    const activeLicenses = licenses.filter(l => l.active).length;
    const revokedLicenses = licenses.filter(l => !l.active).length;
    
    // Licencias a punto de expirar (en los próximos 7 días)
    const now = new Date();
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    
    const expiringSoon = licenses.filter(l => {
      const expiryDate = new Date(l.expiresAt);
      return l.active && expiryDate > now && expiryDate <= sevenDaysLater;
    });
    
    // Licencias expiradas pero aún activas
    const expired = licenses.filter(l => {
      return l.active && new Date(l.expiresAt) < now;
    });
    
    // Agrupar por clientes
    const clientCounts = {};
    licenses.forEach(license => {
      if (license.active) {
        clientCounts[license.clientName] = (clientCounts[license.clientName] || 0) + 1;
      }
    });
    
    const topClients = Object.entries(clientCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Estadísticas de Licencias')
      .setColor('#0099FF')
      .addFields(
        { name: 'Total de licencias', value: `${totalLicenses}`, inline: true },
        { name: 'Licencias activas', value: `${activeLicenses}`, inline: true },
        { name: 'Licencias revocadas', value: `${revokedLicenses}`, inline: true },
        { name: 'Por expirar (7 días)', value: `${expiringSoon.length}`, inline: true },
        { name: 'Expiradas (aún activas)', value: `${expired.length}`, inline: true }
      )
      .setTimestamp();
    
    // Añadir top clientes si hay datos
    if (topClients.length > 0) {
      embed.addFields({
        name: 'Top clientes',
        value: topClients.map(([client, count]) => `**${client}**: ${count} licencias`).join('\n')
      });
    }
    
    // Añadir licencias a punto de expirar
    if (expiringSoon.length > 0) {
      embed.addFields({
        name: '⚠️ Licencias por expirar',
        value: expiringSoon
          .slice(0, 5)
          .map(l => `**${l.clientName}**: Expira el ${new Date(l.expiresAt).toLocaleDateString()}`)
          .join('\n') + (expiringSoon.length > 5 ? `\n*y ${expiringSoon.length - 5} más...*` : '')
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
  }
};