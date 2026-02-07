import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import fetch from 'node-fetch';
import puppeteer from 'puppeteer';

const platformEmoji = {
  twitch: '🎮 Twitch',
  youtube: '📺 YouTube',
  kick: '🔥 Kick'
};

// Stores live embed messages for updating only
const liveMessages = new Map();

// ------------------------------
// Puppeteer screenshot for Twitch (only the video player)
// ------------------------------
async function captureTwitchScreenshot(username) {
  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 720 }
    });
    const page = await browser.newPage();

    await page.goto(`https://www.twitch.tv/${username}`, { waitUntil: 'networkidle2' });

    // Wait for the video element
    const videoElement = await page.waitForSelector('video', { timeout: 10_000 }).catch(() => null);
    if (!videoElement) {
      console.warn(`⚠️ Twitch video player not found for ${username}`);
      await browser.close();
      return null;
    }

    const screenshotBuffer = await videoElement.screenshot();
    await browser.close();
    return screenshotBuffer; // Return Buffer for Discord attachment
  } catch (err) {
    console.error('❌ captureTwitchScreenshot error:', err, username);
    return null;
  }
}

// ------------------------------
// Twitch API fetch for title
// ------------------------------
async function fetchTwitchStream(userId) {
  if (!process.env.TWITCH_APP_TOKEN) return null;
  try {
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_id=${userId}`, {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${process.env.TWITCH_APP_TOKEN}`
      }
    });
    const data = await res.json();
    return data?.data?.[0] || null;
  } catch (err) {
    console.error('❌ fetchTwitchStream error:', err, userId);
    return null;
  }
}

// ------------------------------
// Roles
// ------------------------------
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

// ------------------------------
// Announce
// ------------------------------
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
      .setTimestamp()
      .addFields([{ name: '▶️ Watch Now', value: url }]);

    if (currentThumbnail) embed.setImage(currentThumbnail);
    return embed;
  };

  const key = `${guildId}-${userId}`;
  const headerMessage = `## ${displayName} is now live on ${platformLabel}!`;

  // If already announced, edit existing message
  if (liveMessages.has(key)) {
    const { message } = liveMessages.get(key);
    await message.edit({ content: headerMessage, embeds: [createEmbed(title, thumbnail)] }).catch(() => {});
    return;
  }

  // Send initial message
  let attachment;
  let embedThumbnail = thumbnail;

  if (platformDisplay?.toLowerCase() === 'twitch') {
    const screenshot = await captureTwitchScreenshot(streamer.platformUsername).catch(() => null);
    if (screenshot) {
      attachment = new AttachmentBuilder(screenshot, { name: 'screenshot.png' });
      embedThumbnail = 'attachment://screenshot.png';
    }
  }

  const message = await channel.send({ 
    content: headerMessage, 
    embeds: [createEmbed(title, embedThumbnail)], 
    files: attachment ? [attachment] : [] 
  }).catch(() => null);
  if (!message) return;

  // Update every 30 minutes (1800_000 ms)
  const interval = setInterval(async () => {
    let currentTitle = title;
    let currentThumbnail = embedThumbnail;
    let currentAttachment = attachment;

    if (platformDisplay?.toLowerCase() === 'twitch') {
      const streamData = await fetchTwitchStream(streamer.platformUserId).catch(() => null);
      if (streamData) currentTitle = streamData.title || title;

      const screenshot = await captureTwitchScreenshot(streamer.platformUsername).catch(() => null);
      if (screenshot) {
        currentAttachment = new AttachmentBuilder(screenshot, { name: 'screenshot.png' });
        currentThumbnail = 'attachment://screenshot.png';
      }
    }

    await message.edit({ 
      content: headerMessage, 
      embeds: [createEmbed(currentTitle, currentThumbnail)], 
      files: currentAttachment ? [currentAttachment] : [] 
    }).catch(() => {});
  }, 1800_000); // 30 minutes

  liveMessages.set(key, { message, interval });
}

// ------------------------------
// Clear live messages
// ------------------------------
export async function clearLiveMessage(guildId, userId) {
  const key = `${guildId}-${userId}`;
  if (!liveMessages.has(key)) return;
  const { interval } = liveMessages.get(key);
  clearInterval(interval);
  liveMessages.delete(key);
}
