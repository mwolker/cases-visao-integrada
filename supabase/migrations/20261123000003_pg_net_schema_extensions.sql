-- Move a extensão pg_net para o schema extensions (alerta de segurança do Supabase).
-- As funções continuam em net.*, então o gatilho de aviso não muda.
drop extension if exists pg_net;
create extension pg_net with schema extensions;

-- Segredos do aviso por e-mail (executar uma vez, fora do repositório, com o valor real):
--   select vault.create_secret('https://cases.visaointegrada.net.br/api/aviso-briefing', 'aviso_url');
--   select vault.create_secret('<mesmo valor de AVISO_SEGREDO no Worker>', 'aviso_segredo');
