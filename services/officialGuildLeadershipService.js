import fs from 'fs';
import path from 'path';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} from 'discord.js';

const CONFIG_FILE = './data/officialGuildLeadershipConfig.json';
const APPS_FILE = './data/officialGuildLeadershipApplications.json';
const DEFINITION_FILE = './resources/officialGuildLeadershipApplication.json';

export const APPLICATION_PREFIX = 'ogla';

export const STATUS_META = {
  draft: { label: 'Draft', emoji: '📝', color: 0x95a5a6 },
  submitted: { label: 'Submitted', emoji: '📨', color: 0x3498db },
  under_review: { label: 'Under Review', emoji: '🔎', color: 0xf1c40f },
  shortlisted: { label: 'Shortlisted', emoji: '⭐', color: 0xf39c12 },
  interview: { label: 'Interview', emoji: '💬', color: 0x9b59b6 },
  guild_leader_candidate: { label: 'Guild Leader Candidate', emoji: '👑', color: 0xe67e22 },
  founding_officer_candidate: { label: 'Founding Officer Candidate', emoji: '⚔️', color: 0x1abc9c },
  future_candidate: { label: 'Future Candidate', emoji: '🔄', color: 0x7f8c8d },
  accepted: { label: 'Accepted', emoji: '✅', color: 0x2ecc71 },
  unsuccessful: { label: 'Unsuccessful', emoji: '❌', color: 0xe74c3c },
  withdrawn: { label: 'Withdrawn', emoji: '📦', color: 0x7f8c8d }
};

export const CLOSABLE_STATUS_VALUES = [
  'future_candidate',
  'accepted',
  'unsuccessful',
  'withdrawn'
];

export const REVIEW_STATUS_OPTIONS = [
  'under_review',
  'shortlisted',
  'interview',
  'guild_leader_candidate',
  'founding_officer_candidate',
  'future_candidate',
  'accepted',
  'unsuccessful'
];

function readJSON(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`[OFFICIAL GUILD APPLICATIONS] Failed to read ${file}:`, error);
    return fallback;
  }
}

function writeJSON(file, value) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

export function getDefinition() {
  return readJSON(DEFINITION_FILE, { sections: [], positions: [], interests: [], agreement: [] });
}

export function getGuildConfig(guildId) {
  const config = readJSON(CONFIG_FILE, {})[guildId] || null;
  if (!config) return null;

  // Backward compatibility with v1 configs that stored a single reviewerRoleId.
  const reviewerRoleIds = Array.isArray(config.reviewerRoleIds)
    ? config.reviewerRoleIds.filter(Boolean)
    : (config.reviewerRoleId ? [config.reviewerRoleId] : []);

  return { ...config, reviewerRoleIds: [...new Set(reviewerRoleIds)] };
}

export function getReviewerRoleIds(config) {
  if (!config) return [];
  const ids = Array.isArray(config.reviewerRoleIds)
    ? config.reviewerRoleIds.filter(Boolean)
    : (config.reviewerRoleId ? [config.reviewerRoleId] : []);
  return [...new Set(ids)];
}

export function saveGuildConfig(guildId, config) {
  const all = readJSON(CONFIG_FILE, {});
  all[guildId] = { ...(all[guildId] || {}), ...config, updatedAt: new Date().toISOString() };
  writeJSON(CONFIG_FILE, all);
  return all[guildId];
}

function getAllApplications() {
  return readJSON(APPS_FILE, {});
}

function ensureGuildBucket(all, guildId) {
  if (!all[guildId]) {
    all[guildId] = {
      counter: 0,
      activeByUser: {},
      applications: {}
    };
  }
  all[guildId].counter ||= 0;
  all[guildId].activeByUser ||= {};
  all[guildId].applications ||= {};
  return all[guildId];
}

export function getApplication(guildId, applicationId) {
  const all = getAllApplications();
  return all[guildId]?.applications?.[applicationId] || null;
}

export function getActiveApplicationForUser(guildId, userId) {
  const all = getAllApplications();
  const bucket = all[guildId];
  if (!bucket) return null;
  const applicationId = bucket.activeByUser?.[userId];
  if (!applicationId) return null;
  return bucket.applications?.[applicationId] || null;
}

