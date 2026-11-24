-- =============================================================================
-- Questionário de briefing · estrutura do banco (projeto Supabase cases-briefing)
--
-- Quem acessa o quê:
--   * Administrador (Maurício, logado no /painel/): lê e altera tudo, via RLS.
--   * Cliente (link individual /briefing/?c=TOKEN): NÃO acessa tabelas.
--     Usa só as funções briefing_carregar e briefing_salvar, que validam o token.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Administradores
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
comment on table public.admins is 'Usuários do Supabase Auth com acesso ao painel do questionário.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Atualização automática de atualizado_em
-- ---------------------------------------------------------------------------
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
revoke all on function public.tocar_atualizado_em() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seções e perguntas (editáveis pelo painel)
-- ---------------------------------------------------------------------------
create table public.secoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  descricao text check (descricao is null or length(descricao) <= 2000),
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.perguntas (
  id uuid primary key default gen_random_uuid(),
  secao_id uuid not null references public.secoes (id) on delete cascade,
  texto text not null check (length(btrim(texto)) between 1 and 1000),
  ajuda text check (ajuda is null or length(ajuda) <= 2000),
  tipo text not null default 'texto_longo'
    check (tipo in ('texto_curto', 'texto_longo', 'escolha_unica', 'multipla_escolha')),
  obrigatoria boolean not null default false,
  opcoes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(opcoes) = 'array' and jsonb_array_length(opcoes) <= 40),
  permite_outro boolean not null default false,
  ativa boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint escolha_tem_opcoes check (
    tipo in ('texto_curto', 'texto_longo') or jsonb_array_length(opcoes) >= 1
  )
);
create index perguntas_secao_idx on public.perguntas (secao_id, ordem);

create trigger secoes_atualizado before update on public.secoes
  for each row execute function public.tocar_atualizado_em();
create trigger perguntas_atualizado before update on public.perguntas
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- Convites (um link por cliente) e respostas
-- ---------------------------------------------------------------------------
create table public.convites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  nome_contato text not null check (length(btrim(nome_contato)) between 1 and 200),
  organizacao text check (organizacao is null or length(organizacao) <= 200),
  email text check (email is null or length(email) <= 320),
  notas text check (notas is null or length(notas) <= 4000),
  ativo boolean not null default true,
  status text not null default 'pendente'
    check (status in ('pendente', 'em_andamento', 'enviado')),
  iniciado_em timestamptz,
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on column public.convites.notas is 'Anotações internas do administrador. Nunca são mostradas ao cliente.';

create trigger convites_atualizado before update on public.convites
  for each row execute function public.tocar_atualizado_em();

create table public.respostas (
  id uuid primary key default gen_random_uuid(),
  convite_id uuid not null references public.convites (id) on delete cascade,
  -- Se a pergunta for excluída depois, a resposta continua guardada com o texto da pergunta.
  pergunta_id uuid references public.perguntas (id) on delete set null,
  secao_titulo text not null,
  secao_ordem integer not null default 0,
  pergunta_texto text not null,
  pergunta_ordem integer not null default 0,
  pergunta_tipo text not null,
  valor jsonb not null default '{}'::jsonb check (jsonb_typeof(valor) = 'object'),
  atualizado_em timestamptz not null default now(),
  unique (convite_id, pergunta_id)
);
create index respostas_convite_idx on public.respostas (convite_id);
create index respostas_pergunta_idx on public.respostas (pergunta_id);

-- ---------------------------------------------------------------------------
-- RLS: somente administradores acessam as tabelas diretamente
-- ---------------------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.secoes enable row level security;
alter table public.perguntas enable row level security;
alter table public.convites enable row level security;
alter table public.respostas enable row level security;

create policy admins_ver_proprio on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

create policy secoes_admin on public.secoes
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy perguntas_admin on public.perguntas
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy convites_admin on public.convites
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy respostas_admin on public.respostas
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.admins, public.secoes, public.perguntas, public.convites, public.respostas from anon;

