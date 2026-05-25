import {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";

export { MessageFlags };

export const IS_COMPONENTS_V2 = MessageFlags.IsComponentsV2;

export const EMOJIS = {
  positive: "<a:emoji_94:1508159306565156984>",
  negative: "<a:emoji_1838:1508159758685962452>",
  mod:      "<a:zfeliz:1508160009295630388>",
} as const;

// ─── Primitives ───────────────────────────────────────────────────────────────

function textDisplay(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

function thumb(url: string): ThumbnailBuilder {
  return new ThumbnailBuilder().setURL(url);
}

function divider(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

// ─── Core layout builder ──────────────────────────────────────────────────────
//
// Layout:
//   Container (accent_color)
//     ├── Section  →  TextDisplay("# Título")  +  Thumbnail (avatar)
//     ├── Separator
//     └── TextDisplay(body)
//
// When there is no avatarUrl, the Section is replaced by a plain TextDisplay.

function buildContainer(options: {
  title: string;
  body: string;
  avatarUrl?: string | null;
  accentColor?: number;
}): ContainerBuilder {
  const { title, body, avatarUrl, accentColor } = options;
  const c = new ContainerBuilder();
  if (accentColor !== undefined) c.setAccentColor(accentColor);

  if (avatarUrl) {
    c.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(textDisplay(`# ${title}`))
        .setThumbnailAccessory(thumb(avatarUrl))
    );
  } else {
    c.addTextDisplayComponents(textDisplay(`# ${title}`));
  }

  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(textDisplay(body));

  return c;
}

// ─── Mod container ────────────────────────────────────────────────────────────

export function modContainer(options: {
  action: string;
  targetTag: string;
  targetId: string;
  moderatorTag: string;
  reason: string;
  avatarUrl?: string | null;
  accentColor?: number;
  extra?: string;
}): ContainerBuilder {
  const { action, targetTag, targetId, moderatorTag, reason, avatarUrl, accentColor = COLORS.mod, extra } = options;

  const lines = [
    `**Usuário:** ${targetTag} (\`${targetId}\`)`,
    `**Moderador:** ${moderatorTag}`,
    `**Motivo:** ${reason}`,
    ...(extra ? [`\n${extra}`] : []),
  ];

  return buildContainer({ title: action, body: lines.join("\n"), avatarUrl, accentColor });
}

// ─── Info / success / error containers ───────────────────────────────────────

export function infoContainer(options: {
  title: string;
  description: string;
  avatarUrl?: string | null;
  accentColor?: number;
}): ContainerBuilder {
  return buildContainer({
    title: options.title,
    body: options.description,
    avatarUrl: options.avatarUrl,
    accentColor: options.accentColor ?? COLORS.primary,
  });
}

export function successContainer(title: string, description: string): ContainerBuilder {
  return buildContainer({ title: `${EMOJIS.positive} ${title}`, body: description, accentColor: COLORS.success });
}

export function errorContainer(description: string): ContainerBuilder {
  return buildContainer({ title: `${EMOJIS.negative} Erro`, body: description, accentColor: COLORS.danger });
}

export function warnContainer(title: string, description: string): ContainerBuilder {
  return buildContainer({ title: `${EMOJIS.negative} ${title}`, body: description, accentColor: COLORS.warning });
}

// ─── Reply helpers ─────────────────────────────────────────────────────────────

export function v2Reply(
  containers: ContainerBuilder[],
  options?: { ephemeral?: boolean; buttons?: ActionRowBuilder<ButtonBuilder>[] }
) {
  return {
    components: [...containers, ...(options?.buttons ?? [])],
    flags: options?.ephemeral
      ? (MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)
      : MessageFlags.IsComponentsV2,
  };
}

export function v2EphemeralReply(containers: ContainerBuilder[]) {
  return v2Reply(containers, { ephemeral: true });
}

// ─── Buttons ───────────────────────────────────────────────────────────────────

export function primaryButton(customId: string, label: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Primary);
}

export function dangerButton(customId: string, label: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Danger);
}

export function successButton(customId: string, label: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Success);
}

export function secondaryButton(customId: string, label: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Secondary);
}

export function row(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

// ─── Colors ───────────────────────────────────────────────────────────────────

export const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  danger:  0xed4245,
  warning: 0xfee75c,
  mod:     0xff6b35,
  ban:     0xed4245,
  kick:    0xff9500,
  mute:    0xfee75c,
  unban:   0x57f287,
  unmute:  0x57f287,
  lock:    0xed4245,
  unlock:  0x57f287,
  ticket:  0x5865f2,
  info:    0x5865f2,
} as const;
