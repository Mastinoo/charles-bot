import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';
import {
  applyRevivalistRoles,
  getBackfillJob,
  getMemberRevivalProgress,
  getRevivalConfig,
  getRevivalStatsSummary,
  recomputeRevivalStats,
  setRevivalExclusion,
  simulateRevivalThresholds,
  startRevivalBackfill,
  upsertRevivalConfig,
  validateBaselineDate
} from '../services/revivalRankService.js';

function isOwner(interaction) {
  return interaction.user.id === process.env.OWNER_ID;
}

function canManage(interaction) {
  return isOwner(interaction)
    || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

// Potentially destructive, bulk, or progression-changing operations are owner-only.
// Server administrators can still inspect status/config/member progression.
const OWNER_ONLY_SUBCOMMANDS = new Set([
  'setup',
  'thresholds',
  'baseline',
  'exclude-channel',
  'include-channel',
  'exclude-category',
  'include-category',
  'backfill',
  'simulate',
  'apply'
]);

function formatRole(id) {
  return id ? `<@&${id}>` : 'Not configured';
}

function formatJob(job) {
  if (!job) return 'No backfill has been started since Charles last restarted.';
  const lines = [
    `**State:** ${job.state}`,
    `**Baseline:** ${job.baselineDate}`,
    `**Channels:** ${job.channelsDone}/${job.channelsTotal || '?'}`,
    `**Messages scanned:** ${job.messagesScanned.toLocaleString()}`,
    `**API batches:** ${job.apiBatches.toLocaleString()}`
  ];
  if (job.result) {
    lines.push(
      `**Users with qualifying history:** ${job.result.usersWithMessages.toLocaleString()}`,
      `**Current members eligible:** ${job.result.eligible.toLocaleString()}`,
      `**Already Revivalist:** ${job.result.alreadyRevivalist.toLocaleString()}`,
      `**Ascended skipped:** ${job.result.ascended.toLocaleString()}`
    );
  }
  if (job.errors?.length) lines.push(`**Channel errors:** ${job.errors.length}`);
  return lines.join('\n');
}

export const data = new SlashCommandBuilder()
  .setName('revival')
  .setDescription('Configure and manage GWR Revivalist progression')
  .addSubcommand(sub => sub
    .setName('setup')
    .setDescription('Configure the three Revival rank roles')
    .addRoleOption(option => option
      .setName('awakened_role')
      .setDescription('The baseline Awakened role (Charles will not manage this role)')
      .setRequired(true))
    .addRoleOption(option => option
      .setName('revivalist_role')
      .setDescription('The role Charles automatically awards')
      .setRequired(true))
    .addRoleOption(option => option
      .setName('ascended_role')
      .setDescription('The manual Ascended role (Charles will never award/remove it)')
      .setRequired(true)))
  .addSubcommand(sub => sub
    .setName('thresholds')
    .setDescription('Set Revivalist progression requirements')
    .addIntegerOption(option => option
      .setName('messages')
      .setDescription('Capped qualifying messages required')
      .setMinValue(1)
      .setMaxValue(100000))
    .addIntegerOption(option => option
      .setName('active_days')
      .setDescription('Different active days required')
      .setMinValue(1)
      .setMaxValue(3650))
    .addIntegerOption(option => option
      .setName('tenure_days')
      .setDescription('Days in the Discord required')
      .setMinValue(0)
      .setMaxValue(3650))
    .addIntegerOption(option => option
      .setName('daily_cap')
      .setDescription('Maximum messages per day that count toward progression')
      .setMinValue(1)
      .setMaxValue(10000)))
  .addSubcommand(sub => sub
    .setName('baseline')
    .setDescription('Set the earliest date used by the historical backfill')
    .addStringOption(option => option
      .setName('date')
      .setDescription('YYYY-MM-DD, e.g. 2025-12-09')
      .setRequired(true)))
  .addSubcommand(sub => sub
    .setName('exclude-channel')
    .setDescription('Exclude a channel and its threads from Revivalist progression')
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Channel to exclude')
      .setRequired(true)))
  .addSubcommand(sub => sub
    .setName('include-channel')
    .setDescription('Remove a channel from the exclusion list')
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Channel to include again')
      .setRequired(true)))
  .addSubcommand(sub => sub
    .setName('exclude-category')
    .setDescription('Exclude an entire category from Revivalist progression')
    .addChannelOption(option => option
      .setName('category')
      .setDescription('Category to exclude')
      .addChannelTypes(ChannelType.GuildCategory)
      .setRequired(true)))
  .addSubcommand(sub => sub
    .setName('include-category')
    .setDescription('Remove a category from the exclusion list')
    .addChannelOption(option => option
      .setName('category')
      .setDescription('Category to include again')
      .addChannelTypes(ChannelType.GuildCategory)
      .setRequired(true)))
  .addSubcommand(sub => sub
    .setName('backfill')
    .setDescription('Start a dry-run historical message scan; no roles are assigned'))
  .addSubcommand(sub => sub
    .setName('status')
    .setDescription('Show current Revivalist progression/backfill status'))
  .addSubcommand(sub => sub
    .setName('simulate')
    .setDescription('Compare Revivalist thresholds without changing roles or configuration')
    .addIntegerOption(option => option
      .setName('messages')
      .setDescription('Optional custom qualifying-message threshold')
      .setMinValue(1)
      .setMaxValue(100000))
    .addIntegerOption(option => option
      .setName('active_days')
      .setDescription('Optional custom active-day threshold')
      .setMinValue(1)
      .setMaxValue(3650))
    .addIntegerOption(option => option
      .setName('tenure_days')
      .setDescription('Optional custom server-tenure threshold')
      .setMinValue(0)
      .setMaxValue(3650)))
  .addSubcommand(sub => sub
    .setName('apply')
    .setDescription('Apply Revivalist to everyone who currently qualifies')
    .addBooleanOption(option => option
      .setName('confirm')
      .setDescription('Must be true; prevents accidental bulk role assignment')
      .setRequired(true)))
  .addSubcommand(sub => sub
    .setName('member')
    .setDescription('Inspect stored progression for one member')
    .addUserOption(option => option
      .setName('user')
      .setDescription('Member to inspect')
      .setRequired(true)))
  .addSubcommand(sub => sub
    .setName('config')
    .setDescription('Show current Revivalist configuration'));

