import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import {
  APPLICATION_PREFIX,
  CLOSABLE_STATUS_VALUES,
  STATUS_META,
  addHistory,
  applicationComplete,
  buildApplicantDashboard,
  buildLearnMoreEmbed,
  buildReviewCard,
  createApplication,
  getActiveApplicationForUser,
  getApplication,
  getDefinition,
  getGuildConfig,
  getReviewerRoleIds,
  getSection,
  isReviewer,
  positionLabel,
  refreshApplicantDashboard,
  refreshReviewCard,
  releaseActiveApplication,
  sanitizeChannelName,
  saveApplication,
  statusLabel
} from '../services/officialGuildLeadershipService.js';

function appFromInteraction(interaction, applicationId) {
  const app = getApplication(interaction.guildId, applicationId);
  if (!app) return null;
  return app;
}

function ownsApplication(interaction, app) {
  return app && app.applicantId === interaction.user.id;
}

function modalForSection(app, section) {
  const modal = new ModalBuilder()
    .setCustomId(`${APPLICATION_PREFIX}:modal:${section.id}:${app.id}`)
    .setTitle(section.title.slice(0, 45));

  for (const question of section.questions || []) {
    const input = new TextInputBuilder()
      .setCustomId(question.id)
      .setLabel((question.shortLabel || question.label).slice(0, 45))
      .setStyle(question.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
      .setRequired(question.required !== false)
      .setMaxLength(question.style === 'short' ? 200 : 4000);

    const existing = app.sections?.[section.id]?.[question.id];
    if (existing) input.setValue(String(existing).slice(0, question.style === 'short' ? 200 : 4000));

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return modal;
}

function buildPositionSelect(app) {
  const definition = getDefinition();
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${APPLICATION_PREFIX}:position:${app.id}`)
      .setPlaceholder('Which position are you interested in?')
      .addOptions(definition.positions.map(position => ({
        label: position.label,
        value: position.value,
        emoji: position.emoji,
        default: app.position === position.value
      })))
  );
}

function buildInterestsSelect(app) {
  const definition = getDefinition();
  const selected = app.sections?.about?.interests || [];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${APPLICATION_PREFIX}:interests:${app.id}`)
      .setPlaceholder('Select the areas of Guild Wars you enjoy')
      .setMinValues(1)
      .setMaxValues(definition.interests.length)
      .addOptions(definition.interests.map(value => ({
        label: value,
        value,
        default: selected.includes(value)
      })))
  );
}

function buildLeadershipChoices(app) {
  const section = getSection('leadership');
  return (section.choiceQuestions || []).map(question => {
    const existing = app.sections?.leadership?.[question.id];
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${APPLICATION_PREFIX}:leadership-choice:${question.id}:${app.id}`)
        .setPlaceholder(question.placeholder)
        .addOptions(question.options.map(option => ({
          label: option,
          value: option,
          default: existing === option
        })))
    );
  });
}

function buildAgreementPayload(app) {
  const definition = getDefinition();
  const description = definition.agreement.map(item => `• ${item}`).join('\n');
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle('📜 Official GWR Guild Leadership Agreement')
    .setDescription(`${description}\n\nBy confirming, you acknowledge and agree to the above.`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${APPLICATION_PREFIX}:agree:${app.id}`)
      .setLabel(app.sections?.final?.agreed ? 'Agreement Confirmed' : 'I Understand & Agree')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(Boolean(app.sections?.final?.agreed))
  );

  return { embeds: [embed], components: [row] };
}

