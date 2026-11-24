/* ==========================================================================
   Worker do site de cases
   - /api/aviso-briefing: recebe do banco (Supabase) o aviso de que um cliente
     enviou o questionário e manda um e-mail para o Maurício.
   - Todo o resto continua sendo servido pelos arquivos estáticos de site/.

   Configuração no painel da Cloudflare (Workers e Pages > cases-visao-integrada
   > Settings > Variables and Secrets), tipo "Secret":
     AVISO_SEGREDO   mesmo valor guardado no Vault do Supabase (aviso_segredo)
     AVISO_PARA      e-mail que recebe o aviso (precisa estar verificado no
                     Email Routing)
   ========================================================================== */

const REMETENTE = { email: 'avisos@visaointegrada.net.br', name: 'Questionário · Visão Integrada' };
const PAINEL = 'https://cases.visaointegrada.net.br/painel/';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/aviso-briefing') return aviso(request, env);
    return env.ASSETS.fetch(request);
  }
};

function texto(status, corpo, extra) {
  return new Response(corpo, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
}

/* Comparação em tempo constante, para não revelar o segredo pela demora da resposta. */
async function iguais(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

function limpar(valor, max) {
  return String(valor ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[<>]/g, '').trim().slice(0, max);
}

async function aviso(request, env) {
  if (request.method !== 'POST') return texto(405, 'Método não permitido.', { Allow: 'POST' });
  if (!env.AVISO_SEGREDO || !env.AVISO_PARA || !env.AVISO_EMAIL) return texto(503, 'Aviso por e-mail não configurado.');

  const recebido = request.headers.get('X-Aviso-Segredo') || '';
  if (!(await iguais(recebido, env.AVISO_SEGREDO))) return texto(401, 'Não autorizado.');

  let dados;
  try { dados = await request.json(); } catch { return texto(400, 'Corpo inválido.'); }

  const nome = limpar(dados.nome_contato, 200) || 'Cliente sem nome';
  const organizacao = limpar(dados.organizacao, 200);
  const id = limpar(dados.convite_id, 36);
  const quando = dados.enviado_em
    ? new Date(dados.enviado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long', timeStyle: 'short' })
    : 'agora';
  const quem = organizacao ? `${nome} (${organizacao})` : nome;
  const link = /^[0-9a-f-]{36}$/.test(id) ? `${PAINEL}#respostas/${id}` : PAINEL;

  const corpoTexto = [
    `${quem} enviou o questionário de briefing em ${quando}.`,
    '',
    `Ver as respostas no painel: ${link}`,
    '',
    'Por segurança, este e-mail não traz as respostas. Elas ficam só no painel, que pede login.'
  ].join('\n');

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const corpoHtml = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.6;color:#0e1222">
<p><strong>${esc(quem)}</strong> enviou o questionário de briefing em ${esc(quando)}.</p>
<p><a href="${esc(link)}" style="color:#3527a8;font-weight:bold">Ver as respostas no painel</a></p>
<p style="color:#383f55">Por segurança, este e-mail não traz as respostas. Elas ficam só no painel, que pede login.</p>
</body></html>`;

  try {
    await env.AVISO_EMAIL.send({
      to: env.AVISO_PARA,
      from: REMETENTE,
      subject: `Questionário respondido: ${quem}`,
      text: corpoTexto,
      html: corpoHtml
    });
  } catch (erro) {
    console.error('Falha ao enviar o aviso', erro && (erro.code || erro.message));
    return texto(502, 'Falha ao enviar o e-mail.');
  }
  return texto(200, 'Aviso enviado.');
}
