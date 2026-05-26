import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, v2Reply } from "../v2/index";

const CAUSAS: string[] = [
  // ── Absurdas / engraçadas ─────────────────────────────────────────────────
  "afogado(a) em uma piscina de maionese durante um piquenique",
  "engasgado(a) com um chiclete de melancia na fila do mercado",
  "atropelado(a) por um carrinho de compras descontrolado no estacionamento",
  "morreu de vergonha alheia assistindo ao discurso do seu chefe",
  "picado(a) 1.347 vezes por abelhas africanizadas por derrubar uma colmeia",
  "atingido(a) por uma galinha voadora a 120km/h na BR-101",
  "sufocado(a) por um travesseiro extremamente confortável",
  "envenenado(a) por brócolis mal lavado numa marmita fit",
  "chocado(a) ao ver a conta de luz do mês de janeiro",
  "caiu de uma escada tentando pegar o celular que caiu atrás do armário",
  "engoliu um Lego às 3 da manhã no escuro e não sobreviveu",
  "morreu tentando terminar todos os jogos do backlog do Steam",
  "fulminado(a) por um raio enquanto tirava selfie na tempestade",
  "morreu ao tentar ler todos os Termos de Serviço do Google até o fim",
  "esmagado(a) por uma avalanche de almofadas de decoração",
  "mordido(a) por um pato raivoso durante uma visita ao parque",
  "morreu ao pisar num Lego descalço às 4 da manhã (parada cardíaca)",
  "atropelado(a) por uma manada de tartarugas em fúria coletiva",
  "morreu de tédio numa reunião de 6 horas sem coffee break",
  "sucumbiu ao abrir 47 abas no navegador e o computador explodiu",
  "morreu ao tentar montar um móvel da IKEA sem as instruções",
  "envenenado(a) pela própria receita de bolo que tentou fazer do zero",
  "engolido(a) por um bueiro enquanto olhava o celular andando na calçada",
  "morreu ao comer um salgado suspeito de uma festa de aniversário",
  "picado(a) por um escorpião que estava dentro do sapato",
  "morreu de susto ao ver a própria foto de perfil antiga",
  "atropelado(a) por um patinete elétrico a 300km/h na ciclofaixa",
  "morreu ao ver o preço de um apartamento de 30m² em São Paulo",
  "afogado(a) num copo d'água por engasgar de rir de um meme",
  "morreu tentando explicar como fazer um PIX pra avó pela 13ª vez",

  // ── Dramáticas / exageradas ───────────────────────────────────────────────
  "devorado(a) por uma manada de hamsters raivosos escapados do pet shop",
  "esmagado(a) por uma chuva de pianos caindo do 12º andar",
  "sugado(a) por um aspirador industrial durante a faxina de fim de ano",
  "teletransportado(a) acidentalmente para dentro de uma rocha sólida",
  "desintegrado(a) por um micro-ondas industrial de uso militar",
  "lançado(a) para a órbita terrestre por um trampolim defeituoso",
  "morreu ao tentar andar de skate pela primeira vez aos 40 anos",
  "decapitado(a) por um frisbee mal lançado no churrasco de domingo",
  "esmagado(a) por uma pilha de pizzas congeladas no freezer do mercado",
  "engolido(a) por uma baleia que não gostou do repertório musical",
  "virou pó ao tentar abrir uma garrafa de refrigerante gelada demais",
  "morreu ao ser atingido(a) por um meteorito do tamanho de um grão de arroz",
  "sugado(a) para dentro de um buraco negro que apareceu no banheiro",
  "esmagado(a) pelo próprio ego inflado que entrou em colapso gravitacional",
  "tragado(a) por areias movediças no meio de um shopping",

  // ── Brutais / sangrentas ──────────────────────────────────────────────────
  "triturado(a) por uma máquina de fazer sorvete com defeito na engrenagem",
  "partido(a) ao meio por um elevador que não esperou entrar direito",
  "decapitado(a) por um drone delivery descontrolado com fio de pipa",
  "derretido(a) por lava de um vulcão que acordou de mau humor",
  "comido(a) vivo(a) por pombos urbanos que estavam com muita fome",
  "explodido(a) internamente por comer um burrito com pimenta carolina reaper",
  "consumido(a) por formigas de fogo durante uma sesta no gramado",
  "esmagado(a) por um cubo de carros numa oficina de desmanche",
  "desmembrado(a) por um ventilador de teto de alta potência desparafusado",
  "perfurado(a) por um espeto de churrasco disparado da churrasqueira",
  "dilacerado(a) por um liquidificador sem tampa funcionando a 10.000 RPM",
  "espalhado(a) pelo teto depois de sentar numa cadeira de escritório explodida",
  "moído(a) por uma máquina industrial de fazer carne ao tentar limpar por dentro",
  "esmigalhado(a) por uma prensa hidráulica de 500 toneladas no trabalho",
  "devorado(a) pela própria sombra que ganhou consciência e sede de vingança",
  "pulverizado(a) por uma centrífuga industrial que atingiu velocidade orbital",
  "partido(a) em 7 pedaços por uma foice enferrujada caída de um helicóptero",
  "desintegrado(a) célula por célula por uma impressora 3D que aprendeu IA",
  "carbonizado(a) por um raio caindo dentro do quarto com janela fechada",
  "implodido(a) pelo vácuo criado por abrir uma lata de sardinha velha demais",

  // ── Sobrenaturais / épicas ────────────────────────────────────────────────
  "amaldiçoado(a) por uma bruxa por não passar uma corrente no WhatsApp",
  "consumido(a) pela própria existência após questionar o sentido da vida",
  "levado(a) pelo demônio por ter escutado 'Despacito' 8.000 vezes seguidas",
  "morreu ao negar um pedido de amizade de um ser de outra dimensão",
  "virou fantasma após piscar no momento errado durante um eclipse solar",
  "absorvido(a) por um boneco de pelúcia que guardava energia sombria",
  "desapareceu ao tentar provar que existe o quinto elemento sozinho(a)",
  "fulminado(a) pela justiça divina por mentir no jogo da verdade ou desafio",
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
    .setDescription("Descubra quando e como alguém vai morrer 💀")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Quem vai morrer?").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser("usuario", true);

    const dia   = rand(1, 28);
    const mes   = pick(MESES);
    const ano   = rand(new Date().getFullYear() + 1, new Date().getFullYear() + 85);
    const causa = pick(CAUSAS);

    const idade = ano - (new Date().getFullYear() - rand(18, 35));

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: `💀 Previsão de Morte — ${user.displayName}`,
          description: [
            `Após uma análise profunda do universo e das suas más decisões de vida, chegamos a uma conclusão...`,
            "",
            `📅 **Data:** ${dia} de ${mes} de ${ano}`,
            `🎂 **Idade:** ${idade} anos`,
            `☠️ **Causa:** ${causa}.`,
          ].join("\n"),
          avatarUrl: user.displayAvatarURL({ size: 256 }),
        }),
      ])
    );
  },
};
