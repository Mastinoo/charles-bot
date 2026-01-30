import { canUseCommand } from '../utils/permissions.js';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export const data = new SlashCommandBuilder()
  .setName('latestupdate')
  .setDescription('Fetch the latest Guild Wars game update');

function sanitizeImageUrl(url) {
  if (!url || typeof url !== 'string') return null;

  url = url.trim();
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return 'https://wiki.guildwars.com' + url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  return null;
}

function splitTextIntoChunks(text, maxLength = 4000) {
  if (!text) return [''];
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let sliceIndex = remaining.lastIndexOf('\n', maxLength);
    if (sliceIndex === -1) sliceIndex = maxLength;
    chunks.push(remaining.slice(0, sliceIndex));
    remaining = remaining.slice(sliceIndex).trim();
  }

  if (remaining.length) chunks.push(remaining);
  return chunks;
}

async function fetchUpdateDetails(updateUrl) {
  const res = await fetch(updateUrl);
  const html = await res.text();
  const $ = cheerio.load(html);

  const content = [];
  const updateHeader = $('h2 .mw-headline').first().closest('h2');
  let el = updateHeader.next();

  while (el.length && el[0].tagName !== 'h2') {
    if (el[0].tagName === 'p') content.push(el.text().trim());
    else if (el[0].tagName === 'ul') el.find('li').each((i, li) => content.push(`• ${$(li).text().trim()}`));
    else if (el[0].tagName === 'h3' || el[0].tagName === 'h4')
      content.push(`\n**${el.text().replace('[edit]', '').trim()}**\n`);
    el = el.next();
  }

  const description = content.join('\n');
  const imageEl = $('.mw-parser-output img').first();
  const imageUrl = sanitizeImageUrl(imageEl?.attr('src'));

  return { description: description || 'No summary available.', imageUrl };
}

export async function execute(interaction) {
  if (!canUseCommand(interaction))
    return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });

  await interaction.deferReply();

  try {
    const res = await fetch('https://wiki.guildwars.com/wiki/Game_updates');
    const html = await res.text();
    const $ = cheerio.load(html);

    const firstUpdateEl = $('.mw-parser-output > div[style*="float: right"] ul').first().find('li').first();
    const linkEl = firstUpdateEl.find('a').first();
    if (!linkEl.length) return interaction.editReply({ content: 'No updates found.' });

    const title = linkEl.text().trim();
    const link = linkEl.attr('href') ? 'https://wiki.guildwars.com' + linkEl.attr('href') : null;
    if (!title || !link) return interaction.editReply({ content: 'No updates found.' });

    const { description, imageUrl } = await fetchUpdateDetails(link);
    const chunks = splitTextIntoChunks(description);

    // Send multiple embeds if needed
    const embeds = chunks.map((chunk, i) => {
      const embed = new EmbedBuilder()
        .setTitle(i === 0 ? title : `${title} (cont.)`)
        .setURL(link)
        .setDescription(chunk)
        .setFooter({ text: `Date: ${new Date().toLocaleDateString()} | Full patch notes via link above` });
      if (i === 0 && imageUrl) embed.setImage(imageUrl);
      return embed;
    });

    await interaction.editReply({ embeds });

  } catch (err) {
    console.error(err);
    await interaction.editReply({ content: 'Error fetching the latest update.' });
  }
}
