import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const OWNER_ID = process.env.OWNER_ID;

export const data = new SlashCommandBuilder()
  .setName('postguildapply')
  .setDescription('Post the guild application message')
  .setDefaultMemberPermissions(null);

export async function execute(interaction) {
  if (interaction.user.id !== OWNER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
  }

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
