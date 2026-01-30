import { EmbedBuilder } from 'discord.js';

const platformEmoji = {
  twitch: '🎮 Twitch',
  youtube: '📺 YouTube',
  kick: '🔥 Kick'
};

const liveMessages = new Map(); // key: `${guildId}-${userId}`, value: { message, interval }

export async function announce(client, streamer, url, title, thumbnail, platformDisplay, guildId, userId) {
  const channel = await client.channels.fetch(streamer.announceChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const platformLabel = platformEmoji[platformDisplay?.toLowerCase()] || platformDisplay || 'Live';
  const displayName = streamer.displayName || streamer.platformUsername;

  const createEmbed = () => {
    const embed = new EmbedBuilder()
      .setTitle(title || 'Live now!')
      .setURL(url)
      .setColor(0x9146FF)
      .setTimestamp();

    if (thumbnail && thumbnail.trim().length > 0) {
      let finalThumbnail = thumbnail.trim();
      if (platformDisplay?.toLowerCase() === 'twitch') {
        finalThumbnail = finalThumbnail.replace('{width}', '1280').replace('{height}', '720');
      }
      embed.setImage(finalThumbnail);
    } else {
      embed.setImage('https://i.imgur.com/4G7E9nZ.png'); // fallback
    }

    embed.addFields([{ name: '▶️ Watch Now', value: url }]);
    return embed;
  };

  const key = `${guildId}-${userId}`;
  const headerMessage = `## ${displayName} is now live on ${platformLabel}!`;

  if (liveMessages.has(key)) {
    // Only edit the embed; do NOT touch roles
    const { message } = liveMessages.get(key);
    await message.edit({ content: headerMessage, embeds: [createEmbed()] }).catch(() => {});
    return;
  }

  // Send new live announcement
  const message = await channel.send({ content: headerMessage, embeds: [createEmbed()] }).catch(() => null);
  if (!message) return;

  const interval = setInterval(async () => {
    const updatedEmbed = createEmbed();
    await message.edit({ content: headerMessage, embeds: [updatedEmbed] }).catch(() => {});
  }, 30000);

  liveMessages.set(key, { message, interval });
}

export async function clearLiveMessage(guildId, userId) {
  const key = `${guildId}-${userId}`;
  if (!liveMessages.has(key)) return;
  const { interval } = liveMessages.get(key);
  clearInterval(interval);
  liveMessages.delete(key);
}
