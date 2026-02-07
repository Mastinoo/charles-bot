import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('postguildapply')
  .setDescription('Post the guild application message')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('guild_apply_start')
      .setLabel('Apply to a Guild')
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.channel.send({
    content: 'Click the button below to apply to a guild:',
    components: [row]
  });

  await interaction.reply({ content: '✅ Application message posted.', ephemeral: true });
}
