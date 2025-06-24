const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("adduser")
    .setDescription("Añade un usuario a un ticket existente")
    .addUserOption((option) =>
      option
        .setName("usuario")
        .setDescription("Usuario que quieres añadir al ticket")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  category: "ticket",

  async execute(interaction) {
    // Verificar que estamos en un canal de ticket
    const ticketSystem = require("../../modules/ticketSystem")(
      interaction.client
    );

    if (!ticketSystem.isTicketChannel(interaction.channel)) {
      return await interaction.reply({
        content: "❌ Este comando solo puede usarse en un canal de ticket.",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      // Obtener el usuario que queremos añadir
      const targetUser = interaction.options.getUser("usuario");

      // Verificar permisos del ejecutor
      const member = interaction.member;
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
      const isSupportRole = member.roles.cache.some(
        (role) => role.name === interaction.client.config.supportRole
      );

      if (!isAdmin && !isSupportRole) {
        return await interaction.editReply({
          content: "❌ No tienes permisos para añadir usuarios a este ticket.",
        });
      }

      // Verificar si el ticket existe y está abierto
      const ticketData = ticketSystem.loadTickets();
      const ticket = ticketData.tickets.find(
        (t) => t.channelId === interaction.channel.id && t.status === "open"
      );

      if (!ticket) {
        return await interaction.editReply({
          content: "❌ No se encontró un ticket activo asociado a este canal.",
        });
      }

      // Añadir permisos para el usuario en el canal
      await interaction.channel.permissionOverwrites.create(targetUser, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      // Registrar en logs
      ticketSystem.logTicketAction(interaction.guild, {
        action: "adduser",
        ticket: ticket,
        user: interaction.user,
        details: `Usuario añadido: ${targetUser.tag} (${targetUser.id})`,
      });

      // Notificar en el canal que se añadió un usuario
      await interaction.channel.send({
        content: `✅ ${interaction.user} ha añadido a ${targetUser} a este ticket.`,
      });

      return await interaction.editReply({
        content: `✅ Se ha añadido a ${targetUser.tag} al ticket.`,
      });
    } catch (error) {
      console.error("Error al añadir usuario al ticket:", error);
      return await interaction.editReply({
        content: "❌ Ha ocurrido un error al añadir al usuario.",
      });
    }
  },
};
