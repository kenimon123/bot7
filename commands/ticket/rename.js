const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("renameticket")
    .setDescription("Cambia el nombre de un ticket")
    .addStringOption((option) =>
      option
        .setName("nombre")
        .setDescription("Nuevo nombre para el ticket (sin el número)")
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
      // Obtener el nuevo nombre propuesto
      const newBaseName = interaction.options
        .getString("nombre")
        .toLowerCase()
        .replace(/\s+/g, "-") // Reemplazar espacios por guiones
        .replace(/[^\w\-]/g, "") // Eliminar caracteres no válidos
        .substring(0, 20); // Limitar longitud

      // Verificar permisos del ejecutor
      const member = interaction.member;
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
      const isSupportRole = member.roles.cache.some(
        (role) => role.name === interaction.client.config.supportRole
      );

      if (!isAdmin && !isSupportRole) {
        return await interaction.editReply({
          content: "❌ No tienes permisos para renombrar este ticket.",
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

      // Extraer el número del ticket del nombre actual del canal
      const ticketNumber = ticket.id;

      if (!ticketNumber) {
        return await interaction.editReply({
          content: "❌ No se pudo determinar el número de ticket.",
        });
      }

      // Crear el nuevo nombre conservando el número
      const newChannelName = `${newBaseName}-${ticketNumber}`;

      // Renombrar el canal
      await interaction.channel.setName(
        newChannelName,
        "Ticket renombrado por " + interaction.user.tag
      );

      // Registrar en logs
      ticketSystem.logTicketAction(interaction.guild, {
        action: "rename",
        ticket: ticket,
        user: interaction.user,
        details: `Nuevo nombre: ${newChannelName}`,
      });

      return await interaction.editReply({
        content: `✅ Ticket renombrado a \`${newChannelName}\`.`,
      });
    } catch (error) {
      console.error("Error al renombrar ticket:", error);
      return await interaction.editReply({
        content: "❌ Ha ocurrido un error al renombrar el ticket.",
      });
    }
  },
};