function buildSectionPicker(app, mode = 'own') {
  const definition = getDefinition();
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${APPLICATION_PREFIX}:view-section:${mode}:${app.id}`)
    .setPlaceholder('Choose a section to read')
    .addOptions(definition.sections.map(section => ({
      label: section.title,
      value: section.id,
      emoji: section.emoji
    })));

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`📄 ${app.id}`)
    .setDescription(
      `**Applicant:** <@${app.applicantId}>\n` +
      `**Position:** ${positionLabel(app.position)}\n` +
      `**Status:** ${statusLabel(app.status)}\n\n` +
      'Choose a section below. Charles will show the complete saved answers privately.'
    );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true };
}

function sectionQuestionBlocks(app, sectionId) {
  const definition = getDefinition();
  const section = definition.sections.find(item => item.id === sectionId);
  if (!section) return [];
  const answers = app.sections?.[sectionId] || {};
  const blocks = [`# ${section.emoji} ${section.title}\n**Application:** \`${app.id}\``];

  if (sectionId === 'profile') {
    blocks.push(`**Position applied for**\n${positionLabel(app.position)}`);
  }

  for (const question of section.questions || []) {
    const number = question.number ? `Q${question.number}. ` : '';
    blocks.push(`**${number}${question.label}**\n${answers[question.id] || '_No answer saved._'}`);
  }

  if (sectionId === 'about') {
    blocks.push(
      `**Q5. Which areas of Guild Wars do you enjoy most?**\n` +
      ((answers.interests || []).length ? answers.interests.join(', ') : '_No answer saved._')
    );
  }

  for (const question of section.choiceQuestions || []) {
    blocks.push(`**Q${question.number}. ${question.label}**\n${answers[question.id] || '_No answer saved._'}`);
  }

  if (section.requiresAgreement) {
    blocks.push(
      `**Agreement**\n${answers.agreed ? `✅ Confirmed${answers.agreedAt ? ` on <t:${Math.floor(new Date(answers.agreedAt).getTime() / 1000)}:F>` : ''}` : '❌ Not confirmed'}`
    );
  }

  return blocks;
}

function splitDiscordText(text, limit = 1900) {
  if (text.length <= limit) return [text];
  const parts = [];
  let remaining = text;
  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf('\n', limit);
    if (splitAt < Math.floor(limit * 0.5)) splitAt = limit;
    parts.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n+/, '');
  }
  if (remaining) parts.push(remaining);
  return parts;
}

async function sendSectionPrivately(interaction, app, sectionId) {
  const blocks = sectionQuestionBlocks(app, sectionId);
  const messages = [];
  for (const block of blocks) {
    messages.push(...splitDiscordText(block));
  }

  await interaction.deferUpdate();
  for (const content of messages) {
    await interaction.followUp({ content, ephemeral: true });
  }
}

async function refreshBoth(interaction, app) {
  await Promise.all([
    refreshApplicantDashboard(interaction.guild, app),
    refreshReviewCard(interaction.guild, app)
  ]);
}

async function createApplicationChannel(interaction, app, config) {
  const guild = interaction.guild;
  const applicantMember = await guild.members.fetch(interaction.user.id);

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: applicantMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    ...getReviewerRoleIds(config).map(roleId => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    })),
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  const channelName = `gwr-app-${sanitizeChannelName(interaction.user.username)}-${app.id.split('-').pop()}`;
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId,
    topic: `Official GWR Guild leadership application ${app.id} • Applicant ${interaction.user.id}`,
    permissionOverwrites,
    reason: `Official GWR Guild leadership application ${app.id}`
  });

  const welcome = await channel.send({
    content: `<@${interaction.user.id}>`,
    ...buildApplicantDashboard(app)
  });

  app.channelId = channel.id;
  app.dashboardMessageId = welcome.id;
  saveApplication(app);
  await welcome.edit(buildApplicantDashboard(app));
  return channel;
}

async function handleStart(interaction) {
  const config = getGuildConfig(interaction.guildId);
  if (!config?.reviewChannelId || !config?.ticketCategoryId || getReviewerRoleIds(config).length === 0) {
    return interaction.reply({
      content: '❌ Official GWR Guild leadership applications are not available yet. Please contact GWR Leadership.',
      ephemeral: true
    });
  }

  let app = getActiveApplicationForUser(interaction.guildId, interaction.user.id);
  if (app?.channelId) {
    const channel = await interaction.guild.channels.fetch(app.channelId).catch(() => null);
    if (channel) {
      return interaction.reply({
        content: `You already have an active application: **${app.id}**\nContinue it here: ${channel}`,
        ephemeral: true
      });
    }
  }

  if (!app) app = createApplication(interaction.guildId, interaction.user);

  await interaction.deferReply({ ephemeral: true });
  try {
    const channel = await createApplicationChannel(interaction, app, config);
    return interaction.editReply({
      content: `✅ Your private Official GWR Guild application has been created: ${channel}\n\nCharles will save your progress after every section.`
    });
  } catch (error) {
    console.error('[OFFICIAL GUILD APPLICATIONS] Could not create application channel:', error);
    return interaction.editReply({
      content: '❌ Charles could not create your private application channel. Please ask GWR Leadership to check the configured category and Charles\' channel permissions.'
    });
  }
}

