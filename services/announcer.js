import { EmbedBuilder } from 'discord.js';

const platformEmoji = {
  twitch: '🎮 Twitch',
  youtube: '📺 YouTube',
  kick: '🔥 Kick'
};

export async function giveRole(guild, userId, roleId) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  await member.roles.add(roleId).catch(() => {});
}

export async function removeRole(guild, userId, roleId) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  await member.roles.remove(roleId).catch(() => {});
}

export async function announce(client, streamer, url, game, thumbnail, platformDisplay) {
  const channel = await client.channels.fetch(streamer.announceChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  // Use emoji + platform label
  const platformLabel = platformEmoji[platformDisplay?.toLowerCase()] || platformDisplay || 'Live';
  const displayName = streamer.displayName || streamer.platformUsername;

  // Build embed
  const embed = new EmbedBuilder()
    .setTitle(`${displayName} is live! ${platformLabel}`)
    .setURL(url)
    .setColor(0x9146FF);

  // Optional game/category description
  if (typeof game === 'string' && game.trim().length > 0) {
    embed.setDescription(`🎲 Playing: ${game.trim()}`);
  }

  // Optional thumbnail
  if (typeof thumbnail === 'string' && thumbnail.trim().length > 0) {
    embed.setThumbnail(thumbnail.trim());
  }

  // Always include a “Watch Now” field
  embed.addFields([{ name: '▶️ Watch Now', value: url }]);

  // Timestamp so Discord shows when it went live
  embed.setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}
