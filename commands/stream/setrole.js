import { SlashCommandBuilder } from 'discord.js';
import db from '../../database.js';

export const data = new SlashCommandBuilder()
  .setName('stream-setrole')
  .setDescription('Set live role')
  .addRoleOption(opt => opt.setName('role').setDescription('Role to assign when live').setRequired(true));

export async function execute(interaction) {
  const role = interaction.options.getRole('role');
  db.prepare("UPDATE streamers SET liveRoleId=? WHERE guildId=?").run(role.id, interaction.guild.id);
  interaction.reply({ content: `✅ Live role set to ${role.name}`, ephemeral: true });
}

