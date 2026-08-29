import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import {
  getMemberRevivalProgress,
  getRevivalConfig
} from '../services/revivalRankService.js';

function progressBar(current, target, width = 10) {
  if (target <= 0) return '██████████';
  const ratio = Math.max(0, Math.min(1, current / target));
  const filled = Math.round(ratio * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Show Revival rank progression')
  .addUserOption(option => option
    .setName('user')
    .setDescription('Member to inspect (defaults to yourself)'));

export async function execute(interaction) {
  const config = getRevivalConfig(interaction.guildId);
  if (!config?.enabled || !config.revivalistRoleId) {
    return interaction.reply({ content: 'Revival rank progression is not enabled on this server.', ephemeral: true });
  }

  const user = interaction.options.getUser('user') || interaction.user;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    return interaction.reply({ content: 'That user is not currently in the server.', ephemeral: true });
  }

  const progress = getMemberRevivalProgress(interaction.guildId, user.id);
  const tenureDays = member.joinedTimestamp
    ? Math.floor((Date.now() - member.joinedTimestamp) / 86_400_000)
    : 0;

  const isAscended = config.ascendedRoleId && member.roles.cache.has(config.ascendedRoleId);
  const isRevivalist = member.roles.cache.has(config.revivalistRoleId);
  const rank = isAscended ? 'Ascended ✨' : isRevivalist ? 'Revivalist 💜' : 'Awakened 🌱';

  const embed = new EmbedBuilder()
    .setColor(isAscended ? 0xd8a33a : isRevivalist ? 0x9b5de5 : 0x55b8d0)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
    .setTitle(rank);

  if (isAscended) {
    embed.setDescription('Ascended is a manually awarded GWR veteran/contributor rank.');
  } else if (isRevivalist) {
    embed.setDescription('Revivalist earned. This rank is permanent and is not removed for inactivity.');
  } else {
    embed.setDescription([
      `**Messages**  ${progressBar(progress.qualifyingMessages, config.messageThreshold)}  ${progress.qualifyingMessages}/${config.messageThreshold}`,
      `**Active days**  ${progressBar(progress.activeDays, config.activeDaysThreshold)}  ${progress.activeDays}/${config.activeDaysThreshold}`,
      `**Server tenure**  ${progressBar(tenureDays, config.tenureDaysThreshold)}  ${tenureDays}/${config.tenureDaysThreshold} days`,
      '',
      `Only the first **${config.dailyCap} qualifying messages per day** count toward Revivalist.`
    ].join('\n'));
  }

  if (progress.revivalistAwardedAt) {
    const ts = Math.floor(Date.parse(progress.revivalistAwardedAt) / 1000);
    if (Number.isFinite(ts)) embed.setFooter({ text: `Revivalist earned ${new Date(progress.revivalistAwardedAt).toISOString().slice(0, 10)}` });
  }

  return interaction.reply({ embeds: [embed], ephemeral: user.id !== interaction.user.id });
}