export async function execute(interaction) {
  if (!canManage(interaction)) {
    return interaction.reply({
      content: '❌ Only the bot owner or a server administrator can manage Revivalist progression.',
      ephemeral: true
    });
  }

  const sub = interaction.options.getSubcommand();

  if (OWNER_ONLY_SUBCOMMANDS.has(sub) && !isOwner(interaction)) {
    return interaction.reply({
      content: '❌ This Revival maintenance command is restricted to the bot owner.',
      ephemeral: true
    });
  }

  if (sub === 'setup') {
    const awakened = interaction.options.getRole('awakened_role');
    const revivalist = interaction.options.getRole('revivalist_role');
    const ascended = interaction.options.getRole('ascended_role');

    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: '❌ Charles needs the **Manage Roles** permission before he can award Revivalist.',
        ephemeral: true
      });
    }
    if (me.roles.highest.comparePositionTo(revivalist) <= 0) {
      return interaction.reply({
        content: `❌ Charles' highest role must sit **above ${revivalist}** in the role hierarchy before he can award it.`,
        ephemeral: true
      });
    }

    const config = upsertRevivalConfig(interaction.guildId, {
      awakenedRoleId: awakened.id,
      revivalistRoleId: revivalist.id,
      ascendedRoleId: ascended.id,
      enabled: 1
    });

    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('✅ Revival ranks configured')
      .setDescription('Charles will only automate **Revivalist**. Awakened and Ascended are never automatically changed by this module.')
      .addFields(
        { name: 'Awakened', value: formatRole(config.awakenedRoleId), inline: true },
        { name: 'Revivalist', value: formatRole(config.revivalistRoleId), inline: true },
        { name: 'Ascended', value: formatRole(config.ascendedRoleId), inline: true },
        { name: 'Messages', value: String(config.messageThreshold), inline: true },
        { name: 'Active days', value: String(config.activeDaysThreshold), inline: true },
        { name: 'Tenure', value: `${config.tenureDaysThreshold} days`, inline: true },
        { name: 'Daily cap', value: String(config.dailyCap), inline: true },
        { name: 'Backfill baseline', value: config.baselineDate, inline: true }
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  let config = getRevivalConfig(interaction.guildId, { fresh: true });
  if (!config) {
    return interaction.reply({
      content: '❌ Revivalist progression is not configured yet. Run `/revival setup` first.',
      ephemeral: true
    });
  }

  if (sub === 'thresholds') {
    const messages = interaction.options.getInteger('messages');
    const activeDays = interaction.options.getInteger('active_days');
    const tenureDays = interaction.options.getInteger('tenure_days');
    const dailyCap = interaction.options.getInteger('daily_cap');

    if ([messages, activeDays, tenureDays, dailyCap].every(value => value === null)) {
      return interaction.reply({ content: '❌ Set at least one threshold value.', ephemeral: true });
    }

    const oldCap = config.dailyCap;
    config = upsertRevivalConfig(interaction.guildId, {
      ...(messages !== null ? { messageThreshold: messages } : {}),
      ...(activeDays !== null ? { activeDaysThreshold: activeDays } : {}),
      ...(tenureDays !== null ? { tenureDaysThreshold: tenureDays } : {}),
      ...(dailyCap !== null ? { dailyCap } : {})
    });

    if (dailyCap !== null && dailyCap !== oldCap) {
      recomputeRevivalStats(interaction.guildId, config.dailyCap);
    }

    return interaction.reply({
      content: `✅ Revivalist requirements: **${config.messageThreshold} messages**, **${config.activeDaysThreshold} active days**, **${config.tenureDaysThreshold} days tenure**, **${config.dailyCap}/day cap**.`,
      ephemeral: true
    });
  }

  if (sub === 'baseline') {
    const date = interaction.options.getString('date', true);
    if (!validateBaselineDate(date)) {
      return interaction.reply({ content: '❌ Use a valid date in `YYYY-MM-DD` format.', ephemeral: true });
    }
    config = upsertRevivalConfig(interaction.guildId, { baselineDate: date });
    return interaction.reply({ content: `✅ Historical baseline set to **${config.baselineDate}**.`, ephemeral: true });
  }

  if (sub === 'exclude-channel' || sub === 'include-channel') {
    const channel = interaction.options.getChannel('channel', true);
    const exclude = sub === 'exclude-channel';
    setRevivalExclusion(interaction.guildId, 'channel', channel.id, exclude);
    return interaction.reply({
      content: `${exclude ? '✅ Excluded' : '✅ Included'} ${channel}${exclude ? ' and its threads' : ''}.`,
      ephemeral: true
    });
  }

  if (sub === 'exclude-category' || sub === 'include-category') {
    const category = interaction.options.getChannel('category', true);
    const exclude = sub === 'exclude-category';
    setRevivalExclusion(interaction.guildId, 'category', category.id, exclude);
    return interaction.reply({
      content: `${exclude ? '✅ Excluded' : '✅ Included'} category **${category.name}**.`,
      ephemeral: true
    });
  }

  if (sub === 'backfill') {
    try {
      const job = await startRevivalBackfill(interaction.guild);
      return interaction.reply({
        content: `✅ Historical dry-run started from **${job.baselineDate}**.\nNo roles will be assigned. Use \`/revival status\` to check progress.`,
        ephemeral: true
      });
    } catch (error) {
      return interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
    }
  }

  if (sub === 'simulate') {
    const customMessages = interaction.options.getInteger('messages');
    const customActiveDays = interaction.options.getInteger('active_days');
    const customTenureDays = interaction.options.getInteger('tenure_days');

    const hasCustom = [customMessages, customActiveDays, customTenureDays]
      .some(value => value !== null);

    const scenarios = hasCustom
      ? [{
          messageThreshold: customMessages ?? config.messageThreshold,
          activeDaysThreshold: customActiveDays ?? config.activeDaysThreshold,
          tenureDaysThreshold: customTenureDays ?? config.tenureDaysThreshold
        }]
      : [
          { messageThreshold: config.messageThreshold, activeDaysThreshold: config.activeDaysThreshold, tenureDaysThreshold: config.tenureDaysThreshold },
          { messageThreshold: 75, activeDaysThreshold: 6, tenureDaysThreshold: 7 },
          { messageThreshold: 50, activeDaysThreshold: 5, tenureDaysThreshold: 7 },
          { messageThreshold: 40, activeDaysThreshold: 4, tenureDaysThreshold: 7 },
          { messageThreshold: 30, activeDaysThreshold: 3, tenureDaysThreshold: 7 },
          { messageThreshold: 25, activeDaysThreshold: 3, tenureDaysThreshold: 7 }
        ];

    // Avoid showing the current configuration twice when it matches one of the presets.
    const uniqueScenarios = [];
    const seen = new Set();
    for (const scenario of scenarios) {
      const key = `${scenario.messageThreshold}:${scenario.activeDaysThreshold}:${scenario.tenureDaysThreshold}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueScenarios.push(scenario);
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const simulation = await simulateRevivalThresholds(interaction.guild, uniqueScenarios);
      const rows = simulation.results.map(result => {
        const threshold = `${result.messageThreshold}/${result.activeDaysThreshold}/${result.tenureDaysThreshold}`.padEnd(10);
        const eligible = String(result.eligible).padStart(4);
        const have = String(result.alreadyRevivalist).padStart(4);
        const add = String(result.wouldAward).padStart(4);
        return `${threshold} | ${eligible} | ${have} | ${add}`;
      });

      const table = [
        'Msgs/Days/T | Elig | Have |  New',
        '----------- | ---- | ---- | ----',
        ...rows
      ].join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle('🧪 Revivalist Threshold Simulation')
        .setDescription([
          'Dry simulation only — **no roles or settings are changed**.',
          '',
          '```',
          table,
          '```',
          '**Elig** = current non-Ascended members meeting the threshold',
          '**Have** = eligible members who already have Revivalist',
          '**New** = members who would receive Revivalist'
        ].join('\n'))
        .addFields(
          { name: 'Daily cap', value: `${simulation.dailyCap}/day (current stored progression)`, inline: true },
          { name: 'Tracked users', value: simulation.trackedUsers.toLocaleString(), inline: true },
          { name: 'Human members', value: simulation.humanMembers.toLocaleString(), inline: true },
          { name: 'Current Revivalist holders', value: simulation.revivalistRoleHolders.toLocaleString(), inline: true },
          { name: 'Ascended excluded', value: simulation.ascendedTotal.toLocaleString(), inline: true }
        );

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      return interaction.editReply({ content: `❌ ${error.message}` });
    }
  }

  if (sub === 'status') {
    config = getRevivalConfig(interaction.guildId, { fresh: true });
    const job = getBackfillJob(interaction.guildId);
    const stats = getRevivalStatsSummary(interaction.guildId);
    const exclusions = config.exclusions.channels.size + config.exclusions.categories.size;

    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('📊 Revivalist Progression Status')
      .addFields(
        { name: 'Tracked users', value: Number(stats.trackedUsers || 0).toLocaleString(), inline: true },
        { name: 'Qualifying messages', value: Number(stats.qualifyingMessages || 0).toLocaleString(), inline: true },
        { name: 'Raw messages', value: Number(stats.rawMessages || 0).toLocaleString(), inline: true },
        { name: 'Requirements', value: `${config.messageThreshold} msgs • ${config.activeDaysThreshold} active days • ${config.tenureDaysThreshold} days tenure • ${config.dailyCap}/day cap`, inline: false },
        { name: 'Exclusions', value: `${exclusions} configured`, inline: true },
        { name: 'Last completed backfill', value: config.backfillCompletedAt || 'Never', inline: true },
        { name: 'Current/last in-memory job', value: formatJob(job), inline: false }
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (sub === 'apply') {
    const confirm = interaction.options.getBoolean('confirm', true);
    if (!confirm) {
      return interaction.reply({
        content: '❌ Nothing changed. Run `/revival apply confirm:true` when you are ready.',
        ephemeral: true
      });
    }

    const job = getBackfillJob(interaction.guildId);
    if (job?.state === 'running') {
      return interaction.reply({ content: '❌ Wait for the historical backfill to finish first.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await applyRevivalistRoles(interaction.guild);
      return interaction.editReply({
        content: [
          '✅ **Revivalist role application complete.**',
          `Eligible: **${result.eligible}**`,
          `Newly awarded: **${result.awarded}**`,
          `Already had Revivalist: **${result.alreadyHad}**`,
          `Ascended skipped: **${result.skippedAscended}**`,
          `Failed: **${result.failed}**`
        ].join('\n')
      });
    } catch (error) {
      return interaction.editReply({ content: `❌ ${error.message}` });
    }
  }

  if (sub === 'member') {
    const user = interaction.options.getUser('user', true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const progress = getMemberRevivalProgress(interaction.guildId, user.id);
    const tenure = member?.joinedTimestamp
      ? Math.floor((Date.now() - member.joinedTimestamp) / 86_400_000)
      : 0;
    const actualRank = member?.roles.cache.has(config.ascendedRoleId)
      ? 'Ascended ✨'
      : member?.roles.cache.has(config.revivalistRoleId)
        ? 'Revivalist 💜'
        : 'Awakened 🌱';

    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle(`${user.username} — Revival progression`)
      .addFields(
        { name: 'Current rank', value: actualRank, inline: false },
        { name: 'Messages', value: `${progress.qualifyingMessages}/${config.messageThreshold} qualifying (${progress.rawMessages} raw)`, inline: true },
        { name: 'Active days', value: `${progress.activeDays}/${config.activeDaysThreshold}`, inline: true },
        { name: 'Tenure', value: `${tenure}/${config.tenureDaysThreshold} days`, inline: true },
        { name: 'Revivalist awarded', value: progress.revivalistAwardedAt || 'Not yet', inline: false }
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (sub === 'config') {
    const channelExclusions = [...config.exclusions.channels].map(id => `<#${id}>`).join(', ') || 'None';
    const categoryExclusions = [...config.exclusions.categories]
      .map(id => interaction.guild.channels.cache.get(id)?.name || id)
      .join(', ') || 'None';

    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('⚙️ Revivalist Configuration')
      .addFields(
        { name: 'Awakened', value: formatRole(config.awakenedRoleId), inline: true },
        { name: 'Revivalist', value: formatRole(config.revivalistRoleId), inline: true },
        { name: 'Ascended', value: formatRole(config.ascendedRoleId), inline: true },
        { name: 'Requirements', value: `${config.messageThreshold} messages\n${config.activeDaysThreshold} active days\n${config.tenureDaysThreshold} days tenure\n${config.dailyCap} messages/day max`, inline: true },
        { name: 'Historical baseline', value: config.baselineDate, inline: true },
        { name: 'Enabled', value: config.enabled ? 'Yes' : 'No', inline: true },
        { name: 'Excluded channels', value: channelExclusions.slice(0, 1024), inline: false },
        { name: 'Excluded categories', value: categoryExclusions.slice(0, 1024), inline: false }
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
