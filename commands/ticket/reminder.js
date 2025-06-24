const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recordatorios")
    .setDescription(
      "Configura los recordatorios automáticos para tickets inactivos"
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ver")
        .setDescription("Ver la configuración actual de recordatorios")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("activar")
        .setDescription("Activar o desactivar recordatorios")
        .addBooleanOption((option) =>
          option
            .setName("estado")
            .setDescription("Estado de los recordatorios")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("canal")
        .setDescription("Activar/desactivar recordatorios en el canal")
        .addBooleanOption((option) =>
          option
            .setName("estado")
            .setDescription("Estado de los recordatorios en canal")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("dm")
        .setDescription("Activar/desactivar recordatorios por mensaje directo")
        .addBooleanOption((option) =>
          option
            .setName("estado")
            .setDescription("Estado de los recordatorios por DM")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("intervalos")
        .setDescription("Configurar los intervalos de recordatorio en horas")
        .addStringOption((option) =>
          option
            .setName("horas")
            .setDescription("Horas separadas por comas (ej: 2,6,24)")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  category: "ticket",

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const reminderSystem = require("../../modules/ticketReminders")(
        interaction.client
      );
      const config = reminderSystem.loadReminderConfig();

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "ver") {
        const embed = new EmbedBuilder()
          .setTitle("⚙️ Configuración de Recordatorios")
          .setColor("#0099FF")
          .addFields(
            {
              name: "Estado",
              value: config.enabled ? "✅ Activado" : "❌ Desactivado",
              inline: true,
            },
            {
              name: "Recordatorios en Canal",
              value: config.channelReminders ? "✅ Activado" : "❌ Desactivado",
              inline: true,
            },
            {
              name: "Recordatorios por DM",
              value: config.dmReminders ? "✅ Activado" : "❌ Desactivado",
              inline: true,
            },
            {
              name: "Intervalos de Recordatorio",
              value: `${config.reminderIntervals.join(", ")} horas`,
            }
          );

        return await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === "activar") {
        const estado = interaction.options.getBoolean("estado");
        config.enabled = estado;
        reminderSystem.saveReminderConfig(config);

        return await interaction.editReply(
          `✅ Los recordatorios automáticos han sido ${
            estado ? "activados" : "desactivados"
          }.`
        );
      } else if (subcommand === "canal") {
        const estado = interaction.options.getBoolean("estado");
        config.channelReminders = estado;
        reminderSystem.saveReminderConfig(config);

        return await interaction.editReply(
          `✅ Los recordatorios en canal han sido ${
            estado ? "activados" : "desactivados"
          }.`
        );
      } else if (subcommand === "dm") {
        const estado = interaction.options.getBoolean("estado");
        config.dmReminders = estado;
        reminderSystem.saveReminderConfig(config);

        return await interaction.editReply(
          `✅ Los recordatorios por mensaje directo (DM) han sido ${
            estado ? "activados" : "desactivados"
          }.`
        );
      } else if (subcommand === "intervalos") {
        const horasStr = interaction.options.getString("horas");

        // Validar y convertir a números
        const horas = horasStr
          .split(",")
          .map((h) => parseInt(h.trim()))
          .filter((h) => !isNaN(h) && h > 0)
          .sort((a, b) => a - b);

        if (horas.length === 0) {
          return await interaction.editReply(
            "❌ Debes proporcionar al menos un intervalo válido en horas."
          );
        }

        config.reminderIntervals = horas;
        reminderSystem.saveReminderConfig(config);

        return await interaction.editReply(
          `✅ Los intervalos de recordatorio han sido configurados: ${horas.join(
            ", "
          )} horas.`
        );
      }
    } catch (error) {
      console.error("Error al configurar recordatorios:", error);
      return await interaction.editReply(
        "❌ Ha ocurrido un error al configurar los recordatorios."
      );
    }
  },
};
