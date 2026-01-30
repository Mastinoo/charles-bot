import { SlashCommandBuilder } from 'discord.js';
import fs from 'fs';

export const data = new SlashCommandBuilder()
  .setName('allowrole')
  .setDescription('Allow a role to use admin-only commands')
  .addStringOption(option =>
    option.setName('role')
      .setDescription('Type part of the role name')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  const focusedValue = interaction.options.getFocused();
  const roles = interaction.guild.roles.cache.map(r => ({ name: r.name, value: r.id }));

  const filtered = roles
    .filter(r => r.name.toLowerCase().includes(focusedValue.toLowerCase()))
    .slice(0, 25);

  await interaction.respond(filtered);
}

export async function execute(interaction) {
  const ownerId = process.env.OWNER_ID;
  const isAdmin = interaction.member.permissions.has(8n); // Administrator
  if (interaction.user.id !== ownerId && !isAdmin) {
    return await interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
  }

  const roleId = interaction.options.getString('role');

  let allowedRoles = fs.existsSync('./data/allowedRoles.json')
    ? JSON.parse(fs.readFileSync('./data/allowedRoles.json', 'utf-8'))
    : {};

  allowedRoles[interaction.guildId] = allowedRoles[interaction.guildId] || [];
  if (!allowedRoles[interaction.guildId].includes(roleId)) {
    allowedRoles[interaction.guildId].push(roleId);
  }

  fs.writeFileSync('./data/allowedRoles.json', JSON.stringify(allowedRoles, null, 2));

  await interaction.reply({ content: `✅ Role <@&${roleId}> can now use admin-only commands.`, ephemeral: true });
}
