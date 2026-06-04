import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type TextChannel,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  Routes,
  ChannelType,
} from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, v2Reply, v2EphemeralReply, errorContainer, successContainer, COLORS } from "../v2/index";
import {
  sorteioStore,
  sorteioByChannel,
  lastEncerradoByChannel,
  type SorteioEntry,
} from "../sorteioStore";
import { logger } from "../../lib/logger";

// ─── Build da mensagem do sorteio ─────────────────────────────────────────────

export function buildSorteioComponents(
  entry: SorteioEntry,
  vencedores?: string[]
): { container: ContainerBuilder; actionRow: ActionRowBuilder<ButtonBuilder> } {
  const encerrado = entry.encerrado;
  const count = entry.participantes.size;
  const endTs = Math.floor(entry.endsAt / 1000);

  let bodyLines: string[];

  if (encerrado && vencedores !== undefined) {
    if (vencedores.length === 0) {
      bodyLines = [
        `🏆 **Prêmio:** ${entry.premio}`,
        `👥 **Ganhadores:** ${entry.numGanhadores}`,
        `🎟️ **Participantes:** ${count}`,
        "",
        "❌ Nenhum participante. O sorteio foi encerrado sem vencedor.",
      ];
    } else {
      bodyLines = [
        `🏆 **Prêmio:** ${entry.premio}`,
        `👥 **Ganhadores:** ${entry.numGanhadores}`,
        `🎟️ **Participantes:** ${count}`,
        "",
        `🥳 **${vencedores.length === 1 ? "Vencedor" : "Vencedores"}:**`,
        vencedores.map((id) => `<@${id}>`).join("\n"),
      ];
    }
  } else {
    bodyLines = [
      `🏆 **Prêmio:** ${entry.premio}`,
      `👥 **Ganhadores:** ${entry.numGanhadores}`,
      `⏰ **Termina:** <t:${endTs}:R>`,
      `🎟️ **Participantes:** ${count}`,
      "",
      "Clique no botão abaixo para participar!",
    ];
  }

  const container = new ContainerBuilder()
    .setAccentColor(encerrado ? COLORS.danger : COLORS.warning)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 🎉 Sorteio${encerrado ? " — Encerrado" : ""}`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(bodyLines.join("\n"))
    );

  // customId usa channelId para poder fazer lookup sem precisar do messageId no botão
  const btn = new ButtonBuilder()
    .setCustomId(`sorteio:entrar:${entry.channelId}`)
    .setLabel("🎉 Participar!")
    .setStyle(ButtonStyle.Success)
    .setDisabled(encerrado);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

  return { container, actionRow };
}

// ─── Encerrar sorteio (timer automático e subcomando /sorteio encerrar) ───────

export async function encerrarSorteio(
  entry: SorteioEntry,
  channel: TextChannel
): Promise<void> {
  if (entry.encerrado) return;
  entry.encerrado = true;
  clearTimeout(entry.timer);

  // Sortear vencedores de forma aleatória
  const participantesArr = Array.from(entry.participantes);
  const shuffled = participantesArr.sort(() => Math.random() - 0.5);
  const vencedores = shuffled.slice(0, entry.numGanhadores);

  // Editar mensagem original via REST para preservar a flag IsComponentsV2
  const { container, actionRow } = buildSorteioComponents(entry, vencedores);
  await channel.client.rest
    .patch(Routes.channelMessage(entry.channelId, entry.messageId), {
      body: {
        components: [container.toJSON(), actionRow.toJSON()],
        flags: MessageFlags.IsComponentsV2,
      },
    })
    .catch((err) => logger.error({ err }, "Falha ao editar mensagem do sorteio"));

  // Anúncio dos vencedores no canal
  if (vencedores.length > 0) {
    const mencoes = vencedores.map((id) => `<@${id}>`).join(", ");
    await channel.client.rest.post(Routes.channelMessages(channel.id), {
      body: {
        content: mencoes,
        allowed_mentions: { users: vencedores },
        components: [
          infoContainer({
            title: "🎊 Temos vencedor(es)!",
            description: [
              `**Prêmio:** ${entry.premio}`,
              "",
              `**${vencedores.length === 1 ? "Vencedor" : "Vencedores"}:** ${mencoes}`,
              "",
              "Parabéns! Entre em contato com a equipe para resgatar seu prêmio. 🎁",
            ].join("\n"),
          }).toJSON(),
        ],
        flags: MessageFlags.IsComponentsV2,
      },
    }).catch((err) => logger.error({ err }, "Falha ao anunciar vencedores"));
  } else {
    await channel.client.rest.post(Routes.channelMessages(channel.id), {
      body: {
        components: [
          infoContainer({
            title: "😔 Sorteio Encerrado",
            description: `O sorteio do prêmio **${entry.premio}** foi encerrado sem participantes.`,
          }).toJSON(),
        ],
        flags: MessageFlags.IsComponentsV2,
      },
    }).catch((err) => logger.error({ err }, "Falha ao anunciar sem vencedores"));
  }

  // Mover para histórico; remover do ativo
  sorteioByChannel.delete(entry.channelId);
  lastEncerradoByChannel.set(entry.channelId, entry.messageId);

  logger.info({ premio: entry.premio, vencedores, canal: entry.channelId }, "Sorteio encerrado");
}

// ─── Comando ──────────────────────────────────────────────────────────────────

export const sorteioCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("sorteio")
    .setDescription("Gerencia sorteios no servidor")
    .addSubcommand((sub) =>
      sub
        .setName("criar")
        .setDescription("Cria um novo sorteio em um canal")
        .addStringOption((opt) =>
          opt.setName("premio").setDescription("O que será sorteado").setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("duracao")
            .setDescription("Duração do sorteio")
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption((opt) =>
          opt
            .setName("unidade")
            .setDescription("Unidade de tempo")
            .setRequired(true)
            .addChoices(
              { name: "Minutos", value: "minutos" },
              { name: "Horas", value: "horas" },
              { name: "Dias", value: "dias" }
            )
        )
        .addIntegerOption((opt) =>
          opt
            .setName("ganhadores")
            .setDescription("Número de ganhadores")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10)
        )
        .addChannelOption((opt) =>
          opt
            .setName("canal")
            .setDescription("Canal onde o sorteio será postado")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("encerrar")
        .setDescription("Encerra antecipadamente o sorteio ativo em um canal")
        .addChannelOption((opt) =>
          opt
            .setName("canal")
            .setDescription("Canal do sorteio ativo")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("resorteiar")
        .setDescription("Re-sorteia o último sorteio encerrado com os mesmos participantes")
        .addChannelOption((opt) =>
          opt
            .setName("canal")
            .setDescription("Canal do sorteio original")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild!;

    // ── /sorteio criar ────────────────────────────────────────────────────────
    if (sub === "criar") {
      const premio   = interaction.options.getString("premio", true);
      const duracao  = interaction.options.getInteger("duracao", true);
      const unidade  = interaction.options.getString("unidade", true);
      const numGanhadores = interaction.options.getInteger("ganhadores", true);
      const canal    = interaction.options.getChannel("canal", true) as TextChannel;

      // Verificar se já existe sorteio ativo naquele canal
      if (sorteioByChannel.has(canal.id)) {
        await interaction.reply(
          v2EphemeralReply([errorContainer(`Já existe um sorteio ativo em <#${canal.id}>. Encerre-o primeiro com \`/sorteio encerrar\`.`)])
        );
        return;
      }

      // Calcular duração em ms
      const mult = unidade === "minutos" ? 60_000 : unidade === "horas" ? 3_600_000 : 86_400_000;
      const durationMs = duracao * mult;
      const endsAt = Date.now() + durationMs;

      // Entrada temporária para montar a mensagem (sem timer/messageId ainda)
      const entryProvisoria: SorteioEntry = {
        premio,
        channelId: canal.id,
        messageId: "",
        guildId: guild.id,
        numGanhadores,
        endsAt,
        participantes: new Set(),
        criadorId: interaction.user.id,
        timer: null!,
        encerrado: false,
      };

      const { container, actionRow } = buildSorteioComponents(entryProvisoria);

      // Enviar via REST para garantir a flag IsComponentsV2
      let messageId: string;
      try {
        const raw = await canal.client.rest.post(
          Routes.channelMessages(canal.id),
          {
            body: {
              components: [container.toJSON(), actionRow.toJSON()],
              flags: MessageFlags.IsComponentsV2,
            },
          }
        ) as { id: string };
        messageId = raw.id;
      } catch (err) {
        logger.error({ err }, "Falha ao enviar mensagem do sorteio");
        await interaction.reply(
          v2EphemeralReply([errorContainer(`Não consegui enviar a mensagem em <#${canal.id}>. Verifique minhas permissões.`)])
        );
        return;
      }

      // Criar a entrada real com o messageId correto
      const entry: SorteioEntry = {
        ...entryProvisoria,
        messageId,
        timer: setTimeout(async () => {
          const ch = guild.channels.cache.get(canal.id) as TextChannel | undefined;
          if (!ch) return;
          await encerrarSorteio(entry, ch).catch((err) =>
            logger.error({ err }, "Erro ao encerrar sorteio automático")
          );
        }, durationMs),
      };

      sorteioStore.set(messageId, entry);
      sorteioByChannel.set(canal.id, messageId);

      const labelUnidade = unidade === "minutos"
        ? `${duracao} minuto${duracao > 1 ? "s" : ""}`
        : unidade === "horas"
          ? `${duracao} hora${duracao > 1 ? "s" : ""}`
          : `${duracao} dia${duracao > 1 ? "s" : ""}`;

      await interaction.reply(
        v2EphemeralReply([
          successContainer(
            "Sorteio Criado!",
            [
              `**Prêmio:** ${premio}`,
              `**Duração:** ${labelUnidade}`,
              `**Ganhadores:** ${numGanhadores}`,
              `**Canal:** <#${canal.id}>`,
            ].join("\n")
          ),
        ])
      );

      logger.info({ premio, durationMs, numGanhadores, canal: canal.id }, "Sorteio criado");
    }

    // ── /sorteio encerrar ─────────────────────────────────────────────────────
    else if (sub === "encerrar") {
      const canal = interaction.options.getChannel("canal", true) as TextChannel;
      const messageId = sorteioByChannel.get(canal.id);

      if (!messageId) {
        await interaction.reply(
          v2EphemeralReply([errorContainer(`Não há sorteio ativo em <#${canal.id}>.`)])
        );
        return;
      }

      const entry = sorteioStore.get(messageId);
      if (!entry || entry.encerrado) {
        await interaction.reply(
          v2EphemeralReply([errorContainer(`Não há sorteio ativo em <#${canal.id}>.`)])
        );
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      await encerrarSorteio(entry, canal);

      await interaction.editReply({
        ...v2EphemeralReply([successContainer("Sorteio Encerrado", `O sorteio em <#${canal.id}> foi encerrado manualmente.`)]),
      });
    }

    // ── /sorteio resorteiar ───────────────────────────────────────────────────
    else if (sub === "resorteiar") {
      const canal = interaction.options.getChannel("canal", true) as TextChannel;
      const lastId = lastEncerradoByChannel.get(canal.id);

      if (!lastId) {
        await interaction.reply(
          v2EphemeralReply([errorContainer(`Nenhum sorteio encerrado encontrado para <#${canal.id}>.`)])
        );
        return;
      }

      const lastEntry = sorteioStore.get(lastId);
      if (!lastEntry) {
        await interaction.reply(
          v2EphemeralReply([errorContainer(`Dados do último sorteio em <#${canal.id}> não encontrados.`)])
        );
        return;
      }

      if (lastEntry.participantes.size === 0) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("O último sorteio não teve participantes. Impossível resortear.")])
        );
        return;
      }

      // Re-sortear entre os mesmos participantes
      const participantesArr = Array.from(lastEntry.participantes);
      const shuffled = participantesArr.sort(() => Math.random() - 0.5);
      const vencedores = shuffled.slice(0, lastEntry.numGanhadores);
      const mencoes = vencedores.map((id) => `<@${id}>`).join(", ");

      await interaction.deferReply({ ephemeral: true });

      await canal.client.rest.post(Routes.channelMessages(canal.id), {
        body: {
          content: mencoes,
          allowed_mentions: { users: vencedores },
          components: [
            infoContainer({
              title: "🎊 Resorteio!",
              description: [
                `**Prêmio:** ${lastEntry.premio}`,
                `**Participantes originais:** ${participantesArr.length}`,
                "",
                `**${vencedores.length === 1 ? "Novo vencedor" : "Novos vencedores"}:** ${mencoes}`,
                "",
                "Parabéns! Entre em contato com a equipe para resgatar seu prêmio. 🎁",
              ].join("\n"),
            }).toJSON(),
          ],
          flags: MessageFlags.IsComponentsV2,
        },
      }).catch((err) => logger.error({ err }, "Falha ao postar resorteio"));

      await interaction.editReply({
        ...v2EphemeralReply([successContainer("Resorteio Realizado!", `Novos vencedores anunciados em <#${canal.id}>.`)]),
      });

      logger.info({ premio: lastEntry.premio, vencedores, canal: canal.id }, "Resorteio realizado");
    }
  },
};
