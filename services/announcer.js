import { EmbedBuilder } from 'discord.js';

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

export async function announce(client, streamer, url, game, thumbnail) {
  const channel = await client.channels.fetch(streamer.announceChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(`${streamer.platformUsername} is live!`)
    .setURL(url)
    .setColor(0x9146FF);

  // ✅ Only set description if it's a non-empty string
  if (typeof game === 'string' && game.trim().length > 0) {
    embed.setDescription(game.trim());
  }

  // ✅ Only set thumbnail if it's a non-empty string
  if (typeof thumbnail === 'string' && thumbnail.trim().length > 0) {
    embed.setThumbnail(thumbnail.trim());
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
}
