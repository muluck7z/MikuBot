import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, v2Reply } from "../v2/index";

const MORTES_LEVES: string[] = [
  // ── Sortudos: raros, mas possíveis ────────────────────────────────────────
  "morreu de velhice em paz, dormindo tranquilamente em casa",
  "partiu dormindo, depois de uma vida longa e estranhamente tranquila",
  "teve uma parada cardíaca silenciosa durante uma caminhada no parque",
  "morreu em casa, cercado(a) pela família e sem perceber que era o fim",
  "apagou durante o sono após uma vida inteira escapando do perigo por pura sorte",
  "foi vencido(a) pela idade, em uma cama confortável e sem nenhuma reviravolta dramática",
];

const MORTES_NORMAIS: string[] = [
  // ── Perigosas: sem sorte, sem glamour ─────────────────────────────────────
  "acidente de carro na madrugada em rodovia federal sem iluminação",
  "afogamento em um rio de correnteza forte durante uma tempestade",
  "queda de moto em alta velocidade numa estrada molhada",
  "atropelado(a) ao atravessar a rua olhando para o celular pela última vez",
  "queda do terceiro andar enquanto tentava consertar o telhado sozinho(a)",
  "choque elétrico ao mexer em uma instalação antiga sem desligar o disjuntor",
  "morreu em uma cirurgia de emergência depois de um acidente de trabalho",
  "ataque de animal selvagem durante uma trilha em área proibida",
  "ficou preso(a) em um elevador durante um incêndio no prédio",
  "soterrado(a) após ignorar os avisos de deslizamento durante a chuva",
  "atingido(a) por um raio enquanto fazia questão de ficar no ponto mais alto",
  "colisão frontal em ultrapassagem proibida numa curva fechada",
  "morreu afogado(a) ao cair de barco sem colete salva-vidas",
];

const MORTES_BRUTAIS: string[] = [
  // ── Pesadas: a grande maioria dos resultados ──────────────────────────────
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
  "soterrado(a) sob os escombros de um prédio que desabou sem aviso",
  "atingido(a) por uma explosão no momento exato em que abriu a porta errada",
  "arrastado(a) para dentro de uma máquina industrial depois de ignorar o alarme",
  "morreu preso(a) em um incêndio, quando a única saída desabou diante dos seus olhos",
  "caiu de uma ponte durante uma perseguição e desapareceu na correnteza",
  "atingido(a) por destroços de uma estrutura que caiu sobre a multidão",
  "morreu em um acidente de trem tão violento que ninguém conseguiu reconhecer o vagão",
  "encontrado(a) tarde demais depois de uma noite inteira perdido(a) em uma área inóspita",
];

// A surpresa continua existindo, mas mortes leves são exceção:
// 15% tranquilas, 30% perigosas e 55% realmente pesadas.
function pickCausa(): string {
  const chance = Math.random();
  if (chance < 0.15) return pick(MORTES_LEVES);
  if (chance < 0.45) return pick(MORTES_NORMAIS);
  return pick(MORTES_BRUTAIS);
}

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

    const dia = rand(1, 28);
    const mes = pick(MESES);
    const ano = rand(new Date().getFullYear() + 1, new Date().getFullYear() + 85);
    const hora = rand(0, 23);
    const minuto = rand(0, 59);
    const segundo = rand(0, 59);
    const causa = pickCausa();

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: `<:_i:1530809430810296476>  Previsão de Morte - ${user.displayName}`,
          description: [
            `Após uma análise profunda do universo e das suas más decisões de vida, chegamos a uma conclusão...`,
            "",
            `<:35424whitetimer:1530809361612669128> **Data:** ${dia} de ${mes} de ${ano}, às ${String(hora).padStart(2, "0")}h ${String(minuto).padStart(2, "0")}min ${String(segundo).padStart(2, "0")}s`,
            `<:1729helldivers:1530809309535928382> **Causa:** ${causa}.`,
          ].join("\n"),
          avatarUrl: user.displayAvatarURL({ size: 256 }),
        }),
      ])
    );
  },
};
