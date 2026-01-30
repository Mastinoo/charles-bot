import { SlashCommandBuilder } from 'discord.js';
import db from '../../database.js';
import { getTwitchUserId } from '../../services/twitchAuth.js';
import { subscribeTwitchStreamer } from '../../services/twitchSubscribe.js';

export const data = new SlashCommandBuilder()
  .setName('stream-add')
  .setDescription('Add a streamer to track')
  .addStringOption(opt => opt.setName('platform').setDescription('twitch, youtube, kick').setRequired(true))
  .addStringOption(opt => opt.setName('username').setDescription('Streamer username or channel ID').setRequired(true))
  .addUserOption(opt => opt.setName('discord').setDescription('Discord user to assign role').setRequired(true));

export async function execute(interaction) {
  const platform = interaction.options.getString('platform').toLowerCase();
  const username = interaction.options.getString('username');
  const discordUser = interaction.options.getUser('discord');

  if (!['twitch','youtube','kick'].includes(platform))
    return interaction.reply({ content: '❌ Invalid platform.', ephemeral: true });

  let platformUserId = username;
  if (platform === 'twitch') {
    const userId = await getTwitchUserId(username);
    if (!userId) return interaction.reply({ content: '❌ Twitch user not found', ephemeral: true });
    platformUserId = userId;
    await subscribeTwitchStreamer(userId);
  }

  db.prepare(`
    INSERT OR IGNORE INTO streamers (guildId, discordUserId, platform, platformUserId, platformUsername)
    VALUES (?, ?, ?, ?, ?)
  `).run(interaction.guild.id, discordUser.id, platform, platformUserId, username);

  interaction.reply({ content: `✅ Streamer added: ${username} (${platform})`, ephemeral: true });
}

