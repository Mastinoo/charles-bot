import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import fs from 'fs';

const FILE = './data/guildRoles.json';
const OWNER_ID = process.env.OWNER_ID;

export const data = new SlashCommandBuilder()
  .setName('addguildrole')
  .setDescription('Add a guild role to the selectable roles for invites')
  .addRoleOption(opt =>
    opt.setName('role')
      .setDescription('Role to add as a guild')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('name')
      .setDescription('Optional display name for the guild')
      .setRequired(false)
  )
  .setDefaultMemberPermissions(null);

export async function execute(interaction) {
  if (interaction.user.id !== OWNER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
  }

  const role = interaction.options.getRole('role');
  const name = interaction.options.getString('name') || role.name;

  const rolesData = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : {};
  if (!rolesData[interaction.guildId]) rolesData[interaction.guildId] = [];

  if (rolesData[interaction.guildId].some(r => r.id === role.id)) {
    return interaction.reply({ content: '❌ This role is already in the guild list.', ephemeral: true });
  }

  rolesData[interaction.guildId].push({ id: role.id, name });
  fs.writeFileSync(FILE, JSON.stringify(rolesData, null, 2));

  await interaction.reply({ content: `✅ Added ${name} to the guild roles list.`, ephemeral: true });
}