export function createApplication(guildId, user) {
  const all = getAllApplications();
  const bucket = ensureGuildBucket(all, guildId);

  const existingId = bucket.activeByUser[user.id];
  if (existingId && bucket.applications[existingId]) {
    return bucket.applications[existingId];
  }

  bucket.counter += 1;
  const applicationId = `GWR-LEAD-${String(bucket.counter).padStart(4, '0')}`;
  const now = new Date().toISOString();

  const app = {
    id: applicationId,
    guildId,
    applicantId: user.id,
    applicantUsername: user.username,
    applicantDisplayName: user.globalName || user.username,
    status: 'draft',
    position: null,
    channelId: null,
    dashboardMessageId: null,
    reviewMessageId: null,
    reviewChannelId: null,
    sections: {
      profile: {},
      about: { interests: [] },
      vision: {},
      recruitment: {},
      leadership: {},
      final: { agreed: false, agreedAt: null }
    },
    notes: [],
    history: [
      { at: now, by: user.id, action: 'application_created', status: 'draft' }
    ],
    createdAt: now,
    updatedAt: now,
    submittedAt: null
  };

  bucket.applications[applicationId] = app;
  bucket.activeByUser[user.id] = applicationId;
  writeJSON(APPS_FILE, all);
  return app;
}

export function saveApplication(app) {
  const all = getAllApplications();
  const bucket = ensureGuildBucket(all, app.guildId);
  app.updatedAt = new Date().toISOString();
  bucket.applications[app.id] = app;
  const currentActive = bucket.activeByUser[app.applicantId];
  const terminalForReapply = ['withdrawn', 'unsuccessful'].includes(app.status);

  if (terminalForReapply && currentActive === app.id) {
    delete bucket.activeByUser[app.applicantId];
  } else if (!terminalForReapply && (!currentActive || currentActive === app.id)) {
    bucket.activeByUser[app.applicantId] = app.id;
  }
  writeJSON(APPS_FILE, all);
  return app;
}

export function releaseActiveApplication(app) {
  const all = getAllApplications();
  const bucket = ensureGuildBucket(all, app.guildId);
  if (bucket.activeByUser[app.applicantId] === app.id) {
    delete bucket.activeByUser[app.applicantId];
  }
  bucket.applications[app.id] = app;
  writeJSON(APPS_FILE, all);
}

export function addHistory(app, by, action, extra = {}) {
  app.history ||= [];
  app.history.push({ at: new Date().toISOString(), by, action, ...extra });
}

export function positionLabel(value) {
  const position = getDefinition().positions.find(item => item.value === value);
  return position ? `${position.emoji} ${position.label}` : 'Not selected';
}

export function statusLabel(value) {
  const status = STATUS_META[value] || STATUS_META.draft;
  return `${status.emoji} ${status.label}`;
}

export function isSectionComplete(app, sectionId) {
  const definition = getDefinition();
  const section = definition.sections.find(item => item.id === sectionId);
  if (!section) return false;
  const answers = app.sections?.[sectionId] || {};

  if (sectionId === 'profile' && !app.position) return false;

  for (const question of section.questions || []) {
    const value = answers[question.id];
    if (question.required && (!value || !String(value).trim())) return false;
  }

  if (section.requiresInterests && (!Array.isArray(answers.interests) || answers.interests.length === 0)) {
    return false;
  }

  for (const question of section.choiceQuestions || []) {
    if (!answers[question.id]) return false;
  }

  if (section.requiresAgreement && !answers.agreed) return false;

  return true;
}

export function completedSections(app) {
  const definition = getDefinition();
  return definition.sections.filter(section => isSectionComplete(app, section.id)).length;
}

export function applicationComplete(app) {
  const definition = getDefinition();
  return definition.sections.length > 0 && completedSections(app) === definition.sections.length;
}

function progressBar(done, total) {
  return `${'█'.repeat(done)}${'░'.repeat(Math.max(0, total - done))}`;
}

