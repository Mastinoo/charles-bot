import { EmbedBuilder } from 'discord.js';

const platformEmoji = {
  twitch: '🎮 Twitch',
  youtube: '📺 YouTube',
  kick: '🔥 Kick'
};

// key = guildId-userId
const liveMessages = new Map();

/* ===========================
   ROLE HELPERS (SAFE)
   =========================== */

export async function giveRole(guild, userId, roleId) {
  if (!roleId) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  await member.roles.add(roleId).catch(() => {});
}

export async function removeRole(guild, userId, roleId) {
  // ⚠️ INTENTIONAL LOG — DO NOT REMOVE
  console.error('🚨 removeRole CALLED', {
    guildId: guild?.id,
    userId,
    roleId,
    stack: new Error().stack
  });

  if (!roleId) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  await member.roles.remove(roleId).catch(() => {});
}

/* ===========================
   ANNOUNCER
   =========================== */

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
  // ---- HARD GUARDS (NO MORE CRASHES)
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    console.error('❌ Invalid stream URL:', url);
    return;
  }

  const channel = await client.channels
    .fetch(streamer.announceChannelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) return;

  const platformLabel =
    platformEmoji[platformDisplay?.toLowerCase()] ||
    platformDisplay ||
    'Live';

  const displayName =
    streamer.displayName || streamer.platformUsername || 'Streamer';

  const streamTitle =
    typeof title === 'string' && title.trim().length > 0
      ? title.trim()
      : 'Live now!';

  const headerMessage = `## ${displayName} is now live on ${platformLabel}!`;

  const createEmbed = () => {
    const embed = new EmbedBuilder()
      .setTitle(streamTitle)
      .setURL(url)
      .setColor(0x9146ff)
      .setTimestamp();

    // ---- THUMBNAIL LOGIC
    if (thumbnail && typeof thumbnail === 'string') {
      let finalImage = thumbnail.trim();

      if (platformDisplay?.toLowerCase() === 'twitch') {
        finalImage = finalImage
          .replace('{width}', '1280')
          .replace('{height}', '720');
      }

      if (finalImage.startsWith('http')) {
        embed.setImage(finalImage);
      }
    }

    embed.addFields({
      name: '▶️ Watch Stream',
      value: url
    });

    return embed;
  };

  const key = `${guildId}-${userId}`;

  // ---- UPDATE EXISTING MESSAGE
  if (liveMessages.has(key)) {
    const { message } = liveMessages.get(key);
    await message
      .edit({
        content: headerMessage,
        embeds: [createEmbed()]
      })
      .catch(() => {});
    return;
  }

  // ---- SEND NEW MESSAGE
  const message = await channel
    .send({
      content: headerMessage,
      embeds: [createEmbed()]
    })
    .catch(() => null);

  if (!message) return;

  // ---- PERIODIC EMBED REFRESH (NO ROLE TOUCHING)
  const interval = setInterval(async () => {
    await message
      .edit({
        content: headerMessage,
        embeds: [createEmbed()]
      })
      .catch(() => {});
  }, 30000);

  liveMessages.set(key, { message, interval });
}

/* ===========================
   CLEAR LIVE MESSAGE
   =========================== */

export async function clearLiveMessage(guildId, userId) {
  const key = `${guildId}-${userId}`;
  if (!liveMessages.has(key)) return;

  const { interval } = liveMessages.get(key);
  clearInterval(interval);
  liveMessages.delete(key);
}
