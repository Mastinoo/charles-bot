import { EmbedBuilder } from 'discord.js';

const platformEmoji = {
  twitch: '🎮 Twitch',
  youtube: '📺 YouTube',
  kick: '🔥 Kick'
};

// Stores live embed messages for updating only
const liveMessages = new Map();

export async function giveRole(guild, userId, roleId) {
  if (!roleId) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  await member.roles.add(roleId).catch(() => {});
}

export async function removeRole(guild, userId, roleId) {
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

  const createEmbed = () => {
    const embed = new EmbedBuilder()
      .setTitle(title || 'Live now!') // 🔹 Use actual stream title
      .setURL(url)
      .setColor(0x9146FF)
      .setTimestamp();

    // Big image
    let finalThumbnail = thumbnail?.trim();
    if (!finalThumbnail || finalThumbnail === '') {
      finalThumbnail = 'https://i.imgur.com/x7kHaIB.jpeg'; // fallback
    } else if (platformDisplay?.toLowerCase() === 'twitch') {
      finalThumbnail = finalThumbnail.replace('{width}', '1280').replace('{height}', '720');
    }
    embed.setImage(finalThumbnail);

    embed.addFields([{ name: '▶️ Watch Now', value: url }]);
    return embed;
  };

  const key = `${guildId}-${userId}`;
  const headerMessage = `## ${displayName} is now live on ${platformLabel}!`;

  // Only update embed, never touch roles
  if (liveMessages.has(key)) {
    const { message } = liveMessages.get(key);
    await message.edit({ content: headerMessage, embeds: [createEmbed()] }).catch(() => {});
    return;
  }

  // Send new embed
  const message = await channel.send({ content: headerMessage, embeds: [createEmbed()] }).catch(() => null);
  if (!message) return;

  const interval = setInterval(async () => {
    const updatedEmbed = createEmbed();
    await message.edit({ content: headerMessage, embeds: [updatedEmbed] }).catch(() => {});
  }, 30000); // only updates embed

  liveMessages.set(key, { message, interval });
}

export async function clearLiveMessage(guildId, userId) {
  const key = `${guildId}-${userId}`;
  if (!liveMessages.has(key)) return;
  const { interval } = liveMessages.get(key);
  clearInterval(interval);
  liveMessages.delete(key);
}
