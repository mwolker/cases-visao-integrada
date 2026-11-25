-- Perguntas iniciais do questionário de briefing.
-- Depois de aplicadas, tudo pode ser editado, reordenado ou excluído pelo /painel/.
-- A parte de verba foi retirada; a pergunta de prazo foi mantida.

with s as (
  insert into public.secoes (titulo, descricao, ordem) values
    ('Sobre a organização', 'Informações básicas para identificar quem está contratando o projeto.', 10),
    ('Objetivos e público', 'Para que serve o site e para quem ele é feito.', 20),
    ('Conteúdo e páginas', 'O que o site vai mostrar e quem produz esse conteúdo.', 30),
    ('Funcionalidades', 'Os recursos que o site precisa oferecer.', 40),
    ('Gestão do site', 'Quem vai atualizar o site depois que ele estiver pronto e com quais recursos de acessibilidade.', 50),
    ('Acessibilidade e identidade visual', 'Como o site deve atender pessoas com deficiência e qual será a sua aparência.', 60),
    ('Dados pessoais (LGPD)', 'Como o site vai coletar e cuidar de dados pessoais.', 70),
    ('Infraestrutura', 'Domínio, hospedagem, e-mails e estatísticas.', 80),
    ('Prazo e manutenção', 'Quando o site precisa estar no ar e o que acontece depois da entrega.', 90)
  returning id, ordem
)
insert into public.perguntas (secao_id, ordem, texto, ajuda, tipo, obrigatoria, opcoes, permite_outro)
select s.id, q.ordem, q.texto, q.ajuda, q.tipo, q.obrigatoria, q.opcoes::jsonb, q.permite_outro
from s
join (values
  -- 10 · Sobre a organização
  (10, 10, 'Qual é o nome oficial da organização e a sigla, se houver?', null, 'texto_curto', true, '[]', false),
  (10, 20, 'A organização tem CNPJ? Se tiver, qual é a razão social?', 'Um domínio terminado em .org.br, por exemplo, exige CNPJ.', 'texto_curto', false, '[]', false),
  (10, 30, 'Já existe site, domínio ou e-mail institucional? Se sim, quais são os endereços?', null, 'texto_longo', false, '[]', false),
  (10, 40, 'Quais redes sociais a organização usa hoje?', 'Informe os endereços ou os nomes de usuário.', 'texto_longo', false, '[]', false),
  (10, 50, 'Quem será a pessoa de contato durante o projeto?', 'Informe nome, função, e-mail e telefone.', 'texto_longo', true, '[]', false),
  (10, 60, 'Quem aprova as decisões sobre o site?', null, 'escolha_unica', false, '["Uma pessoa", "A diretoria", "Uma comissão"]', true),

  -- 20 · Objetivos e público
  (20, 10, 'Quais são os três principais objetivos do site?', null, 'texto_longo', true, '[]', false),
  (20, 20, 'Quem são os públicos do site?', 'Marque todos os que se aplicam.', 'multipla_escolha', false, '["Pessoas cegas e com baixa visão", "Familiares", "Gestores públicos", "Imprensa", "Apoiadores e voluntários", "Financiadores e parceiros"]', true),
  (20, 30, 'O que uma pessoa deve conseguir fazer no site logo no primeiro acesso?', null, 'texto_longo', false, '[]', false),
  (20, 40, 'Há sites que vocês admiram, de qualquer área? O que gostam em cada um?', null, 'texto_longo', false, '[]', false),
  (20, 50, 'Há sites que vocês não gostariam de imitar? Por quê?', null, 'texto_longo', false, '[]', false),

  -- 30 · Conteúdo e páginas
  (30, 10, 'Quais páginas o site precisa ter?', 'Marque todas as que se aplicam.', 'multipla_escolha', false, '["Quem somos", "História", "Equipe ou diretoria", "Núcleos ou unidades regionais", "Notícias", "Eventos", "Publicações", "Transparência", "Como participar", "Contato"]', true),
  (30, 20, 'Os textos do site já existem?', null, 'escolha_unica', false, '["Sim, já existem", "Existem em parte", "Não, precisam ser escritos"]', false),
  (30, 30, 'Quem vai escrever ou revisar os textos?', null, 'texto_curto', false, '[]', false),
  (30, 40, 'Há fotos e vídeos próprios? Eles têm autorização de uso de imagem?', null, 'texto_longo', false, '[]', false),
  (30, 50, 'Os vídeos já têm legenda, audiodescrição ou janela de Libras? Quem vai produzir esses recursos?', null, 'texto_longo', false, '[]', false),
  (30, 60, 'Vocês pretendem publicar documentos em PDF, como estatuto, relatórios ou cartilhas? Quantos, aproximadamente?', null, 'texto_longo', false, '[]', false),
  (30, 70, 'Existe conteúdo de um site antigo que precisa ser migrado?', null, 'escolha_unica', false, '["Sim", "Não", "Não sei"]', false),
  (30, 80, 'Com que frequência vocês pretendem publicar notícias ou atualizações?', null, 'escolha_unica', false, '["Toda semana", "Todo mês", "De vez em quando", "Ainda não sabemos"]', false),

  -- 40 · Funcionalidades
  (40, 10, 'Quais destas funcionalidades vocês precisam?', 'Marque todas as que se aplicam.', 'multipla_escolha', false, '["Formulário de contato", "Formulário de associação ou cadastro", "Inscrição em eventos", "Doações (PIX, cartão ou doação recorrente)", "Agenda de eventos", "Notícias ou blog", "Newsletter por e-mail", "Área restrita para integrantes", "Mapa ou lista de unidades regionais", "Galeria de fotos", "Podcast ou conteúdo em áudio", "Site em mais de um idioma"]', true),
  (40, 20, 'Entre as funcionalidades marcadas, quais são indispensáveis para a primeira versão do site?', null, 'texto_longo', false, '[]', false),
  (40, 30, 'Se houver doações, a organização já tem conta ou plataforma de pagamento?', null, 'texto_longo', false, '[]', false),

  -- 50 · Gestão do site
  (50, 10, 'Quem vai publicar e atualizar o conteúdo depois que o site estiver pronto?', null, 'texto_longo', true, '[]', false),
  (50, 20, 'Quantas pessoas vão administrar o site?', null, 'texto_curto', false, '[]', false),
  (50, 30, 'Essas pessoas usam algum destes recursos?', 'Marque todos os que se aplicam.', 'multipla_escolha', false, '["NVDA", "JAWS", "Narrador do Windows", "VoiceOver no Mac", "VoiceOver no iPhone", "TalkBack", "Jieshuo", "Ampliador ou lupa de tela", "Nenhum desses recursos"]', true),
  (50, 40, 'Em que dispositivos elas costumam trabalhar?', 'Marque todos os que se aplicam.', 'multipla_escolha', false, '["Computador com Windows", "Mac", "Celular Android", "iPhone"]', true),
  (50, 50, 'Alguma delas já usou WordPress ou outro sistema de gerenciamento de sites? Como foi a experiência?', null, 'texto_longo', false, '[]', false),
  (50, 60, 'Vocês querem treinamento para usar o painel do site?', 'Conte também se preferem presencial ou remoto e em que formato querem o material de apoio: texto, áudio ou vídeo.', 'texto_longo', false, '[]', false),

  -- 60 · Acessibilidade e identidade visual
  (60, 10, 'Além de pessoas cegas e com baixa visão, o site deve considerar outros públicos?', 'Marque todos os que se aplicam.', 'multipla_escolha', false, '["Pessoas surdas", "Pessoas com surdocegueira", "Pessoas com deficiência intelectual", "Pessoas com deficiência motora", "Pessoas idosas"]', true),
  (60, 20, 'Quais recursos para baixa visão o site deve oferecer?', 'Por exemplo: alto contraste, aumento do tamanho da fonte, espaçamento maior entre linhas.', 'texto_longo', false, '[]', false),
  (60, 30, 'Integrantes da organização poderiam participar de testes do site antes da publicação? Quantas pessoas, aproximadamente?', null, 'texto_longo', false, '[]', false),
  (60, 40, 'A organização já tem logotipo, cores e fontes definidos?', null, 'escolha_unica', false, '["Sim, com manual de marca", "Sim, mas sem manual de marca", "Não temos"]', false),
  (60, 50, 'Se não houver identidade visual, vocês querem que ela seja criada como parte do projeto?', null, 'escolha_unica', false, '["Sim", "Não", "Gostaria de conversar sobre isso"]', false),

  -- 70 · Dados pessoais (LGPD)
  (70, 10, 'Algum formulário do site vai pedir informações sobre a deficiência ou a condição visual da pessoa?', 'Pela LGPD, informações sobre deficiência são dados sensíveis e exigem cuidados extras.', 'escolha_unica', false, '["Sim", "Não", "Não sei"]', false),
  (70, 20, 'Para que esses dados serão usados e quem terá acesso a eles?', null, 'texto_longo', false, '[]', false),
  (70, 30, 'A organização já tem política de privacidade ou uma pessoa responsável pela proteção de dados?', null, 'texto_longo', false, '[]', false),

  -- 80 · Infraestrutura
  (80, 10, 'Em nome de quem devem ficar o domínio e a hospedagem?', null, 'texto_curto', false, '[]', false),
  (80, 20, 'Vocês precisam de contas de e-mail institucional? Quantas?', null, 'texto_curto', false, '[]', false),
  (80, 30, 'Vocês querem acompanhar estatísticas de visitas? Quais informações interessam?', null, 'texto_longo', false, '[]', false),

  -- 90 · Prazo e manutenção
  (90, 10, 'Existe uma data limite para o site entrar no ar? Ela está ligada a algum evento ou prazo externo?', null, 'texto_longo', true, '[]', false),
  (90, 20, 'Depois da entrega, vocês querem contratar manutenção mensal, com atualizações de segurança e suporte?', null, 'escolha_unica', false, '["Sim", "Não", "Gostaria de conversar sobre isso"]', false),
  (90, 30, 'Há mais alguma informação que vocês consideram importante para o projeto?', null, 'texto_longo', false, '[]', false)
) as q(secao_ordem, ordem, texto, ajuda, tipo, obrigatoria, opcoes, permite_outro)
  on q.secao_ordem = s.ordem;
