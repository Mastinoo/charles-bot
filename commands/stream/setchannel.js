import { SlashCommandBuilder } from 'discord.js';
import db from '../../database.js';

export const data = new SlashCommandBuilder()
  .setName('stream-setchannel')
  .setDescription('Set the announcement channel for this guild')
  .addChannelOption(opt =>
    opt
      .setName('channel')
      .setDescription('Text channel where live announcements will be sent')
      .setRequired(true)
  );

export async function execute(interaction) {
  const channel = interaction.options.getChannel('channel');

  // Upsert into guild_settings table
  db.prepare(`
    INSERT INTO guild_settings (guildId, announceChannelId)
    VALUES (?, ?)
    ON CONFLICT(guildId) DO UPDATE SET announceChannelId=excluded.announceChannelId
  `).run(interaction.guild.id, channel.id);

  // Update all existing streamers in this guild to have this channel
  db.prepare(`
    UPDATE streamers
    SET announceChannelId = ?
    WHERE guildId = ?
  `).run(channel.id, interaction.guild.id);

  interaction.reply({
    content: `✅ Announcement channel set to ${channel} for this guild and all existing streamers`,
    ephemeral: true
  });
}
