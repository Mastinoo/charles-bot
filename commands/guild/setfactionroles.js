import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import fs from 'fs';

const FILE = './data/guildApplyConfig.json';
const OWNER_ID = process.env.OWNER_ID;

export const data = new SlashCommandBuilder()
  .setName('setfactionroles')
  .setDescription('Set leader roles for factions')
  .addRoleOption(o => o.setName('kurzick').setDescription('Kurzick leader role').setRequired(true))
  .addRoleOption(o => o.setName('luxon').setDescription('Luxon leader role').setRequired(true))
  .addRoleOption(o => o.setName('neutral').setDescription('Guild leader role').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (interaction.user.id !== OWNER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
  }

  const kurzick = interaction.options.getRole('kurzick');
  const luxon = interaction.options.getRole('luxon');
  const neutral = interaction.options.getRole('neutral');

  const cfg = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : {};
  if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};

  cfg[interaction.guildId].factions = {
    kurzick: kurzick.id,
    luxon: luxon.id,
    neutral: neutral.id
  };

  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2));
  await interaction.reply('✅ Faction leader roles set.');
}
