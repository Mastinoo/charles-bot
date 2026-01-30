import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import db from '../../database.js';

export const data = new SlashCommandBuilder()
  .setName('stream-list')
  .setDescription('List all tracked streamers');

export async function execute(interaction) {
  const streamers = db.prepare("SELECT * FROM streamers WHERE guildId=?").all(interaction.guild.id);
  if (!streamers.length) return interaction.reply({ content: 'No streamers tracked.', ephemeral: true });

  const embed = new EmbedBuilder()
    .setTitle('Tracked Streamers')
    .setColor(0x9146FF)
    .setDescription(streamers.map(s => `${s.platformUsername} (${s.platform}) ${s.isLive ? '🟢 LIVE' : ''}`).join('\n'));
  interaction.reply({ embeds: [embed], ephemeral: true });
}