async function handleSectionButton(interaction, sectionId, applicationId) {
  const app = appFromInteraction(interaction, applicationId);
  if (!app || !ownsApplication(interaction, app)) {
    return interaction.reply({ content: '❌ This application does not belong to you.', ephemeral: true });
  }
  if (app.status !== 'draft') {
    return interaction.reply({ content: '🔒 Submitted applications can no longer be edited.', ephemeral: true });
  }

  if (sectionId === 'profile') {
    return interaction.reply({
      content: 'First choose the position you are applying for. Charles will then open your profile details.',
      components: [buildPositionSelect(app)],
      ephemeral: true
    });
  }

  const section = getSection(sectionId);
  if (!section) return interaction.reply({ content: '❌ Unknown application section.', ephemeral: true });
  return interaction.showModal(modalForSection(app, section));
}

async function handleModal(interaction, sectionId, applicationId) {
  const app = appFromInteraction(interaction, applicationId);
  if (!app || !ownsApplication(interaction, app)) {
    return interaction.reply({ content: '❌ This application does not belong to you.', ephemeral: true });
  }
  if (app.status !== 'draft') {
    return interaction.reply({ content: '🔒 Submitted applications can no longer be edited.', ephemeral: true });
  }

  const section = getSection(sectionId);
  if (!section) return interaction.reply({ content: '❌ Unknown application section.', ephemeral: true });

  app.sections[sectionId] ||= {};
  for (const question of section.questions || []) {
    app.sections[sectionId][question.id] = interaction.fields.getTextInputValue(question.id).trim();
  }
  if (sectionId === 'final') {
    app.sections.final.agreed = false;
    app.sections.final.agreedAt = null;
  }
  addHistory(app, interaction.user.id, 'section_saved', { section: sectionId });
  saveApplication(app);
  await refreshApplicantDashboard(interaction.guild, app);

  if (section.requiresInterests) {
    return interaction.reply({
      content: '✅ Your written answers are saved. Complete this section by selecting the areas of Guild Wars you enjoy most:',
      components: [buildInterestsSelect(app)],
      ephemeral: true
    });
  }

  if (sectionId === 'leadership') {
    return interaction.reply({
      content: '✅ Your scenario answers are saved. Complete this section with the two leadership preference questions below:',
      components: buildLeadershipChoices(app),
      ephemeral: true
    });
  }

  if (section.requiresAgreement) {
    return interaction.reply({
      content: '✅ Your final written answers are saved. Please read and confirm the leadership agreement to complete the final section.',
      ...buildAgreementPayload(app),
      ephemeral: true
    });
  }

  return interaction.reply({
    content: `✅ **${section.title}** saved. Your progress has been updated in your application channel.`,
    ephemeral: true
  });
}

async function submitApplication(interaction, app) {
  if (!applicationComplete(app)) {
    return interaction.reply({ content: '❌ Your application is not complete yet.', ephemeral: true });
  }
  if (app.status !== 'draft') {
    return interaction.reply({ content: `This application is already ${statusLabel(app.status)}.`, ephemeral: true });
  }

  const config = getGuildConfig(interaction.guildId);
  const reviewChannel = await interaction.guild.channels.fetch(config?.reviewChannelId).catch(() => null);
  if (!reviewChannel?.isTextBased()) {
    return interaction.reply({
      content: '❌ The GWR Leadership review channel is unavailable. Please contact GWR Leadership before submitting.',
      ephemeral: true
    });
  }

  app.status = 'submitted';
  app.submittedAt = new Date().toISOString();
  addHistory(app, interaction.user.id, 'submitted', { status: 'submitted' });
  saveApplication(app);

  const reviewerMentions = getReviewerRoleIds(config).map(roleId => `<@&${roleId}>`).join(' ');
  const reviewMessage = await reviewChannel.send({
    content: `${reviewerMentions} New Official GWR Guild leadership application`,
    ...buildReviewCard(app)
  });
  app.reviewChannelId = reviewChannel.id;
  app.reviewMessageId = reviewMessage.id;
  saveApplication(app);
  await refreshApplicantDashboard(interaction.guild, app);
  await reviewMessage.edit(buildReviewCard(app));

  if (interaction.channel?.isTextBased()) {
    await interaction.channel.send({
      content: `### 📨 Application Submitted\n<@${app.applicantId}>, your **${positionLabel(app.position)}** application has been submitted to GWR Leadership. This channel now remains open for any follow-up questions or interview conversation.`
    });
  }

  return interaction.reply({
    content: `✅ **${app.id}** has been submitted successfully. GWR Leadership can now review it.`,
    ephemeral: true
  });
}

