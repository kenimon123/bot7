const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setuptickets')
    .setDescription('Configura el sistema de tickets')
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('Canal donde se mostrará el mensaje de tickets')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      // Diferir la respuesta inmediatamente para evitar el error de interacción desconocida
      await interaction.deferReply({ ephemeral: true }).catch(() => {});

      // Obtener el cliente
      const client = interaction.client;
      
      // Verificar permisos
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return await interaction.editReply({
          content: '❌ Necesitas permisos de administrador para usar este comando.'
        }).catch(() => {
          console.log('No se pudo responder al usuario: interacción expirada');
        });
      }
      
      // Obtener el canal seleccionado
      const channel = interaction.options.getChannel('canal');
      
      if (!channel || channel.type !== ChannelType.GuildText) {
        return await interaction.editReply({
          content: '❌ Debes seleccionar un canal de texto válido.'
        }).catch(() => {});
      }
      
      try {
        // Verificar permisos en el canal
        const botMember = await interaction.guild.members.fetchMe();
        const permissions = channel.permissionsFor(botMember);
        
        if (!permissions.has(PermissionFlagsBits.SendMessages) || 
            !permissions.has(PermissionFlagsBits.EmbedLinks) || 
            !permissions.has(PermissionFlagsBits.AttachFiles)) {
          return await interaction.editReply({
            content: '❌ No tengo los permisos necesarios en ese canal. Necesito: Enviar Mensajes, Insertar Enlaces y Adjuntar Archivos.'
          }).catch(() => {});
        }
        
        // Configurar servidor para tickets
        try {
          const ticketSystem = require('../../modules/ticketSystem')(client);
          await ticketSystem.setupGuild(interaction.guild);
          
          // Crear mensaje para selección de tickets
          const message = await ticketSystem.createTicketMessage(channel);
          
          if (!message) {
            return await interaction.editReply({
              content: '❌ Ocurrió un error al crear el mensaje de tickets.'
            }).catch(() => {});
          }
          
          // Actualizar el canal de estadísticas
          await ticketSystem.updateStatsChannel(interaction.guild);
          
          // Respuesta exitosa
          await interaction.editReply({
            content: `✅ Sistema de tickets configurado correctamente en ${channel}. También se ha creado/actualizado un canal de estadísticas llamado \`${client.config.ticketStatsChannel}\` y un canal de logs llamado \`${client.config.ticketLogChannel}\`.`
          }).catch(() => {
            console.log('No se pudo editar la respuesta, pero el comando se ejecutó correctamente');
          });
        } catch (setupError) {
          console.error('Error en configuración de tickets:', setupError);
          await interaction.editReply({
            content: '❌ Ocurrió un error al configurar el sistema de tickets. Revisa los permisos del bot y que todas las dependencias estén correctamente configuradas.'
          }).catch(() => {});
        }
      } catch (permError) {
        console.error('Error al verificar permisos:', permError);
        await interaction.editReply({
          content: '❌ No pude verificar mis permisos en el canal seleccionado.'
        }).catch(() => {});
      }
    } catch (error) {
      console.error('Error en setuptickets:', error);
      
      // Solo intentar responder si no hemos respondido ya
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: '❌ Ocurrió un error al configurar el sistema de tickets.', 
          ephemeral: true 
        }).catch(() => {});
      } else if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ Ocurrió un error al configurar el sistema de tickets.' 
        }).catch(() => {});
      }
    }
  }
};