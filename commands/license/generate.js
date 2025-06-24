const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('generar')
    .setDescription('Genera una nueva licencia para ZonePlugin')
    .addStringOption(option => 
      option.setName('cliente')
        .setDescription('Nombre del cliente')
        .setRequired(true))
    .addIntegerOption(option => 
      option.setName('dias')
        .setDescription('Duración de la licencia en días')
        .setRequired(true)
        .setMinValue(1))
    .addStringOption(option => 
      option.setName('servidor')
        .setDescription('ID del servidor (opcional)')
        .setRequired(false)),
  category: 'license',
  
  async execute(interaction) {
    // Verificar permisos
    const licenseRole = interaction.guild.roles.cache.find(r => r.name === interaction.client.config.licenseRole);
    if (!licenseRole || !interaction.member.roles.cache.has(licenseRole.id)) {
      return interaction.reply({ 
        content: `❌ Necesitas el rol ${interaction.client.config.licenseRole} para usar este comando.`,
        ephemeral: true 
      });
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    const licenseSystem = require('../../modules/licenseSystem')(interaction.client);
    
    const clientName = interaction.options.getString('cliente');
    const validityDays = interaction.options.getInteger('dias');
    const serverId = interaction.options.getString('servidor');
    
    if (isNaN(validityDays) || validityDays <= 0) {
      return interaction.editReply('La validez debe ser un número positivo de días.');
    }
    
    const licenseKey = licenseSystem.generateLicenseKey();
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + validityDays);
    
    const data = licenseSystem.loadLicenses();
    data.licenses[licenseKey] = {
      clientName,
      serverId,
      createdBy: interaction.user.id,
      createdAt: new Date().toISOString(),
      expiresAt: expirationDate.toISOString(),
      active: true
    };
    
    licenseSystem.saveLicenses(data);
    
    const embed = new EmbedBuilder()
      .setTitle('🔑 Licencia Generada')
      .setColor(0x00FF00)
      .addFields(
        { name: 'Cliente', value: clientName, inline: true },
        { name: 'Validez', value: `${validityDays} días`, inline: true },
        { name: 'Expira', value: expirationDate.toLocaleDateString(), inline: true },
        { name: 'ID Servidor', value: serverId || 'Cualquier servidor', inline: true },
        { name: 'Clave de Licencia', value: `\`${licenseKey}\`` },
        { name: 'Instrucciones', value: 'Agrega esta clave en la configuración del plugin en el servidor de Minecraft.' }
      )
      .setTimestamp();
    
    try {
      await interaction.user.send({ embeds: [embed] });
      await interaction.editReply('✅ Licencia generada con éxito. Te he enviado los detalles por mensaje privado.');
    } catch (error) {
      await interaction.editReply({
        content: '✅ Licencia generada con éxito, pero no pude enviarte los detalles por mensaje privado. Aquí tienes la información:',
        embeds: [embed]
      });
    }
  },
};