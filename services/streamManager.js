import db from '../database.js';
import fetch from 'node-fetch';
import { announce, giveRole, removeRole } from './announcer.js';

export async function checkStreams(client) {
  const streamers = db.prepare("SELECT * FROM streamers").all();

  for (const s of streamers) {
    let isLive=false, url='', gameName='', thumbnail='';

    try {
      if (s.platform==='youtube') {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${s.platformUserId}&type=video&eventType=live&key=${process.env.YOUTUBE_API_KEY}`);
        const data = await res.json();
        if (data.items?.length>0) { isLive=true; url=`https://youtube.com/watch?v=${data.items[0].id.videoId}`; gameName=data.items[0].snippet.title; thumbnail=data.items[0].snippet.thumbnails.high.url; }
      } else if (s.platform==='kick') {
        const res = await fetch(`https://kick.com/api/v1/channels/${s.platformUserId}`);
        const data = await res.json();
        if (data?.live) { isLive=true; url=`https://kick.com/${s.platformUserId}`; gameName=data.stream.title; thumbnail=data.stream.thumbnail_url; }
      }

      const guild = await client.guilds.fetch(s.guildId).catch(()=>null);
      if (!guild) continue;

      if (isLive && s.isLive===0) {
        db.prepare("UPDATE streamers SET isLive=1 WHERE guildId=? AND discordUserId=? AND platform=?").run(s.guildId, s.discordUserId, s.platform);
        if (s.liveRoleId) await giveRole(guild, s.discordUserId, s.liveRoleId);
        if (s.announceChannelId) await announce(client, s, url, gameName, thumbnail);
      }

      if (!isLive && s.isLive===1) {
        db.prepare("UPDATE streamers SET isLive=0 WHERE guildId=? AND discordUserId=? AND platform=?").run(s.guildId, s.discordUserId, s.platform);
        if (s.liveRoleId) await removeRole(guild, s.discordUserId, s.liveRoleId);
      }

    } catch (err){ console.error(err); }
  }
}