async function updateReviewStatus(interaction, app, newStatus) {
  const config = getGuildConfig(interaction.guildId);
  if (!isReviewer(interaction, config)) {
    return interaction.reply({ content: '❌ You do not have permission to review Official GWR Guild applications.', ephemeral: true });
  }
  if (!STATUS_META[newStatus]) {
    return interaction.reply({ content: '❌ Unknown application status.', ephemeral: true });
  }

  const previousStatus = app.status;
  app.status = newStatus;
  addHistory(app, interaction.user.id, 'status_changed', { from: previousStatus, to: newStatus });
  saveApplication(app);
  await refreshBoth(interaction, app);

  return interaction.reply({
    content: `✅ **${app.id}** moved from ${statusLabel(previousStatus)} to ${statusLabel(newStatus)}.`,
    ephemeral: true
  });
}

async function handleInteraction(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];

  if (action === 'start') return handleStart(interaction);
  if (action === 'learn') {
    return interaction.reply({ embeds: [buildLearnMoreEmbed()], ephemeral: true });
  }

  if (action === 'section') {
    return handleSectionButton(interaction, parts[2], parts[3]);
  }

  if (action === 'position') {
    const app = appFromInteraction(interaction, parts[2]);
    if (!app || !ownsApplication(interaction, app) || app.status !== 'draft') {
      return interaction.reply({ content: '❌ This application cannot be edited.', ephemeral: true });
    }
    app.position = interaction.values[0];
    addHistory(app, interaction.user.id, 'position_selected', { position: app.position });
    saveApplication(app);
    await refreshApplicantDashboard(interaction.guild, app);
    return interaction.showModal(modalForSection(app, getSection('profile')));
  }

  if (action === 'modal') {
    return handleModal(interaction, parts[2], parts[3]);
  }

  if (action === 'interests') {
    const app = appFromInteraction(interaction, parts[2]);
    if (!app || !ownsApplication(interaction, app) || app.status !== 'draft') {
      return interaction.reply({ content: '❌ This application cannot be edited.', ephemeral: true });
    }
    app.sections.about.interests = [...interaction.values];
    addHistory(app, interaction.user.id, 'interests_saved');
    saveApplication(app);
    await refreshApplicantDashboard(interaction.guild, app);
    return interaction.update({
      content: '✅ **About You** completed and saved.',
      components: [buildInterestsSelect(app)]
    });
  }

  if (action === 'leadership-choice') {
    const questionId = parts[2];
    const app = appFromInteraction(interaction, parts[3]);
    if (!app || !ownsApplication(interaction, app) || app.status !== 'draft') {
      return interaction.reply({ content: '❌ This application cannot be edited.', ephemeral: true });
    }
    app.sections.leadership[questionId] = interaction.values[0];
    addHistory(app, interaction.user.id, 'leadership_choice_saved', { question: questionId });
    saveApplication(app);
    await refreshApplicantDashboard(interaction.guild, app);
    return interaction.update({
      content: '✅ Leadership preference saved. Complete both dropdowns to finish this section.',
      components: buildLeadershipChoices(app)
    });
  }

  if (action === 'agree') {
    const app = appFromInteraction(interaction, parts[2]);
    if (!app || !ownsApplication(interaction, app) || app.status !== 'draft') {
      return interaction.reply({ content: '❌ This application cannot be edited.', ephemeral: true });
    }
    app.sections.final.agreed = true;
    app.sections.final.agreedAt = new Date().toISOString();
    addHistory(app, interaction.user.id, 'agreement_confirmed');
    saveApplication(app);
    await refreshApplicantDashboard(interaction.guild, app);
    return interaction.update({
      content: applicationComplete(app)
        ? '✅ Agreement confirmed. **Your application is now complete and ready to submit.**'
        : '✅ Agreement confirmed and saved.',
      ...buildAgreementPayload(app)
    });
  }

  if (action === 'review-own') {
    const app = appFromInteraction(interaction, parts[2]);
    if (!app || !ownsApplication(interaction, app)) {
      return interaction.reply({ content: '❌ This application does not belong to you.', ephemeral: true });
    }
    return interaction.reply(buildSectionPicker(app, 'own'));
  }

  if (action === 'view-section') {
    const mode = parts[2];
    const app = appFromInteraction(interaction, parts[3]);
    if (!app) return interaction.reply({ content: '❌ Application not found.', ephemeral: true });
    if (mode === 'own' && !ownsApplication(interaction, app)) {
      return interaction.reply({ content: '❌ This application does not belong to you.', ephemeral: true });
    }
    if (mode === 'staff' && !isReviewer(interaction)) {
      return interaction.reply({ content: '❌ You do not have permission to review this application.', ephemeral: true });
    }
    return sendSectionPrivately(interaction, app, interaction.values[0]);
  }

  if (action === 'submit') {
    const app = appFromInteraction(interaction, parts[2]);
    if (!app || !ownsApplication(interaction, app)) {
      return interaction.reply({ content: '❌ This application does not belong to you.', ephemeral: true });
    }
    return submitApplication(interaction, app);
  }

  if (action === 'withdraw') {
    const app = appFromInteraction(interaction, parts[2]);
    if (!app || !ownsApplication(interaction, app)) {
      return interaction.reply({ content: '❌ This application does not belong to you.', ephemeral: true });
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${APPLICATION_PREFIX}:withdraw-confirm:${app.id}`)
        .setLabel('Yes, withdraw application')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${APPLICATION_PREFIX}:withdraw-cancel:${app.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({
      content: `Are you sure you want to withdraw **${app.id}**? Your saved application will remain in the leadership archive, but you can start a new application later.`,
      components: [row],
      ephemeral: true
    });
  }

  if (action === 'withdraw-cancel') {
    return interaction.update({ content: 'Withdrawal cancelled.', components: [] });
  }

  if (action === 'withdraw-confirm') {
    const app = appFromInteraction(interaction, parts[2]);
    if (!app || !ownsApplication(interaction, app)) {
      return interaction.reply({ content: '❌ This application does not belong to you.', ephemeral: true });
    }
    const oldStatus = app.status;
    app.status = 'withdrawn';
    addHistory(app, interaction.user.id, 'withdrawn', { from: oldStatus, to: 'withdrawn' });
    saveApplication(app);
    releaseActiveApplication(app);
    await refreshBoth(interaction, app);
    return interaction.update({
      content: `📦 **${app.id}** has been withdrawn. You can start a new application from the public application panel if you choose to apply again later.`,
      components: []
    });
  }

  if (action === 'review') {
    const reviewAction = parts[2];
    const app = appFromInteraction(interaction, parts[3]);
    if (!app) return interaction.reply({ content: '❌ Application not found.', ephemeral: true });
    if (!isReviewer(interaction)) {
      return interaction.reply({ content: '❌ You do not have permission to review Official GWR Guild applications.', ephemeral: true });
    }

    if (reviewAction === 'read') {
      return interaction.reply(buildSectionPicker(app, 'staff'));
    }

    if (reviewAction === 'status') {
      return updateReviewStatus(interaction, app, interaction.values[0]);
    }

    if (reviewAction === 'note') {
      const modal = new ModalBuilder()
        .setCustomId(`${APPLICATION_PREFIX}:review-note-modal:${app.id}`)
        .setTitle('Add Private Reviewer Note')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('note')
              .setLabel('Private leadership note')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(4000)
              .setPlaceholder('Interview observations, concerns, strengths, follow-up questions...')
          )
        );
      return interaction.showModal(modal);
    }

    if (reviewAction === 'notes') {
      if (!app.notes?.length) {
        return interaction.reply({ content: '🔒 No private reviewer notes have been added yet.', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const blocks = app.notes.map((note, index) =>
        `**${index + 1}. <@${note.by}> — <t:${Math.floor(new Date(note.at).getTime() / 1000)}:f>**\n${note.text}`
      );
      const chunks = blocks.flatMap(block => splitDiscordText(block));
      await interaction.editReply({ content: `# 🔒 Private Reviewer Notes — ${app.id}\n${chunks.shift() || ''}` });
      for (const chunk of chunks) await interaction.followUp({ content: chunk, ephemeral: true });
      return;
    }

    if (reviewAction === 'close') {
      if (!CLOSABLE_STATUS_VALUES.includes(app.status)) {
        return interaction.reply({
          content: '❌ This application is still in an active review stage. Set it to **Future Candidate**, **Accepted**, **Unsuccessful**, or **Withdrawn** before closing it.',
          ephemeral: true
        });
      }
      if (app.closedAt) {
        return interaction.reply({ content: `🗃️ **${app.id}** is already closed.`, ephemeral: true });
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${APPLICATION_PREFIX}:review-close-confirm:${app.id}`)
          .setLabel('Yes, close & delete ticket')
          .setEmoji('🗃️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${APPLICATION_PREFIX}:review-close-cancel:${app.id}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({
        content: `⚠️ Close **${app.id}**? This will permanently delete the applicant ticket <#${app.channelId}>. The application answers, status, reviewer notes and history stay archived in Charles.`,
        components: [row],
        ephemeral: true
      });
    }
  }

  if (action === 'review-close-cancel') {
    return interaction.update({ content: 'Application close cancelled.', components: [] });
  }

  if (action === 'review-close-confirm') {
    const app = appFromInteraction(interaction, parts[2]);
    if (!app) return interaction.reply({ content: '❌ Application not found.', ephemeral: true });
    if (!isReviewer(interaction)) {
      return interaction.reply({ content: '❌ You do not have permission to close Official GWR Guild applications.', ephemeral: true });
    }
    if (!CLOSABLE_STATUS_VALUES.includes(app.status)) {
      return interaction.update({
        content: '❌ This application is no longer in a final/closable status, so Charles did not close the ticket.',
        components: []
      });
    }
    if (app.closedAt) {
      return interaction.update({ content: `🗃️ **${app.id}** is already closed.`, components: [] });
    }

    const ticketChannelId = app.channelId;
    const ticketChannel = ticketChannelId
      ? await interaction.guild.channels.fetch(ticketChannelId).catch(() => null)
      : null;

    app.closedAt = new Date().toISOString();
    app.closedBy = interaction.user.id;
    app.closedChannelId = ticketChannelId || null;
    app.channelId = null;
    app.dashboardMessageId = null;
    addHistory(app, interaction.user.id, 'application_closed', { channelId: ticketChannelId || null });
    saveApplication(app);
    if (app.status === 'future_candidate') {
      // A Future Candidate is archived for later consideration, so allow a fresh application in the future.
      releaseActiveApplication(app);
    }
    await refreshReviewCard(interaction.guild, app);

    await interaction.update({
      content: `🗃️ **${app.id}** has been closed. The application record remains archived in Charles${ticketChannel ? ' and the applicant ticket is being deleted' : '; the ticket was already unavailable'}.`,
      components: []
    });

    if (ticketChannel) {
      await ticketChannel.delete(`Official GWR Guild application ${app.id} closed by reviewer ${interaction.user.tag}`).catch(error => {
        console.error(`[OFFICIAL GUILD APPLICATIONS] Could not delete closed ticket ${ticketChannelId}:`, error);
      });
    }
    return;
  }

  if (action === 'review-note-modal') {
    const app = appFromInteraction(interaction, parts[2]);
    if (!app) return interaction.reply({ content: '❌ Application not found.', ephemeral: true });
    if (!isReviewer(interaction)) {
      return interaction.reply({ content: '❌ You do not have permission to review this application.', ephemeral: true });
    }
    const text = interaction.fields.getTextInputValue('note').trim();
    app.notes ||= [];
    app.notes.push({ by: interaction.user.id, at: new Date().toISOString(), text });
    addHistory(app, interaction.user.id, 'review_note_added');
    saveApplication(app);
    await refreshReviewCard(interaction.guild, app);
    return interaction.reply({ content: `🔒 Private reviewer note added to **${app.id}**.`, ephemeral: true });
  }
}

export default client => {
  if (!client.interactionRouter) {
    throw new Error('Official Guild Leadership Applications requires the interaction router.');
  }

  client.interactionRouter.register(
    'official-gwr-guild-leadership-applications',
    interaction => interaction.customId?.startsWith(`${APPLICATION_PREFIX}:`),
    handleInteraction
  );
};
