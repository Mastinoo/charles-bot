import { SlashCommandBuilder } from 'discord.js';
import db from '../../database.js';

export const data = new SlashCommandBuilder()
  .setName('stream-remove')
  .setDescription('Remove a tracked streamer')
  .addUserOption(opt => opt.setName('discord').setDescription('Discord user linked to streamer').setRequired(true));

export async function execute(interaction) {
  const discordUser = interaction.options.getUser('discord');
  const result = db.prepare("DELETE FROM streamers WHERE guildId=? AND discordUserId=?").run(interaction.guild.id, discordUser.id);
  interaction.reply({ content: result.changes > 0 ? `✅ Removed streamer for ${discordUser.tag}` : '❌ No streamer found.', ephemeral: true });
}

