import { SlashCommandBuilder, ChannelType, PermissionsBitField } from 'discord.js';
import {
  getGuildActivitiesConfig,
  saveActivitiesConfig,
  buildDailyActivitiesEmbed,
  buildWeeklyActivitiesEmbed,
  postDailyActivities,
  postWeeklyActivities
} from '../services/gwActivitiesService.js';

function canManage(interaction) {
  const ownerId = process.env.OWNER_ID;
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  return interaction.user.id === ownerId || isAdmin;
}

export const data = new SlashCommandBuilder()
  .setName('set-gw-activities')
  .setDescription('Configure Guild Wars daily and weekly activity posts')
  .addSubcommand(sub => sub
    .setName('daily-channel')
    .setDescription('Set the channel for daily Guild Wars activities')
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Daily activities channel')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true)))
  .addSubcommand(sub => sub
    .setName('weekly-channel')
    .setDescription('Set the channel for weekly Guild Wars activities')
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Weekly activities channel')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true)))
  .addSubcommand(sub => sub
    .setName('ping-role')
    .setDescription('Set the role Charles should ping for daily/weekly activity posts')
    .addRoleOption(option => option
      .setName('role')
      .setDescription('Role to ping')
      .setRequired(true)))
  .addSubcommand(sub => sub
    .setName('clear-ping-role')
    .setDescription('Disable role pings for Guild Wars activity posts'))
  .addSubcommand(sub => sub
    .setName('preview-daily')
    .setDescription('Preview the current daily activities embed'))
  .addSubcommand(sub => sub
    .setName('preview-weekly')
    .setDescription('Preview the current weekly activities embed'))
  .addSubcommand(sub => sub
    .setName('post-daily-now')
    .setDescription('Post the daily activities embed now and replace the previous one'))
  .addSubcommand(sub => sub
    .setName('post-weekly-now')
    .setDescription('Post the weekly activities embed now and replace the previous one'));

export async function execute(interaction, client) {
  if (!canManage(interaction)) {
    return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();
  const { all, guild } = getGuildActivitiesConfig(interaction.guildId);

  if (sub === 'daily-channel') {
    const channel = interaction.options.getChannel('channel');
    guild.dailyChannelId = channel.id;
    saveActivitiesConfig(all);
    return interaction.reply({ content: `✅ Daily activities channel set to ${channel}.`, ephemeral: true });
  }

  if (sub === 'weekly-channel') {
    const channel = interaction.options.getChannel('channel');
    guild.weeklyChannelId = channel.id;
    saveActivitiesConfig(all);
    return interaction.reply({ content: `✅ Weekly activities channel set to ${channel}.`, ephemeral: true });
  }

  if (sub === 'ping-role') {
    const role = interaction.options.getRole('role');
    guild.pingRoleId = role.id;
    saveActivitiesConfig(all);
    return interaction.reply({ content: `✅ Activity posts will ping ${role}.`, ephemeral: true });
  }

  if (sub === 'clear-ping-role') {
    delete guild.pingRoleId;
    saveActivitiesConfig(all);
    return interaction.reply({ content: '✅ Activity role ping disabled.', ephemeral: true });
  }

  if (sub === 'preview-daily') {
    await interaction.deferReply({ ephemeral: true });
    const embed = await buildDailyActivitiesEmbed();
    return interaction.editReply({ embeds: Array.isArray(embed) ? embed : [embed] });
  }

  if (sub === 'preview-weekly') {
    await interaction.deferReply({ ephemeral: true });
    const embed = await buildWeeklyActivitiesEmbed();
    return interaction.editReply({ embeds: Array.isArray(embed) ? embed : [embed] });
  }

  if (sub === 'post-daily-now') {
    await interaction.deferReply({ ephemeral: true });
    await postDailyActivities(client, interaction.guildId);
    return interaction.editReply({ content: '✅ Daily activities posted.' });
  }

  if (sub === 'post-weekly-now') {
    await interaction.deferReply({ ephemeral: true });
    await postWeeklyActivities(client, interaction.guildId);
    return interaction.editReply({ content: '✅ Weekly activities posted.' });
  }
}
