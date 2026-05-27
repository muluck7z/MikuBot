import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, v2Reply } from "../v2/index";

// ─── Profecias ────────────────────────────────────────────────────────────────

const PROFECIAS_PROXIMAS: string[] = [
  "Você vai perder o celular e encontrá-lo no lugar mais óbvio do mundo — o seu próprio bolso.",
  "Uma mensagem de texto enviada para a pessoa completamente errada vai estragar sua semana.",
  "Você vai demorar 3 horas tentando decidir o que comer e acabar comendo arroz com ovo mesmo.",
  "Um pé de chinelo vai chapar na sua canela na escuridão e você vai xingar palavrão em 4 idiomas.",
  "Você vai fazer planos animados para o fim de semana e cancelar tudo para ficar deitado(a) no sofá.",
  "Alguém vai te mandar um áudio de 4 minutos que poderia ter sido um texto de 10 segundos.",
  "Você vai abrir a geladeira 7 vezes seguidas em 20 minutos sem pegar absolutamente nada.",
  "Um fio solto na sua roupa favorita vai destruir a peça inteira em menos de 30 segundos.",
  "Você vai acordar completamente convicto(a) de que é sábado. Não vai ser.",
  "Seu carregador vai morrer exatamente no momento em que você mais precisar do celular.",
  "Você vai começar uma dieta 'amanhã' por pelo menos mais 3 semanas consecutivas.",
  "Uma pessoa aleatória vai te dar um elogio sincero num dia em que você estava horrível.",
  "Você vai descobrir que perdeu algo há meses e estava debaixo do seu próprio nariz.",
  "Uma compra impulsiva de madrugada vai te fazer questionar suas decisões de vida por dias.",
  "Você vai pisar numa poça d'água com meia nova e ter que aguentar o dia todo assim.",
  "Um meme vai te fazer rir tão alto sozinho(a) que sua família vai se preocupar com você.",
  "Você vai esquecer uma palavra extremamente simples na hora mais importante e entrar em pânico.",
  "Seu autocorreto vai te envergonhar publicamente de um jeito que você não vai esquecer tão cedo.",
  "Você vai ter uma ideia genial às 3 da manhã, não anotar, e esquecer para sempre.",
  "Uma conversa de 5 minutos vai te dar ansiedade por 3 dias inteiros.",
  "Você vai se preparar para sair e chover exatamente quando fechar a porta.",
  "Um vídeo idiota na internet vai sugar 2 horas da sua vida e você vai se arrepender profundamente.",
  "Você vai encontrar R$50 em uma calça que não usava e se sentir milionário(a) por 10 minutos.",
  "Alguém vai usar a última folha de papel higiênico e não repor. Será você quem vai sofrer as consequências.",
  "Você vai tentar impressionar alguém e dar um tropeção épico no momento exato.",
  "Um alarme que você não lembra de ter configurado vai tocar na pior hora possível.",
  "Você vai mandar 'oi' para alguém e esperar a resposta olhando para o celular por 40 minutos.",
  "Uma música que você odeia vai grudar na sua cabeça por 4 dias sem parar.",
  "Você vai usar o shampoo no lugar do condicionador e só perceber no dia seguinte.",
  "Seu joelho vai estalar num silêncio absoluto e todo mundo vai ouvir.",
];

const PROFECIAS_DISTANTES: string[] = [
  "Em 2045, você vai acidentalmente fundar uma religião baseada num mal-entendido que ninguém vai conseguir explicar.",
  "Em 2037, você vai descobrir que tem um talento extraordinário para algo completamente inútil para a humanidade.",
  "Em seus últimos dias, você será aquele(a) velhinho(a) que conta a mesma história 800 vezes e acha graça toda vez.",
  "Em 2052, um robô de reciclagem vai te confundir com uma lata de alumínio e as autoridades vão demorar para notar.",
  "Em 2040, você vai aparecer num meme global sem entender como aquilo aconteceu ou como parar.",
  "Em 2035, uma cadeira de escritório com rodinha defeituosa vai decretar o fim da sua carreira de uma vez por todas.",
  "Em 2060, seus netos vão te usar como exemplo escolar de 'como não tomar decisões financeiras'.",
  "Em 2038, você vai ser o último ser humano vivo a descobrir uma tecnologia que já existia há 20 anos.",
  "Em 2044, você vai inventar acidentalmente uma nova expressão facial que a ciência ainda não havia catalogado.",
  "Em 2050, um museu vai exibir um objeto seu com a plaquinha 'artefato do início do século XXI — uso desconhecido'.",
  "Em 2036, você vai aparecer num documentário sobre pessoas que acreditavam em coisas absurdas e vai concordar com tudo.",
  "Em 2048, uma IA vai analisar todas as suas fotos e concluir que você teve uma vida 'interessante de se observar'.",
  "Em 2041, você vai herdar algo de um parente distante que vai complicar sua vida de formas que ninguém previu.",
  "Em 2055, você vai ser a última pessoa no planeta a ainda usar uma expressão que ninguém mais usa faz décadas.",
  "Em 2033, você vai viralizar por algo que fez há 10 anos e torcer para que ninguém descubra que é você.",
  "Em 2047, você vai dar um conselho de vida para alguém que vai seguir à risca e dar muito errado.",
  "Em 2043, um extraterrestre vai te visitar, olhar nos seus olhos, e ir embora sem dizer uma palavra.",
  "Em 2039, você vai ganhar um prêmio de uma competição que nem sabia que estava participando.",
  "Em 2057, suas memórias vão ser digitalizadas e o arquivo vai dar erro de compatibilidade.",
  "Em 2034, você vai se tornar famoso(a) em um país que você nunca visitou por razões que você nunca vai entender.",
  "Em 2046, você vai sobreviver a um evento histórico e a história oficial vai errar seu nome.",
  "Em 2053, uma planta que você plantou hoje vai crescer e destruir silenciosamente a fundação da sua casa.",
  "Em 2042, você vai aparecer num sonho de um desconhecido completo e ele vai acordar com medo.",
  "Em 2049, suas anotações aleatórias serão encontradas e publicadas como 'obra filosófica obscura do século XXI'.",
  "Em 2058, uma versão robótica sua vai ser criada e vai tomar decisões melhores que as suas sistematicamente.",
  "Em 2032, você vai resolver um problema enorme por puro acidente e ninguém vai acreditar que foi sem querer.",
  "Em 2051, sua voz vai ser usada como efeito sonoro num filme de terror de grande orçamento.",
  "Em 2062, arqueólogos vão desenterrar algo seu e classificar como 'objeto ritual de propósito incerto'.",
  "Em 2038, você vai se tornar o protagonista de um livro sem nunca ter dado permissão para isso.",
  "Em 2056, uma teoria da conspiração vai girar ao redor de você e metade dela vai estar correta.",
];

// ─── Utils ────────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// ─── Command ─────────────────────────────────────────────────────────────────

export const futuroCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("futuro")
    .setDescription("As estrelas revelam o futuro de alguém 🔮")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("De quem você quer ver o futuro?").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser("usuario", true);

    const proxima  = pick(PROFECIAS_PROXIMAS);
    const distante = pick(PROFECIAS_DISTANTES);

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: `🔮 Profecias — ${user.displayName}`,
          description: [
            `**🌙 Futuro Próximo**`,
            `*${proxima}*`,
            "",
            `**⭐ Futuro Distante**`,
            `*${distante}*`,
          ].join("\n"),
          avatarUrl: user.displayAvatarURL({ size: 256 }),
        }),
      ])
    );
  },
};