export function buildPublicPanel() {
  const definition = getDefinition();
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle('🏰 Help Build the Next Official GWR Guild')
    .setDescription(
      'Guild Wars Revival is preparing to launch the first pilot guild in a new **GWR-operated guild network**.\n\n' +
      'We are looking for:\n👑 **1 Guild Leader**\n⚔️ **Several Founding Officers**\n\n' +
      `**${definition.tagline}**\n\n` +
      'Applications are completed privately through Charles. Your progress is saved after every section, so you can leave and return at any time.'
    )
    .addFields(
      {
        name: 'What this is',
        value: 'A real leadership opportunity with significant day-to-day freedom inside a permanent Official GWR Guild.'
      },
      {
        name: 'What this is not',
        value: 'An independent guild merely joining GWR. We are looking for people who want to **lead one of ours**.'
      }
    )
    .setFooter({ text: 'Applications reviewed by GWR Leadership — Mastino & Skitzo' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${APPLICATION_PREFIX}:start`)
      .setLabel('Start Application')
      .setEmoji('👑')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${APPLICATION_PREFIX}:learn`)
      .setLabel('Learn More')
      .setEmoji('📖')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

export function buildLearnMoreEmbed() {
  return new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle('📖 Official GWR Guild — Leadership Model')
    .setDescription(
      'Official GWR Guilds are built **from within Guild Wars Revival**, led by trusted community members and operated as permanent parts of the wider network.\n\n' +
      'A Guild Leader receives meaningful freedom over recruitment, Officers, guild activities, member engagement, culture and day-to-day management. In return, the guild is expected to actively contribute to GWR-wide events, collaborate with the other GWR guilds, develop new leaders and operate within GWR rules and overall direction.\n\n' +
      '**Your guild should have its own identity. It should not become its own isolated island.**\n\n' +
      'The application is intentionally substantial because this is intended to be a genuine leadership mandate, not simply ownership of another guild.'
    );
}

export function buildApplicantDashboard(app) {
  const definition = getDefinition();
  const done = completedSections(app);
  const total = definition.sections.length;
  const locked = app.status !== 'draft';

  const lines = definition.sections.map(section => {
    const complete = isSectionComplete(app, section.id);
    return `${complete ? '✅' : '⬜'} ${section.emoji} **${section.title}**`;
  });

  const status = STATUS_META[app.status] || STATUS_META.draft;
  const embed = new EmbedBuilder()
    .setColor(status.color)
    .setTitle('👑 Official GWR Guild Application')
    .setDescription(
      `**Application:** \`${app.id}\`\n` +
      `**Position:** ${positionLabel(app.position)}\n` +
      `**Status:** ${statusLabel(app.status)}\n\n` +
      `**Progress:** ${progressBar(done, total)} **${done}/${total}**\n\n` +
      lines.join('\n') +
      (app.status === 'draft'
        ? '\n\nCharles saves every completed step. You can close Discord and continue from this channel whenever you like.'
        : '\n\nYour answers are locked after submission. This channel remains available for follow-up questions and interview conversation.')
    )
    .setFooter({ text: 'Official GWR Guild pilot • Guild Wars Revival' })
    .setTimestamp(new Date(app.updatedAt || app.createdAt));

  const sectionButtons = definition.sections.map(section =>
    new ButtonBuilder()
      .setCustomId(`${APPLICATION_PREFIX}:section:${section.id}:${app.id}`)
      .setLabel(section.title)
      .setEmoji(section.emoji)
      .setStyle(isSectionComplete(app, section.id) ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(locked)
  );

  const rows = [];
  for (let i = 0; i < sectionButtons.length; i += 3) {
    rows.push(new ActionRowBuilder().addComponents(sectionButtons.slice(i, i + 3)));
  }

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${APPLICATION_PREFIX}:review-own:${app.id}`)
      .setLabel('Review Answers')
      .setEmoji('📄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${APPLICATION_PREFIX}:submit:${app.id}`)
      .setLabel(app.status === 'draft' ? 'Submit Application' : 'Submitted')
      .setEmoji('📨')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(app.status !== 'draft' || !applicationComplete(app)),
    new ButtonBuilder()
      .setCustomId(`${APPLICATION_PREFIX}:withdraw:${app.id}`)
      .setLabel('Withdraw')
      .setEmoji('📦')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(['withdrawn', 'accepted', 'unsuccessful'].includes(app.status))
  );
  rows.push(actionRow);

  return { embeds: [embed], components: rows };
}

export function buildReviewCard(app) {
  const status = STATUS_META[app.status] || STATUS_META.submitted;
  const noteCount = Array.isArray(app.notes) ? app.notes.length : 0;
  const embed = new EmbedBuilder()
    .setColor(status.color)
    .setTitle('👑 Official GWR Guild Leadership Application')
    .setDescription(`**${app.id}**`)
    .addFields(
      { name: 'Applicant', value: `<@${app.applicantId}>`, inline: true },
      { name: 'Position', value: positionLabel(app.position), inline: true },
      { name: 'Status', value: statusLabel(app.status), inline: true },
      { name: 'Character', value: app.sections?.profile?.characterName || '—', inline: true },
      { name: 'Timezone / Country', value: app.sections?.profile?.timezoneCountry || '—', inline: true },
      { name: 'GWR Tenure', value: app.sections?.profile?.gwrTenure || '—', inline: true },
      { name: 'Reviewer Notes', value: String(noteCount), inline: true },
      { name: 'Application Ticket', value: app.closedAt ? `🗃️ Closed by <@${app.closedBy}>` : (app.channelId ? `<#${app.channelId}>` : 'Unavailable'), inline: true },
      {
        name: 'Submitted',
        value: app.submittedAt ? `<t:${Math.floor(new Date(app.submittedAt).getTime() / 1000)}:F>` : '—',
        inline: false
      }
    )
    .setFooter({ text: 'Human review only • no automatic applicant scoring' })
    .setTimestamp(new Date(app.updatedAt || app.createdAt));

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${APPLICATION_PREFIX}:review:read:${app.id}`)
      .setLabel('Read Application')
      .setEmoji('📄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${APPLICATION_PREFIX}:review:note:${app.id}`)
      .setLabel('Add Note')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${APPLICATION_PREFIX}:review:notes:${app.id}`)
      .setLabel(`Notes (${noteCount})`)
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${APPLICATION_PREFIX}:review:close:${app.id}`)
      .setLabel(app.closedAt ? 'Application Closed' : 'Close Application')
      .setEmoji('🗃️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!CLOSABLE_STATUS_VALUES.includes(app.status) || Boolean(app.closedAt))
  );

  const statusMenu = new StringSelectMenuBuilder()
    .setCustomId(`${APPLICATION_PREFIX}:review:status:${app.id}`)
    .setPlaceholder('Update application status')
    .addOptions(REVIEW_STATUS_OPTIONS.map(value => ({
      label: STATUS_META[value].label,
      value,
      emoji: STATUS_META[value].emoji,
      default: app.status === value
    })));

  const statusRow = new ActionRowBuilder().addComponents(statusMenu);
  return { embeds: [embed], components: [actions, statusRow] };
}

