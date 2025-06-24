const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("fixticket")
    .setDescription(
      "Arreglar un ticket específico cuyo canal ha sido eliminado"
    )
    .addIntegerOption((option) =>
      option
        .setName("id")
        .setDescription("ID del ticket a arreglar")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  category: "ticket",

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const ticketId = interaction.options.getInteger("id");
      const ticketSystem = require("../../modules/ticketSystem")(
        interaction.client
      );
      const data = ticketSystem.loadTickets();

      const ticket = data.tickets.find((t) => t.id === ticketId);

      if (!ticket) {
        return await interaction.editReply(
          `❌ No se encontró un ticket con ID #${ticketId}.`
        );
      }

      if (ticket.status !== "open") {
        return await interaction.editReply(
          `❌ El ticket #${ticketId} ya está cerrado.`
        );
      }

      // Verificar si el canal existe
      const channel = interaction.guild.channels.cache.get(ticket.channelId);

      if (channel) {
        return await interaction.editReply(
          `❌ El canal del ticket #${ticketId} aún existe: <#${channel.id}>`
        );
      }

      // Marcar como cerrado
      ticket.status = "closed";
      ticket.closedAt = new Date().toISOString();
      ticket.closedBy = interaction.user.id;
      ticket.closedReason = "Canal eliminado - arreglado manualmente";

      ticketSystem.saveTickets(data);

      await interaction.editReply(
        `✅ El ticket #${ticketId} ha sido marcado como cerrado correctamente.`
      );
    } catch (error) {
      console.error("Error al arreglar ticket:", error);
      await interaction.editReply("❌ Ocurrió un error al arreglar el ticket.");
    }
  },
};
