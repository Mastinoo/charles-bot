import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import fs from 'fs';

const FILE = './data/guildRoles.json';
const OWNER_ID = process.env.OWNER_ID;

export const data = new SlashCommandBuilder()
  .setName('removeguildrole')
  .setDescription('Remove a guild role from the selectable roles')
  .addRoleOption(opt =>
    opt.setName('role')
      .setDescription('Role to remove')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(null);

export async function execute(interaction) {
  if (interaction.user.id !== OWNER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
  }

  const role = interaction.options.getRole('role');

  const rolesData = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : {};
  if (!rolesData[interaction.guildId] || rolesData[interaction.guildId].length === 0) {
    return interaction.reply({ content: '❌ No guild roles set for this server.', ephemeral: true });
  }

  const index = rolesData[interaction.guildId].findIndex(r => r.id === role.id);
  if (index === -1) {
    return interaction.reply({ content: '❌ This role is not in the guild list.', ephemeral: true });
  }

  rolesData[interaction.guildId].splice(index, 1);
  fs.writeFileSync(FILE, JSON.stringify(rolesData, null, 2));

  await interaction.reply({ content: `✅ Removed ${role.name} from the guild roles list.`, ephemeral: true });
}
