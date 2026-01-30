import { SlashCommandBuilder } from 'discord.js';
import db from '../../database.js';

export const data = new SlashCommandBuilder()
  .setName('stream-setgame')
  .setDescription('Set a game filter')
  .addUserOption(opt => opt.setName('discord').setDescription('Discord user').setRequired(true))
  .addStringOption(opt => opt.setName('game').setDescription('Game name').setRequired(true));

export async function execute(interaction) {
  const discordUser = interaction.options.getUser('discord');
  const game = interaction.options.getString('game');
  db.prepare("UPDATE streamers SET gameFilter=? WHERE guildId=? AND discordUserId=?").run(game, interaction.guild.id, discordUser.id);
  interaction.reply({ content: `✅ Game filter set to "${game}" for ${discordUser.tag}`, ephemeral: true });
}