export async function refreshApplicantDashboard(guild, app) {
  if (!app.channelId || !app.dashboardMessageId) return false;
  try {
    const channel = await guild.channels.fetch(app.channelId);
    if (!channel?.isTextBased()) return false;
    const message = await channel.messages.fetch(app.dashboardMessageId);
    await message.edit(buildApplicantDashboard(app));
    return true;
  } catch (error) {
    console.warn(`[OFFICIAL GUILD APPLICATIONS] Could not refresh applicant dashboard ${app.id}:`, error.message);
    return false;
  }
}

export async function refreshReviewCard(guild, app) {
  if (!app.reviewChannelId || !app.reviewMessageId) return false;
  try {
    const channel = await guild.channels.fetch(app.reviewChannelId);
    if (!channel?.isTextBased()) return false;
    const message = await channel.messages.fetch(app.reviewMessageId);
    await message.edit(buildReviewCard(app));
    return true;
  } catch (error) {
    console.warn(`[OFFICIAL GUILD APPLICATIONS] Could not refresh review card ${app.id}:`, error.message);
    return false;
  }
}

export function getSection(sectionId) {
  return getDefinition().sections.find(section => section.id === sectionId) || null;
}

export function isReviewer(interaction, config = getGuildConfig(interaction.guildId)) {
  if (!interaction.guild || !interaction.member) return false;
  if (interaction.user.id === process.env.OWNER_ID) return true;
  if (interaction.member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  const reviewerRoleIds = getReviewerRoleIds(config);
  return reviewerRoleIds.some(roleId => interaction.member.roles?.cache?.has?.(roleId));
}

export function sanitizeChannelName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'applicant';
}
