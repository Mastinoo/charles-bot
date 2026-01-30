import { EmbedBuilder } from 'discord.js';

const platformEmoji = {
  twitch: '🎮 Twitch',
  youtube: '📺 YouTube',
  kick: '🔥 Kick'
};

// Store live messages so we can edit them later
const liveMessages = new Map(); // key: `${guildId}-${platformUserId}`, value: { message, interval }

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

export async function announce(client, streamer, url, game, thumbnail, platformDisplay, guildId, userId) {
  const channel = await client.channels.fetch(streamer.announceChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const platformLabel = platformEmoji[platformDisplay?.toLowerCase()] || platformDisplay || 'Live';
  const displayName = streamer.displayName || streamer.platformUsername;

  const createEmbed = () => {
    const embed = new EmbedBuilder()
      .setTitle(`${displayName} is live! ${platformLabel}`)
      .setURL(url)
      .setColor(0x9146FF)
      .setTimestamp();

    if (typeof game === 'string' && game.trim().length > 0) {
      embed.setDescription(`🎲 Playing: ${game.trim()}`);
    }

    if (thumbnail && thumbnail.trim().length > 0) {
      let finalThumbnail = thumbnail.trim();
      if (platformDisplay?.toLowerCase() === 'twitch') {
        finalThumbnail = finalThumbnail.replace('{width}', '1280').replace('{height}', '720');
      }
      embed.setImage(finalThumbnail);
    }

    embed.addFields([{ name: '▶️ Watch Now', value: url }]);
    return embed;
  };

  const key = `${guildId}-${userId}`;

  // If we already have a message for this live stream, edit it
  if (liveMessages.has(key)) {
    const { message } = liveMessages.get(key);
    await message.edit({ embeds: [createEmbed()] }).catch(() => {});
    return;
  }

  // Otherwise, send new message
  const message = await channel.send({ embeds: [createEmbed()] }).catch(() => null);
  if (!message) return;

  // Save interval to update the image every 30s
  const interval = setInterval(async () => {
    const updatedEmbed = createEmbed();
    await message.edit({ embeds: [updatedEmbed] }).catch(() => {});
  }, 30000); // 30 seconds

  liveMessages.set(key, { message, interval });
}

// Cleanup live message when going offline
export async function clearLiveMessage(guildId, userId) {
  const key = `${guildId}-${userId}`;
  if (!liveMessages.has(key)) return;
  const { interval } = liveMessages.get(key);
  clearInterval(interval);
  liveMessages.delete(key);
}
