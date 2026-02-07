import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import fs from 'fs';

const FILE = './data/guildRoles.json';
const OWNER_ID = process.env.OWNER_ID;

export const data = new SlashCommandBuilder()
  .setName('listguildroles')
  .setDescription('List all selectable guild roles for this server')
  .setDefaultMemberPermissions(null);

export async function execute(interaction) {
  // Allow owner always, or admins
  if (interaction.user.id !== OWNER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
  }

  const rolesData = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : {};
  const roles = rolesData[interaction.guildId] || [];

  if (roles.length === 0) {
    return interaction.reply({ content: '❌ No guild roles set for this server.', flags: MessageFlags.Ephemeral });
  }

  // Combine all roles into a single string to avoid 25-field limit
  const roleList = roles.map(r => `\`${r.name}\` → <@&${r.id}>`).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('Selectable Guild Roles')
    .setDescription(roleList)
    .setColor('Blue');

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
