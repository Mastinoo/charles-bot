import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import fs from 'fs';

const CONFIG_FILE = './data/guildApplyConfig.json';
const OWNER_ID = process.env.OWNER_ID;

export const data = new SlashCommandBuilder()
  .setName('postguildapply')
  .setDescription('Post the guild request message')
  .setDefaultMemberPermissions(null);

export async function execute(interaction) {
  if (interaction.user.id !== OWNER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
  }

  // Read review channel from JSON
  const cfg = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE)) : {};
  const reviewChannelId = cfg[interaction.guildId]?.reviewChannel;
  const reviewChannelMention = reviewChannelId ? `<#${reviewChannelId}>` : '**Not set!**';

  const embed = new EmbedBuilder()
    .setTitle('# 🏯 Request to Join a Guild!')
    .setThumbnail('https://imgur.com/a/Bs7mlkh') // Replace with your logo URL
    .setColor('Gold')
    .setDescription(
      '**How to Request:**\n\n' +
      '1️⃣ Click the **Request A Guild Invite** button below.\n' +
      '2️⃣ Select your **faction** (Kurzick, Luxon, or No Preference).\n' +
      '3️⃣ Enter your **In-Game Name (IGN)**.\n' +
      '4️⃣ Optionally, write a short **description** telling us what you are looking for or your goals.\n' +
      `5️⃣ Your request will then be **posted to the review channel**: ${reviewChannelMention} where our guild leaders will check it out.\n\n` +
      'Once reviewed, you will be **invited to one of our guilds**!'
    )
    .setFooter({ text: 'Join us today!' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('guild_apply_start')
      .setLabel('Request A Guild Invite')
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.channel.send({
    embeds: [embed],
    components: [row]
  });

  await interaction.reply({ content: '✅ Guild request message posted.', ephemeral: true });
}