-- ---------------------------------------------------------------------------
-- Funções públicas do questionário (acesso por token)
-- ---------------------------------------------------------------------------
create or replace function public.briefing_carregar(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_convite public.convites%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    raise exception 'link_invalido' using errcode = 'P0001';
  end if;

  select * into v_convite from public.convites c where c.token = p_token and c.ativo;
  if not found then
    raise exception 'link_invalido' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'convite', jsonb_build_object(
      'nome_contato', v_convite.nome_contato,
      'organizacao', v_convite.organizacao,
      'status', v_convite.status,
      'enviado_em', v_convite.enviado_em
    ),
    'secoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'titulo', s.titulo,
        'descricao', s.descricao,
        'perguntas', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', p.id,
            'texto', p.texto,
            'ajuda', p.ajuda,
            'tipo', p.tipo,
            'obrigatoria', p.obrigatoria,
            'opcoes', p.opcoes,
            'permite_outro', p.permite_outro
          ) order by p.ordem, p.criado_em), '[]'::jsonb)
          from public.perguntas p
          where p.secao_id = s.id and p.ativa
        )
      ) order by s.ordem, s.criado_em)
      from public.secoes s
      where exists (select 1 from public.perguntas p where p.secao_id = s.id and p.ativa)
    ), '[]'::jsonb),
    'respostas', coalesce((
      select jsonb_object_agg(r.pergunta_id, r.valor)
      from public.respostas r
      where r.convite_id = v_convite.id and r.pergunta_id is not null
    ), '{}'::jsonb)
  );
end;
$$;

