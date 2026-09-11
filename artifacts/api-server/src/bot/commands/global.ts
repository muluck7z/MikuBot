import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { errorContainer, infoContainer, v2EphemeralReply } from "../v2/index";

function detectLanguage(text: string): "pt" | "en" | null {
  const normalized = text.toLocaleLowerCase("pt-BR");
  const portuguese = /\b(que|não|uma|um|você|vocês|para|com|por|como|está|são|das|dos|isso|olá|obrigado|obrigada)\b/u;
  const english = /\b(the|and|you|your|this|that|with|from|what|when|where|how|is|are|hello|thanks|please)\b/u;
  const ptScore = (normalized.match(portuguese) ?? []).length;
  const enScore = (normalized.match(english) ?? []).length;
  if (ptScore === 0 && enScore === 0) return null;
  return ptScore >= enScore ? "pt" : "en";
}

async function translateText(text: string, source: "pt" | "en", target: "pt" | "en"): Promise<string> {
  const params = new URLSearchParams({ client: "gtx", sl: source, tl: target, dt: "t", q: text });
  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`);
  if (!response.ok) throw new Error(`Translation service returned ${response.status}`);
  const data = (await response.json()) as unknown[];
  const segments = Array.isArray(data[0]) ? data[0] : [];
  return segments
    .filter((segment): segment is unknown[] => Array.isArray(segment))
    .map((segment) => typeof segment[0] === "string" ? segment[0] : "")
    .join("")
    .trim();
}

export const globalCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("global")
    .setDescription("Traduz um texto entre português e inglês")
    .addStringOption((option) =>
      option
        .setName("texto")
        .setDescription("Texto em português ou inglês para traduzir")
        .setRequired(true)
        .setMaxLength(1900)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const text = interaction.options.getString("texto", true).trim();
    const source = detectLanguage(text);
    if (!source) {
      await interaction.reply(v2EphemeralReply([
        errorContainer("Não consegui identificar se o texto está em português ou inglês. Escreva uma frase mais completa."),
      ]));
      return;
    }

    const target = source === "pt" ? "en" : "pt";
    try {
      const translated = await translateText(text, source, target);
      if (!translated) throw new Error("Empty translation");
      const sourceLabel = source === "pt" ? "Português" : "Inglês";
      const targetLabel = target === "pt" ? "Português" : "Inglês";
      await interaction.reply(v2EphemeralReply([
        infoContainer({
          title: `🌐 Tradução ${sourceLabel} → ${targetLabel}`,
          description: [
            `**Texto original:**\n> ${text.replace(/```/g, "'''")}`,
            "",
            `**Texto traduzido:**\n> ${translated.replace(/```/g, "'''")}`,
          ].join("\n"),
        }),
      ]));
    } catch (err) {
      console.error("Translation error", err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply(v2EphemeralReply([
          errorContainer("Não foi possível traduzir agora. Tente novamente em alguns segundos."),
        ])).catch(() => null);
      }
    }
  },
};
