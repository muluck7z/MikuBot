import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, v2Reply } from "../v2/index";

const CAUSAS: string[] = [
  // ── Leves ────────────────────────────────────────────────────────────────
  "morreu de velhice em paz, dormindo tranquilamente em casa",
  "sucumbiu a uma gripe ignorada por semanas sem procurar médico",
  "morreu de exaustão após décadas de trabalho sem descanso",
  "parada cardíaca silenciosa durante uma caminhada no parque",
  "morreu em sono após uma vida longa ao lado da família",
  "faleceu de complicações renais que nunca foram tratadas a tempo",
  "foi vencido(a) por um câncer descoberto tarde demais",
  "morreu de pneumonia após passar frio sem se agasalhar",
  "coração parou durante o sono sem nenhum aviso prévio",
  "morreu de tristeza após perder alguém que amava muito",

  // ── Normais ───────────────────────────────────────────────────────────────
  "acidente de carro na madrugada em rodovia federal sem iluminação",
  "afogamento em rio com correnteza forte durante tempestade",
  "queda de moto a alta velocidade sem capacete na cabeça",
  "infarto fulminante durante uma discussão acalorada",
  "overdose acidental após misturar remédios errados",
  "atropelado(a) por caminhão ao atravessar fora da faixa",
  "queda do terceiro andar enquanto consertava o telhado sozinho(a)",
  "morreu afogado(a) numa piscina sem ninguém por perto",
  "choque elétrico ao mexer na fiação sem desligar o disjuntor",
  "morreu em cirurgia de emergência após acidente de trabalho",
  "intoxicação alimentar grave em viagem sem acesso a hospital",
  "ataque de animal selvagem durante trilha sem guia",
  "morreu baleado(a) em assalto que deu errado",
  "colisão frontal em ultrapassagem proibida numa curva fechada",
  "morreu afogado(a) ao cair de barco sem colete salva-vidas",

  // ── Brutais ───────────────────────────────────────────────────────────────
  "esfaqueado(a) 23 vezes em uma briga de rua que começou por nada",
  "decapitado(a) em acidente industrial com máquina de corte pesada",
  "queimado(a) vivo(a) dentro de um veículo que pegou fogo após batida",
  "alvejado(a) por 4 tiros à queima-roupa sem chance de reação",
  "despedaçado(a) ao ser arrastado(a) por trem em alta velocidade",
  "esmagado(a) por estrutura metálica que desabou no trabalho",
  "devorado(a) por cães ferais numa área abandonada à noite",
  "dilacerado(a) por explosão de botijão de gás num espaço fechado",
  "morreu carbonizado(a) em incêndio criminoso sem saída possível",
  "corpo encontrado dias depois de queda em precipício durante trilha",
  "triturado(a) por maquinário agrícola enquanto trabalhava no campo",
  "morreu afogado(a) com as mãos amarradas jogado(a) em lago",
  "execução sumária por dívida que não conseguiu pagar a tempo",
  "morreu após ser arrastado(a) por enchente e bater contra estrutura de concreto",
  "corpo irreconhecível após explosão de carregamento de combustível",
];

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const morteCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("morte")
    .setDescription("Descubra quando e como alguém vai morrer")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Quem vai morrer?").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser("usuario", true);

    const dia   = rand(1, 28);
    const mes   = pick(MESES);
    const ano   = rand(new Date().getFullYear() + 1, new Date().getFullYear() + 85);
    const causa = pick(CAUSAS);

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: `<:_i:1530809430810296476>  Previsão de Morte - ${user.displayName}`,
          description: [
            `Após uma análise profunda do universo e das suas más decisões de vida, chegamos a uma conclusão...`,
            "",
            `<:35424whitetimer:1530809361612669128> **Data:** ${dia} de ${mes} de ${ano}`,
            `<:1729helldivers:1530809309535928382> **Causa:** ${causa}.`,
          ].join("\n"),
          avatarUrl: user.displayAvatarURL({ size: 256 }),
        }),
      ])
    );
  },
};
