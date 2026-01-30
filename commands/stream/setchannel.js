import { SlashCommandBuilder } from 'discord.js';
import db from '../../database.js';

export const data = new SlashCommandBuilder()
  .setName('stream-setchannel')
  .setDescription('Set the announcement channel')
  .addChannelOption(opt => opt.setName('channel').setDescription('Text channel').setRequired(true));

export async function execute(interaction) {
  const channel = interaction.options.getChannel('channel');
  db.prepare("UPDATE streamers SET announceChannelId=? WHERE guildId=?").run(channel.id, interaction.guild.id);
  interaction.reply({ content: `✅ Announcement channel set to ${channel}`, ephemeral: true });
}

