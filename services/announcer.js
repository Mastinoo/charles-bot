import { EmbedBuilder } from 'discord.js';

const platformEmoji = {
  twitch: '🎮 Twitch',
  youtube: '📺 YouTube',
  kick: '🔥 Kick'
};

// Live message cache (embed updates only)
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

export async function announce(
  client,
  streamer,
  url,
  title,
  thumbnail,
  platformDisplay,
  guildId,
  userId
) {
  const channel = await client.channels.fetch(streamer.announceChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const platformLabel =
    platformEmoji[platformDisplay?.toLowerCase()] || 'Live';

  const displayName =
    streamer.displayName || streamer.platformUsername;

  const createEmbed = () => {
    const embed = new EmbedBuilder()
      .setTitle(title) // ✅ ACTUAL Twitch title
      .setURL(url)
      .setColor(0x9146FF)
      .setTimestamp();

    let finalImage = thumbnail?.trim();
    if (!finalImage) {
      finalImage = 'https://i.imgur.com/x7kHaIB.jpeg';
    } else if (platformDisplay?.toLowerCase() === 'twitch') {
      finalImage = finalImage
        .replace('{width}', '1280')
        .replace('{height}', '720');
    }

    embed.setImage(finalImage);
    embed.addFields([{ name: '▶️ Watch Now', value: url }]);

    return embed;
  };

  const key = `${guildId}-${userId}`;
  const header = `## ${displayName} is now live on ${platformLabel}!`;

  // 🔁 Update existing message ONLY
  if (liveMessages.has(key)) {
    const { message } = liveMessages.get(key);
    await message.edit({
      content: header,
      embeds: [createEmbed()]
    }).catch(() => {});
    return;
  }

  // 🆕 Send new live message
  const message = await channel.send({
    content: header,
    embeds: [createEmbed()]
  }).catch(() => null);

  if (!message) return;

  const interval = setInterval(async () => {
    await message.edit({
      content: header,
      embeds: [createEmbed()]
    }).catch(() => {});
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
