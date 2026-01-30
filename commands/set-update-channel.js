import { SlashCommandBuilder } from 'discord.js';
import fs from 'fs';

export const data = new SlashCommandBuilder()
  .setName('set-update-channel')
  .setDescription('Set the channel where updates will be posted')
  .addStringOption(option =>
    option.setName('channel')
      .setDescription('Type part of the channel name')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  const focusedValue = interaction.options.getFocused();
  const channels = interaction.guild.channels.cache
    .filter(c => c.isTextBased())
    .map(c => ({ name: c.name, value: c.id }));

  const filtered = channels
    .filter(c => c.name.toLowerCase().includes(focusedValue.toLowerCase()))
    .slice(0, 25);

  await interaction.respond(filtered);
}

export async function execute(interaction) {
  const ownerId = process.env.OWNER_ID;
  const allowedRoles = fs.existsSync('./data/allowedRoles.json')
    ? JSON.parse(fs.readFileSync('./data/allowedRoles.json', 'utf-8'))
    : {};
  const guildRoles = allowedRoles[interaction.guildId] || [];

  const isAdmin = interaction.member.permissions.has(8n); // Administrator
  const hasRole = interaction.member.roles.cache.some(r => guildRoles.includes(r.id));
  if (interaction.user.id !== ownerId && !isAdmin && !hasRole) {
    return await interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
  }

  const channelId = interaction.options.getString('channel');

  let updateChannels = fs.existsSync('./data/channels.json')
    ? JSON.parse(fs.readFileSync('./data/channels.json', 'utf-8'))
    : {};

  updateChannels[interaction.guildId] = channelId;
  fs.writeFileSync('./data/channels.json', JSON.stringify(updateChannels, null, 2));

  await interaction.reply({ content: `✅ Update channel set to <#${channelId}>`, ephemeral: true });
}
