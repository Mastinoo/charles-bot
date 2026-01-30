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

  const platformLabel = platformEmoji[platformDisplay?.toLowerCase()] || platformDisplay || 'Live';
  const displayName = streamer.displayName || streamer.platformUsername;

  const embed = new EmbedBuilder()
    .setTitle(`${displayName} is live! ${platformLabel}`)
    .setURL(url)
    .setColor(0x9146FF)
    .setTimestamp();

  if (typeof game === 'string' && game.trim().length > 0) {
    embed.setDescription(`🎲 Playing: ${game.trim()}`);
  }

  // 🔹 Handle platform-specific big preview images
  if (thumbnail && thumbnail.trim().length > 0) {
    let finalThumbnail = thumbnail.trim();

    // Twitch: replace {width}x{height} in the template URL for full preview
    if (platformDisplay?.toLowerCase() === 'twitch') {
      finalThumbnail = finalThumbnail.replace('{width}', '1280').replace('{height}', '720');
    }

    embed.setImage(finalThumbnail);
  }

  // Always include a "Watch Now" field
  embed.addFields([{ name: '▶️ Watch Now', value: url }]);

  await channel.send({ embeds: [embed] }).catch(() => {});
}
