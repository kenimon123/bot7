const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purgar')
    .setDescription('Revoca automáticamente las licencias expiradas')
    .addBooleanOption(option => 
      option.setName('simulación')
        .setDescription('Solo mostrar qué licencias se revocarían sin realizar cambios')
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
    
    const simulation = interaction.options.getBoolean('simulación') || false;
    const now = new Date();
    const expiredLicenses = [];
    
    // Encontrar licencias expiradas que siguen activas
    for (const [key, license] of Object.entries(data.licenses)) {
      if (license.active && new Date(license.expiresAt) < now) {
        expiredLicenses.push({
          key,
          clientName: license.clientName,
          expiryDate: new Date(license.expiresAt)
        });
      }
    }
    
    if (expiredLicenses.length === 0) {
      return interaction.editReply('✅ No hay licencias expiradas que necesiten ser revocadas.');
    }
    
    // Si no es una simulación, revocar las licencias
    if (!simulation) {
      expiredLicenses.forEach(license => {
        data.licenses[license.key].active = false;
        data.licenses[license.key].revokedAt = now.toISOString();
        data.licenses[license.key].revokedBy = interaction.user.id;
        data.licenses[license.key].revokedReason = 'Expirada';
      });
      
      licenseSystem.saveLicenses(data);
    }
    
    const embed = new EmbedBuilder()
      .setTitle(`${simulation ? '🔍 Simulación de Purga' : '🗑️ Purga de Licencias'}`)
      .setColor(simulation ? '#FFA500' : '#FF0000')
      .setDescription(`${simulation ? 'Se encontraron' : 'Se han revocado'} ${expiredLicenses.length} licencias expiradas.`)
      .setTimestamp();
    
    // Mostrar hasta 15 licencias para no hacer el mensaje demasiado largo
    const displayLicenses = expiredLicenses.slice(0, 15);
    
    if (displayLicenses.length > 0) {
      embed.addFields({
        name: 'Licencias afectadas',
        value: displayLicenses.map(l => 
          `**${l.key}** - ${l.clientName} (Expiró el ${l.expiryDate.toLocaleDateString()})`
        ).join('\n')
      });
      
      if (expiredLicenses.length > 15) {
        embed.addFields({
          name: 'Nota',
          value: `Y ${expiredLicenses.length - 15} más...`
        });
      }
    }
    
    if (simulation) {
      embed.addFields({
        name: '⚠️ Modo simulación',
        value: 'Este es solo un vista previa. Ninguna licencia fue revocada realmente.\nEjecuta el comando sin la opción de simulación para realizar los cambios.'
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
  },
};