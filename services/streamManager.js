import db from '../database.js';
import fetch from 'node-fetch';
import { announce, giveRole, removeRole } from './announcer.js';

// Helper to fetch live stream info for YouTube
async function fetchYouTubeLive(channelId) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&eventType=live&key=${process.env.YOUTUBE_API_KEY}`
    );
    const data = await res.json();
    if (data.items?.length > 0) {
      const liveStream = data.items[0];
      return {
        isLive: true,
        url: `https://youtube.com/watch?v=${liveStream.id.videoId}`,
        title: liveStream.snippet.title,
        thumbnail: liveStream.snippet.thumbnails.high.url
      };
    }
    return { isLive: false };
  } catch (err) {
    console.error('❌ YouTube fetch error:', err, channelId);
    return { isLive: false };
  }
}

// Helper to fetch live stream info for Kick
async function fetchKickLive(username) {
  try {
    const res = await fetch(`https://kick.com/api/v1/channels/${username}`);
    const data = await res.json();
    if (data?.live) {
      return {
        isLive: true,
        url: `https://kick.com/${username}`,
        title: data.stream.title,
        thumbnail: data.stream.thumbnail_url
      };
    }
    return { isLive: false };
  } catch (err) {
    console.error('❌ Kick fetch error:', err, username);
    return { isLive: false };
  }
}

export async function checkStreams(client) {
  const streamers = db.prepare("SELECT * FROM streamers").all();

  for (const s of streamers) {
    try {
      // Twitch handled by EventSub
      if (s.platform === 'twitch') continue;

      let liveData = { isLive: false };
      if (s.platform === 'youtube') liveData = await fetchYouTubeLive(s.platformUserId);
      if (s.platform === 'kick') liveData = await fetchKickLive(s.platformUserId);

      const guild = await client.guilds.fetch(s.guildId).catch(() => null);
      if (!guild) continue;

      // Stream just went live
      if (liveData.isLive && s.isLive === 0) {
        db.prepare(
          "UPDATE streamers SET isLive=1 WHERE guildId=? AND discordUserId=? AND platform=?"
        ).run(s.guildId, s.discordUserId, s.platform);

        if (s.liveRoleId) await giveRole(guild, s.discordUserId, s.liveRoleId);
        if (s.announceChannelId) {
          await announce(
            client,
            s,
            liveData.url,
            liveData.title,
            liveData.thumbnail,
            s.platform,
            s.guildId,
            s.discordUserId
          );
        }
        console.log(`✅ Marked ${s.platformUsername} (${s.platform}) as live in guild ${s.guildId}`);
      }

      // Stream just went offline
      if (!liveData.isLive && s.isLive === 1) {
        db.prepare(
          "UPDATE streamers SET isLive=0 WHERE guildId=? AND discordUserId=? AND platform=?"
        ).run(s.guildId, s.discordUserId, s.platform);

        if (s.liveRoleId) await removeRole(guild, s.discordUserId, s.liveRoleId);
        console.log(`ℹ️ Marked ${s.platformUsername} (${s.platform}) as offline in guild ${s.guildId}`);
      }
    } catch (err) {
      console.error('❌ checkStreams error:', err, s);
    }
  }
}
