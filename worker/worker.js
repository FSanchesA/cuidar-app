
/*
========================================================
 CUIDAR - CLOUDFLARE WORKER
 Integracao GitHub Pages + Google Apps Script

 Pacientes: GEORGES e ILMA
 Banco de dados: Google Sheets
 Dashboard: senha da familia

 IMPORTANTE:
 As credenciais ficam nas variaveis do Cloudflare.
 Nunca coloque BRIDGE_SECRET neste arquivo.
========================================================
*/

const ORIGEM_PERMITIDA = "https://fsanchesa.github.io";

const ACOES_PERMITIDAS = [
  "init",
  "list",
  "login",
  "logout",
  "save",
  "delete"
];

export default {

  async fetch(request, env) {

    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    const corsHeaders = {
      "Access-Control-Allow-Origin": ORIGEM_PERMITIDA,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };

    const jsonHeaders = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    };

    function responder(dados, status = 200, cors = false) {
      return new Response(JSON.stringify(dados), {
        status,
        headers: {
          ...jsonHeaders,
          ...(cors ? corsHeaders : {})
        }
      });
    }

    /*
    ----------------------------------------------------
    1. TESTE DE FUNCIONAMENTO
    ----------------------------------------------------
    */

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return responder({
        ok: true,
        aplicativo: "Cuidar",
        componente: "Cloudflare Worker",
        status: "online",
        versao: "2.0",
        pacientes: ["GEORGES", "ILMA"]
      });
    }

    /*
    ----------------------------------------------------
    2. ROTA DA API
    ----------------------------------------------------
    */

    if (url.pathname !== "/api") {
      return responder({
        ok: false,
        error: "Rota nao encontrada."
      }, 404);
    }

    /*
    ----------------------------------------------------
    3. VERIFICACAO DE ORIGEM
    ----------------------------------------------------
    */

    const origemValida = origin === ORIGEM_PERMITIDA;

    if (!origemValida) {
      return responder({
        ok: false,
        error: "Origem nao autorizada."
      }, 403);
    }

    /*
    ----------------------------------------------------
    4. CORS - NAVEGADOR
    ----------------------------------------------------
    */

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (request.method !== "POST") {
      return responder({
        ok: false,
        error: "Metodo nao permitido."
      }, 405, true);
    }

    /*
    ----------------------------------------------------
    5. CONFIGURACOES PRIVADAS
    ----------------------------------------------------
    */

    if (!env.GAS_URL || !env.BRIDGE_SECRET) {
      return responder({
        ok: false,
        error: "Integracao nao configurada no Cloudflare."
      }, 503, true);
    }

    /*
    ----------------------------------------------------
    6. PROCESSAMENTO
    ----------------------------------------------------
    */

    try {

      const tipo = request.headers.get("Content-Type") || "";

      if (!tipo.toLowerCase().includes("application/json")) {
        return responder({
          ok: false,
          error: "Formato de requisicao invalido."
        }, 415, true);
      }

      const texto = await request.text();

      if (texto.length > 16000) {
        return responder({
          ok: false,
          error: "Dados acima do tamanho permitido."
        }, 413, true);
      }

      let entrada;

      try {
        entrada = JSON.parse(texto);
      } catch {
        return responder({
          ok: false,
          error: "JSON invalido."
        }, 400, true);
      }

      const acao = String(entrada.action || "");

      if (!ACOES_PERMITIDAS.includes(acao)) {
        return responder({
          ok: false,
          error: "Acao nao permitida."
        }, 400, true);
      }

      const payload = entrada.payload || {};

      if (
        typeof payload !== "object" ||
        payload === null ||
        Array.isArray(payload)
      ) {
        return responder({
          ok: false,
          error: "Dados invalidos."
        }, 400, true);
      }

      /*
      --------------------------------------------------
      7. VALIDACAO DO PACIENTE
      --------------------------------------------------
      */

      const acoesComPaciente = [
        "init",
        "list",
        "save",
        "delete"
      ];

      if (acoesComPaciente.includes(acao)) {

        const paciente = String(payload.patient || "");

        if (
          paciente !== "GEORGES" &&
          paciente !== "ILMA"
        ) {
          return responder({
            ok: false,
            error: "Paciente invalido."
          }, 400, true);
        }
      }

      /*
      --------------------------------------------------
      8. ENCAMINHAMENTO PARA GOOGLE APPS SCRIPT
      --------------------------------------------------
      */

      const requisicaoGoogle = {
        action: acao,
        payload: payload,
        bridgeKey: env.BRIDGE_SECRET
      };

      const respostaGoogle = await fetch(env.GAS_URL, {
        method: "POST",

        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },

        body: JSON.stringify(requisicaoGoogle),

        redirect: "follow",

        signal: AbortSignal.timeout(25000)
      });

      if (!respostaGoogle.ok) {
        return responder({
          ok: false,
          error: "Falha na comunicacao com o Google Apps Script."
        }, 502, true);
      }

      /*
      --------------------------------------------------
      9. TRATAMENTO DA RESPOSTA
      --------------------------------------------------
      */

      const conteudo = await respostaGoogle.text();

      let resultado;

      try {
        resultado = JSON.parse(conteudo);
      } catch {
        return responder({
          ok: false,
          error: "O Google retornou uma resposta invalida."
        }, 502, true);
      }

      if (
        typeof resultado !== "object" ||
        resultado === null ||
        typeof resultado.ok !== "boolean"
      ) {
        return responder({
          ok: false,
          error: "Formato de resposta inesperado."
        }, 502, true);
      }

      /*
      --------------------------------------------------
      10. RETORNO AO APLICATIVO
      --------------------------------------------------
      */

      return responder(resultado, 200, true);

    } catch (erro) {

      if (erro?.name === "TimeoutError") {
        return responder({
          ok: false,
          error: "Tempo limite da conexao excedido."
        }, 504, true);
      }

      return responder({
        ok: false,
        error: "Nao foi possivel concluir a solicitacao."
      }, 500, true);
    }
  }
};
