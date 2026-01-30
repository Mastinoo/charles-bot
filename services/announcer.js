import { EmbedBuilder } from 'discord.js';
import fetch from 'node-fetch';

const platformEmoji = {
  twitch: '🎮 Twitch',
  youtube: '📺 YouTube',
  kick: '🔥 Kick'
};

// Stores live embed messages for updating only
const liveMessages = new Map();

// ⚠️ Twitch fetch helper
async function fetchTwitchStream(userId) {
  if (!process.env.TWITCH_APP_TOKEN) return null;

  const res = await fetch(`https://api.twitch.tv/helix/streams?user_id=${userId}`, {
    headers: {
      'Client-ID': process.env.TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${process.env.TWITCH_APP_TOKEN}`
    }
  });
  const data = await res.json();
  return data?.data?.[0] || null;
}

export async function giveRole(guild, userId, roleId) {
  if (!roleId) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  await member.roles.add(roleId).catch(() => {});
}

export async function removeRole(guild, userId, roleId) {
  console.error('🚨 ROLE REMOVAL TRIGGERED', { guild: guild.id, userId, roleId, stack: new Error().stack });
  if (!roleId) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  await member.roles.remove(roleId).catch(() => {});
}

export async function announce(client, streamer, url, title, thumbnail, platformDisplay, guildId, userId) {
  const channel = await client.channels.fetch(streamer.announceChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const platformLabel = platformEmoji[platformDisplay?.toLowerCase()] || platformDisplay || 'Live';
  const displayName = streamer.displayName || streamer.platformUsername;

  const createEmbed = (currentTitle, currentThumbnail) => {
    const embed = new EmbedBuilder()
      .setTitle(currentTitle || 'Live now!')
      .setURL(url)
      .setColor(0x9146FF)
      .setTimestamp();

    let finalThumbnail = currentThumbnail?.trim() || 'https://i.imgur.com/x7kHaIB.jpeg';
    if (platformDisplay?.toLowerCase() === 'twitch' && finalThumbnail.includes('{width}')) {
      finalThumbnail = finalThumbnail.replace('{width}', '1280').replace('{height}', '720');
    }
    embed.setImage(finalThumbnail);

    embed.addFields([{ name: '▶️ Watch Now', value: url }]);
    return embed;
  };

  const key = `${guildId}-${userId}`;
  const headerMessage = `## ${displayName} is now live on ${platformLabel}!`;

  if (liveMessages.has(key)) {
    const { message } = liveMessages.get(key);
    await message.edit({ content: headerMessage, embeds: [createEmbed(title, thumbnail)] }).catch(() => {});
    return;
  }

  const message = await channel.send({ content: headerMessage, embeds: [createEmbed(title, thumbnail)] }).catch(() => null);
  if (!message) return;

  const interval = setInterval(async () => {
    let currentTitle = title;
    let currentThumbnail = thumbnail;

    if (platformDisplay?.toLowerCase() === 'twitch') {
      const streamData = await fetchTwitchStream(streamer.platformUserId).catch(() => null);
      if (streamData) {
        currentTitle = streamData.title || title;
        currentThumbnail = streamData.thumbnail_url || thumbnail;
      }
    }

    await message.edit({ content: headerMessage, embeds: [createEmbed(currentTitle, currentThumbnail)] }).catch(() => {});
  }, 30_000);

  liveMessages.set(key, { message, interval });
}

export async function clearLiveMessage(guildId, userId) {
  const key = `${guildId}-${userId}`;
  if (!liveMessages.has(key)) return;
  const { interval } = liveMessages.get(key);
  clearInterval(interval);
  liveMessages.delete(key);
}
