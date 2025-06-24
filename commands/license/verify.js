const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verificar')
    .setDescription('Verifica el estado de una licencia')
    .addStringOption(option => 
      option.setName('licencia')
        .setDescription('Clave de licencia a verificar')
        .setRequired(true)
        .setMinLength(14) // Formato XXXX-XXXX-XXXX-XXXX
        .setMaxLength(19)) // Con posibles espacios extras
    .addStringOption(option => 
      option.setName('servidor')
        .setDescription('ID del servidor (opcional)')
        .setRequired(false)),
  category: 'license',
  
  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    
    try {
      const licenseSystem = require('../../modules/licenseSystem')(interaction.client);
      
      // Limpiar y formatear la licencia para prevenir errores de formato
      let licenseKey = interaction.options.getString('licencia');
      
      // Formatear la clave si es necesario (quitar espacios, convertir a mayúsculas)
      licenseKey = licenseKey.toUpperCase().replace(/\s+/g, '');
      
      // Si no tiene guiones, intentar formatearla
      if (!licenseKey.includes('-') && licenseKey.length === 16) {
        licenseKey = `${licenseKey.slice(0, 4)}-${licenseKey.slice(4, 8)}-${licenseKey.slice(8, 12)}-${licenseKey.slice(12, 16)}`;
      }
      
      const serverId = interaction.options.getString('servidor');
      
      // Verificar formato de licencia
      if (!licenseKey.match(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)) {
        return interaction.editReply({ 
          content: '❌ Formato de licencia inválido. Debe ser XXXX-XXXX-XXXX-XXXX'
        });
      }
      
      // Verificar formato de ID de servidor si se proporcionó
      if (serverId && !serverId.match(/^\d{17,20}$/)) {
        return interaction.editReply({
          content: '❌ Formato de ID de servidor inválido. Debe ser un número de 17-20 dígitos.'
        });
      }
      
      const result = licenseSystem.verifyLicense(licenseKey, serverId);
      const data = licenseSystem.loadLicenses();
      
      if (!data.licenses[licenseKey]) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Licencia Inválida')
          .setColor(0xFF0000)
          .setDescription('Esta licencia no existe en la base de datos')
          .setFooter({ text: 'Verifica que hayas escrito correctamente la clave' });
        
        return interaction.editReply({ embeds: [embed] });
      }
      
      const license = data.licenses[licenseKey];
      
      if (result.valid) {
        const expiryDate = new Date(license.expiresAt);
        const creationDate = new Date(license.createdAt);
        const daysLeft = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
        
        // Color basado en días restantes
        let color;
        if (daysLeft > 30) {
          color = 0x00FF00; // Verde para más de 30 días
        } else if (daysLeft > 7) {
          color = 0xFFAA00; // Naranja para menos de 30 días
        } else {
          color = 0xFF5500; // Rojo para menos de 7 días
        }
        
        const embed = new EmbedBuilder()
          .setTitle('✅ Licencia Válida')
          .setColor(color)
          .addFields(
            { name: 'Cliente', value: license.clientName, inline: true },
            { name: 'Expira', value: expiryDate.toLocaleDateString(), inline: true },
            { name: 'Días restantes', value: `${daysLeft}`, inline: true },
            { name: 'ID Servidor', value: license.serverId || 'Cualquier servidor', inline: true },
            { name: 'Creada', value: creationDate.toLocaleDateString(), inline: true }
          );
        
        // Si tiene renovaciones, mostrar información
        if (license.renewedAt) {
          const renewalDate = new Date(license.renewedAt);
          embed.addFields({
            name: 'Última renovación',
            value: `${renewalDate.toLocaleDateString()}`,
            inline: true
          });
        }
        
        await interaction.editReply({ embeds: [embed] });
      } else {
        const reasons = {
          'no_exists': 'La licencia no existe',
          'revoked': 'La licencia ha sido revocada',
          'expired': 'La licencia ha expirado',
          'wrong_server': 'La licencia pertenece a otro servidor'
        };
        
        let additionalInfo = '';
        
        // Proporcionar información adicional útil
        if (result.reason === 'expired' && result.expiryDate) {
          const expiredDays = Math.ceil((new Date() - result.expiryDate) / (1000 * 60 * 60 * 24));
          additionalInfo = `\nLa licencia expiró hace ${expiredDays} días (${result.expiryDate.toLocaleDateString()})`;
        } else if (result.reason === 'wrong_server' && license.serverId) {
          additionalInfo = `\nEsta licencia está vinculada al servidor con ID: ${license.serverId}`;
        } else if (result.reason === 'revoked' && license.revokedReason) {
          additionalInfo = `\nMotivo: ${license.revokedReason}`;
          if (license.revokedAt) {
            additionalInfo += ` (${new Date(license.revokedAt).toLocaleDateString()})`;
          }
        }
        
        const embed = new EmbedBuilder()
          .setTitle('❌ Licencia Inválida')
          .setColor(0xFF0000)
          .addFields(
            { name: 'Razón', value: reasons[result.reason] || 'Desconocida' },
            { name: 'Cliente', value: license.clientName || 'Desconocido', inline: true },
            { name: 'Información adicional', value: additionalInfo || 'No hay información adicional', inline: false }
          );
        
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error al verificar licencia:', error);
      await interaction.editReply({ 
        content: '❌ Ha ocurrido un error al procesar tu solicitud. Por favor, inténtalo de nuevo.'
      });
    }
  },
};