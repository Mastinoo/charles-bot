import { SlashCommandBuilder } from 'discord.js';
import db from '../../database.js';

export const data = new SlashCommandBuilder()
  .setName('stream-setrole')
  .setDescription('Set the live role for this guild')
  .addRoleOption(opt =>
    opt
      .setName('role')
      .setDescription('Role to assign when a streamer goes live')
      .setRequired(true)
  );

export async function execute(interaction) {
  const role = interaction.options.getRole('role');

  // Upsert into guild_settings table
  db.prepare(`
    INSERT INTO guild_settings (guildId, liveRoleId)
    VALUES (?, ?)
    ON CONFLICT(guildId) DO UPDATE SET liveRoleId=excluded.liveRoleId
  `).run(interaction.guild.id, role.id);

  // Also update all existing streamers in this guild to have this role
  db.prepare(`
    UPDATE streamers
    SET liveRoleId = ?
    WHERE guildId = ?
  `).run(role.id, interaction.guild.id);

  interaction.reply({
    content: `✅ Live role set to ${role.name} for this guild and all existing streamers`,
    ephemeral: true
  });
}
