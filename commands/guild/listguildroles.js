import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import fs from 'fs';

const FILE = './data/guildRoles.json';
const OWNER_ID = process.env.OWNER_ID;

export const data = new SlashCommandBuilder()
  .setName('listguildroles')
  .setDescription('List all selectable guild roles for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (interaction.user.id !== OWNER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
  }

  const rolesData = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : {};
  const roles = rolesData[interaction.guildId] || [];

  if (roles.length === 0) {
    return interaction.reply({ content: '❌ No guild roles set for this server.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('Selectable Guild Roles')
    .setColor('Blue')
    .addFields(roles.map(r => ({ name: r.name, value: `<@&${r.id}>`, inline: true })));

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
