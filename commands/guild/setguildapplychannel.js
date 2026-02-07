import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import fs from 'fs';

const FILE = './data/guildApplyConfig.json';

export const data = new SlashCommandBuilder()
  .setName('setguildapplychannel')
  .setDescription('Set the channel where users can apply')
  .addChannelOption(opt =>
    opt.setName('channel').setDescription('Apply channel').setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const channel = interaction.options.getChannel('channel');

  const cfg = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : {};
  if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};

  cfg[interaction.guildId].applyChannel = channel.id;

  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2));
  await interaction.reply(`✅ Apply channel set to ${channel}`);
}
