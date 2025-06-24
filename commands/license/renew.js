const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('renovar')
    .setDescription('Renueva una licencia existente')
    .addStringOption(option => 
      option.setName('licencia')
        .setDescription('Clave de licencia a renovar')
        .setRequired(true))
    .addIntegerOption(option => 
      option.setName('dias')
        .setDescription('Días a añadir a la licencia')
        .setRequired(true)
        .setMinValue(1)),
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
    
    const licenseKey = interaction.options.getString('licencia');
    const additionalDays = interaction.options.getInteger('dias');
    
    // Validación adicional
    if (additionalDays <= 0) {
      return interaction.editReply('❌ El número de días debe ser un valor positivo.');
    }
    
    if (additionalDays > 365) {
      return interaction.editReply('❌ No se pueden añadir más de 365 días a la vez.');
    }
    
    // Comprobar que la licencia existe
    if (!data.licenses[licenseKey]) {
      return interaction.editReply('❌ Esta licencia no existe en la base de datos.');
    }
    
    const license = data.licenses[licenseKey];
    
    // Calcular nueva fecha de expiración
    const currentExpiry = new Date(license.expiresAt);
    const now = new Date();
    
    // Si la licencia ya expiró, comenzar desde hoy
    const startDate = currentExpiry < now ? now : currentExpiry;
    const newExpiry = new Date(startDate);
    newExpiry.setDate(newExpiry.getDate() + additionalDays);
    
    // Actualizar licencia
    data.licenses[licenseKey].expiresAt = newExpiry.toISOString();
    data.licenses[licenseKey].active = true; // Activar si estaba revocada
    data.licenses[licenseKey].renewedAt = new Date().toISOString();
    data.licenses[licenseKey].renewedBy = interaction.user.id;
    
    licenseSystem.saveLicenses(data);
    
    const embed = new EmbedBuilder()
      .setTitle('🔄 Licencia Renovada')
      .setColor(0x00FF00)
      .addFields(
        { name: 'Cliente', value: license.clientName, inline: true },
        { name: 'Días añadidos', value: `${additionalDays}`, inline: true },
        { name: 'Nueva expiración', value: newExpiry.toLocaleDateString(), inline: true },
        { name: 'Licencia', value: licenseKey }
      )
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    
    // Intentar notificar al dueño de la licencia
    try {
      if (license.createdBy) {
        const licenseOwner = await interaction.client.users.fetch(license.createdBy);
        if (licenseOwner) {
          await licenseOwner.send({
            content: `Tu licencia para **${license.clientName}** ha sido renovada por ${interaction.user.tag}.`,
            embeds: [embed]
          }).catch(() => {}); // Ignorar errores al enviar DM
        }
      }
    } catch (err) {
      // Ignorar errores al buscar usuario
    }
  },
};