-- Normaliza e valida o valor recebido conforme o tipo da pergunta.
-- Retorna null quando a resposta está vazia.
create or replace function public.briefing_normalizar_valor(p_pergunta public.perguntas, p_valor jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_texto text;
  v_opcao text;
  v_opcoes jsonb;
  v_outro text;
  v_validas text[];
begin
  if p_valor is null or jsonb_typeof(p_valor) <> 'object' then
    return null;
  end if;

  select coalesce(array_agg(x), '{}') into v_validas from jsonb_array_elements_text(p_pergunta.opcoes) x;
  v_outro := nullif(btrim(left(coalesce(p_valor->>'outro', ''), 2000)), '');
  if not p_pergunta.permite_outro then
    v_outro := null;
  end if;

  if p_pergunta.tipo in ('texto_curto', 'texto_longo') then
    v_texto := nullif(btrim(left(coalesce(p_valor->>'texto', ''),
      case when p_pergunta.tipo = 'texto_curto' then 500 else 10000 end)), '');
    return case when v_texto is null then null else jsonb_build_object('texto', v_texto) end;

  elsif p_pergunta.tipo = 'escolha_unica' then
    v_opcao := p_valor->>'opcao';
    if v_opcao = '__outro__' and v_outro is not null then
      return jsonb_build_object('opcao', '__outro__', 'outro', v_outro);
    elsif v_opcao = any (v_validas) then
      return jsonb_build_object('opcao', v_opcao);
    end if;
    return null;

  else -- multipla_escolha
    select coalesce(jsonb_agg(x order by array_position(v_validas, x)), '[]'::jsonb) into v_opcoes
    from (
      select distinct x
      from jsonb_array_elements_text(case when jsonb_typeof(p_valor->'opcoes') = 'array' then p_valor->'opcoes' else '[]'::jsonb end) x
      where x = any (v_validas)
    ) t;
    if jsonb_array_length(v_opcoes) = 0 and v_outro is null then
      return null;
    end if;
    return jsonb_build_object('opcoes', v_opcoes) || case when v_outro is null then '{}'::jsonb else jsonb_build_object('outro', v_outro) end;
  end if;
end;
$$;
revoke all on function public.briefing_normalizar_valor(public.perguntas, jsonb) from public, anon, authenticated;

create or replace function public.briefing_salvar(p_token text, p_respostas jsonb, p_enviar boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_convite public.convites%rowtype;
  v_pergunta public.perguntas%rowtype;
  v_secao public.secoes%rowtype;
  v_valor jsonb;
  v_faltando jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    raise exception 'link_invalido' using errcode = 'P0001';
  end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then
    raise exception 'dados_invalidos' using errcode = 'P0001';
  end if;
  if octet_length(p_respostas::text) > 400000 then
    raise exception 'dados_grandes_demais' using errcode = 'P0001';
  end if;

  select * into v_convite from public.convites c where c.token = p_token and c.ativo for update;
  if not found then
    raise exception 'link_invalido' using errcode = 'P0001';
  end if;
  if v_convite.status = 'enviado' then
    raise exception 'ja_enviado' using errcode = 'P0001';
  end if;

  for v_pergunta in
    select p.* from public.perguntas p
    where p.ativa and p.id in (
      select k::uuid from jsonb_object_keys(p_respostas) k
      where k ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  loop
    select * into v_secao from public.secoes s where s.id = v_pergunta.secao_id;
    v_valor := public.briefing_normalizar_valor(v_pergunta, p_respostas -> v_pergunta.id::text);
    if v_valor is null then
      delete from public.respostas r where r.convite_id = v_convite.id and r.pergunta_id = v_pergunta.id;
    else
      insert into public.respostas as r (convite_id, pergunta_id, secao_titulo, secao_ordem, pergunta_texto, pergunta_ordem, pergunta_tipo, valor)
      values (v_convite.id, v_pergunta.id, v_secao.titulo, v_secao.ordem, v_pergunta.texto, v_pergunta.ordem, v_pergunta.tipo, v_valor)
      on conflict (convite_id, pergunta_id) do update
        set valor = excluded.valor,
            secao_titulo = excluded.secao_titulo,
            secao_ordem = excluded.secao_ordem,
            pergunta_texto = excluded.pergunta_texto,
            pergunta_ordem = excluded.pergunta_ordem,
            pergunta_tipo = excluded.pergunta_tipo,
            atualizado_em = now();
    end if;
  end loop;

  if p_enviar then
    select coalesce(jsonb_agg(p.id order by s.ordem, p.ordem), '[]'::jsonb) into v_faltando
    from public.perguntas p
    join public.secoes s on s.id = p.secao_id
    where p.ativa and p.obrigatoria
      and not exists (select 1 from public.respostas r where r.convite_id = v_convite.id and r.pergunta_id = p.id);

    if jsonb_array_length(v_faltando) > 0 then
      update public.convites
        set status = 'em_andamento', iniciado_em = coalesce(iniciado_em, now())
        where id = v_convite.id;
      return jsonb_build_object('ok', false, 'status', 'em_andamento', 'faltando', v_faltando, 'salvo_em', now());
    end if;

    update public.convites
      set status = 'enviado', iniciado_em = coalesce(iniciado_em, now()), enviado_em = now()
      where id = v_convite.id;
    return jsonb_build_object('ok', true, 'status', 'enviado', 'faltando', '[]'::jsonb, 'salvo_em', now());
  end if;

  update public.convites
    set status = 'em_andamento', iniciado_em = coalesce(iniciado_em, now())
    where id = v_convite.id;
  return jsonb_build_object('ok', true, 'status', 'em_andamento', 'faltando', '[]'::jsonb, 'salvo_em', now());
end;
$$;

revoke all on function public.briefing_carregar(text) from public;
revoke all on function public.briefing_salvar(text, jsonb, boolean) from public;
grant execute on function public.briefing_carregar(text) to anon, authenticated;
grant execute on function public.briefing_salvar(text, jsonb, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Aviso por e-mail quando o cliente envia o questionário
-- A URL e o segredo ficam no Vault: nomes 'aviso_url' e 'aviso_segredo'.
-- Sem eles configurados, nada é enviado e o questionário funciona normalmente.
-- ---------------------------------------------------------------------------
create or replace function public.notificar_envio_briefing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_segredo text;
begin
  if new.status = 'enviado' and old.status is distinct from 'enviado' then
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'aviso_url';
    select ds.decrypted_secret into v_segredo from vault.decrypted_secrets ds where ds.name = 'aviso_segredo';
    if v_url is not null and v_segredo is not null then
      perform net.http_post(
        url := v_url,
        body := jsonb_build_object(
          'convite_id', new.id,
          'nome_contato', new.nome_contato,
          'organizacao', new.organizacao,
          'enviado_em', new.enviado_em
        ),
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Aviso-Segredo', v_segredo),
        timeout_milliseconds := 8000
      );
    end if;
  end if;
  return new;
exception when others then
  -- Uma falha no aviso nunca pode impedir o envio do questionário.
  return new;
end;
$$;
revoke all on function public.notificar_envio_briefing() from public, anon, authenticated;

create trigger convites_aviso_envio
  after update of status on public.convites
  for each row execute function public.notificar_envio_briefing();
