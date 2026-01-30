import { canUseCommand } from '../utils/permissions.js';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export const data = new SlashCommandBuilder()
  .setName('listallupdates')
  .setDescription('Fetch all recent Guild Wars game updates');

function sanitizeImageUrl(url) {
  if (!url || typeof url !== 'string') return null;

  url = url.trim();

  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return 'https://wiki.guildwars.com' + url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  return null;
}

async function fetchUpdateDetails(updateUrl) {
  const res = await fetch(updateUrl);
  const html = await res.text();
  const $ = cheerio.load(html);

  const content = [];
  const updateHeader = $('h2 .mw-headline').first().closest('h2');

  let el = updateHeader.next();
  while (el.length && el[0].tagName !== 'h2') {
    if (el[0].tagName === 'p') {
      const text = el.text().trim();
      if (text) content.push(text);
    } else if (el[0].tagName === 'ul') {
      el.find('li').each((i, li) => {
        content.push(`• ${$(li).text().trim()}`);
      });
    } else if (el[0].tagName === 'h3' || el[0].tagName === 'h4') {
      content.push(`\n**${el.text().replace('[edit]', '').trim()}**\n`);
    }
    el = el.next();
  }

  const description = content.join('\n');
  const imageEl = $('.mw-parser-output img').first();
  const imageUrl = sanitizeImageUrl(imageEl?.attr('src'));

  return { description: description || 'No summary available.', imageUrl };
}

// Split text into chunks that fit in Discord embeds
function splitTextIntoChunks(text, maxLength = 4096) {
  if (!text) return [''];
  const chunks = [];
  let current = '';
  const lines = text.split('\n');

  for (const line of lines) {
    if ((current + '\n' + line).length > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function execute(interaction) {
  if (!canUseCommand(interaction)) {
    return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
  }

  await interaction.deferReply();

  try {
    const res = await fetch('https://wiki.guildwars.com/wiki/Game_updates');
    const html = await res.text();
    const $ = cheerio.load(html);

    const updates = [];
    $('.mw-parser-output > div[style*="float: right"] ul').first().find('li').each((i, el) => {
      const linkEl = $(el).find('a').first();
      if (!linkEl.length) return;
      const title = linkEl.text().trim();
      const link = linkEl.attr('href') ? 'https://wiki.guildwars.com' + linkEl.attr('href') : null;
      if (!title || !link) return;
      updates.push({ title, link });
    });

    if (!updates.length) return interaction.editReply({ content: 'No updates found.' });

    let firstMessage = true;

    for (const update of updates) {
      if (!update.link) continue;

      const { description, imageUrl } = await fetchUpdateDetails(update.link);
      const chunks = splitTextIntoChunks(description);

      for (let i = 0; i < chunks.length; i++) {
        const embed = new EmbedBuilder()
          .setTitle(i === 0 ? update.title : `${update.title} (cont.)`)
          .setURL(update.link)
          .setDescription(chunks[i])
          .setFooter({ text: 'Full patch notes via link above' });

        if (i === 0 && imageUrl) embed.setImage(imageUrl);

        if (firstMessage) {
          await interaction.editReply({ embeds: [embed] });
          firstMessage = false;
        } else {
          await interaction.followUp({ embeds: [embed] });
        }
      }
    }

  } catch (err) {
    console.error(err);
    await interaction.editReply({ content: 'Error fetching updates.' });
  }
}
