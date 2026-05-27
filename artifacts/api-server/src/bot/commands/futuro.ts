import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, v2Reply } from "../v2/index";

// ─── Profecias ────────────────────────────────────────────────────────────────

const PROFECIAS_PROXIMAS: string[] = [
  "Uma quantia inesperada de dinheiro vai cair no seu colo em breve.",
  "Você vai passar por uma fase de vacas magras, mas vai conseguir superar.",
  "Uma boa notícia está chegando e vai te pegar completamente de surpresa.",
  "Alguém próximo vai te decepcionar de um jeito que você não vai esquecer tão cedo.",
  "Uma oportunidade única vai aparecer na sua frente — não hesite dessa vez.",
  "A sorte está do seu lado nas próximas semanas. Aproveite enquanto dura.",
  "Uma briga desnecessária vai custar algo que você não vai conseguir recuperar.",
  "Você vai receber uma notícia que vai virar todos os seus planos de cabeça pra baixo.",
  "Um encontro inesperado vai abrir portas que estavam fechadas há muito tempo.",
  "Dinheiro vai entrar, mas vai sair mais rápido do que você imagina.",
  "Algo muito bom está prestes a acontecer — confie no processo.",
  "Uma fase difícil está chegando, mas é passageira. Segura firme.",
  "Você vai tomar uma decisão impulsiva que vai dar muito certo por acidente.",
  "Um período de sorte está logo ali. Mas depois vem a conta.",
  "Alguém vai aparecer na sua vida e bagunçar tudo — pra melhor.",
  "Prepare o bolso: uma despesa grande e inesperada está a caminho.",
  "Uma notícia ruim que parece o fim vai ser o começo de algo melhor.",
  "Você vai se arriscar em algo novo e vai dar certo dessa vez.",
  "Um ciclo está se encerrando. O próximo vai ser muito melhor.",
  "Cuidado com quem você está confiando agora. Nem todo mundo quer seu bem.",
  "Uma conquista pequena vai te dar um ânimo que você não sentia há tempos.",
  "Algo que você plantou há muito tempo está prestes a florescer.",
  "Você vai passar por aperto financeiro breve, mas sai mais forte do outro lado.",
  "Uma traição próxima vai te ensinar a blindar melhor seu círculo.",
  "Um golpe de sorte vai chegar sem aviso. Esteja pronto(a) pra aproveitar.",
];

const PROFECIAS_DISTANTES: string[] = [
  "Você vai acumular uma fortuna que vai fazer sua família chorar de alegria.",
  "Vai conhecer a miséria de verdade e aprender lições que dinheiro nenhum ensina.",
  "Um amor avassalador vai chegar quando você menos esperar e mudar tudo ao redor.",
  "Vai perder pessoas queridas e descobrir, na dor, quem realmente estava do seu lado.",
  "A fama vai te encontrar mesmo que você não esteja procurando por ela.",
  "Vai construir algo grandioso do zero, com as próprias mãos, sem ajuda de ninguém.",
  "Um longo período de escuridão vai anteceder o maior momento da sua vida.",
  "Você vai se tornar exatamente o oposto do que planejou ser — e vai amar isso.",
  "Riqueza e miséria vão se revezar na sua vida como estações do ano.",
  "Vai alcançar tudo que sempre sonhou, mas descobrir que queria outra coisa.",
  "O dinheiro vai aparecer tarde, mas quando chegar, vai ser de uma vez.",
  "Uma falência silenciosa vai te tirar tudo — e te ensinar o valor do que realmente importa.",
  "Você vai ajudar alguém que um dia vai te salvar de volta quando você menos esperar.",
  "Seu nome vai ser lembrado por algo que você ainda nem começou a fazer.",
  "Vai passar anos lutando por algo que vai desmoronar em um segundo — e recomeçar ainda maior.",
  "Uma herança inesperada vai mudar completamente os seus planos de vida.",
  "O amor da sua vida vai aparecer no momento mais inadequado possível.",
  "Você vai ser rico(a) por um tempo, depois pobre, depois rico(a) de novo — aproveita o ciclo.",
  "Uma doença ou perda vai redesenhar completamente o que você valoriza na vida.",
  "Vai trabalhar duro por anos e colher uma recompensa que vai surpreender até você mesmo(a).",
  "Seu maior inimigo vai ser a fonte do seu maior aprendizado.",
  "Vai sair de onde está e recomeçar em outro lugar — e vai ser a melhor decisão da sua vida.",
  "Uma escolha que você ainda vai fazer vai definir os próximos 20 anos.",
  "Você vai conhecer a abundância e o vazio — e descobrir qual dos dois te traz mais paz.",
  "O fracasso mais humilhante da sua vida vai ser o trampolim para sua maior vitória.",
];

// ─── Utils ────────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// ─── Command ─────────────────────────────────────────────────────────────────

export const futuroCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("futuro")
    .setDescription("As estrelas revelam uma profecia sobre o futuro de alguém 🔮")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("De quem você quer ver o futuro?").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser("usuario", true);

    const isProximo = Math.random() < 0.5;
    const profecia  = isProximo ? pick(PROFECIAS_PROXIMAS) : pick(PROFECIAS_DISTANTES);
    const label     = isProximo ? "🌙 Futuro Próximo" : "⭐ Futuro Distante";

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: `🔮 Profecia — ${user.displayName}`,
          description: [
            `**${label}**`,
            "",
            `*${profecia}*`,
          ].join("\n"),
          avatarUrl: user.displayAvatarURL({ size: 256 }),
        }),
      ])
    );
  },
};
