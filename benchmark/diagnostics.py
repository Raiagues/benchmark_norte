"""Safe, actionable API diagnostics. Never confuse missing credit with rate limits."""

import json

HELP_URLS = {
    "openai": "https://platform.openai.com/settings/organization/billing/overview",
    "anthropic": "https://platform.claude.com/settings/billing",
    "gemini": "https://aistudio.google.com/usage",
}
MESSAGES = {
    "missing_api_key": (
        "Falta a chave",
        "Preencha a variável indicada no arquivo .env e clique em Atualizar status.",
    ),
    "unverified": (
        "Falta verificar a conexão",
        "Clique em Verificar conexão antes de iniciar a avaliação.",
    ),
    "invalid_key": (
        "Chave inválida ou revogada",
        "Confira a chave no .env ou crie uma nova no painel do provedor. Depois verifique novamente.",
    ),
    "billing_error": (
        "Saldo ou faturamento bloqueado",
        "Recarregue os créditos ou habilite o faturamento no painel do provedor. Depois verifique novamente.",
    ),
    "spend_limit": (
        "Limite de gastos atingido",
        "Revise o limite de gastos do projeto ou da organização no painel do provedor. Depois verifique novamente.",
    ),
    "quota_exceeded": (
        "Cota de uso esgotada",
        "Confira a cota e o plano do projeto. Pode ser necessário aguardar a renovação, ajustar limites ou habilitar faturamento.",
    ),
    "rate_limit": (
        "Limite temporário de chamadas",
        "Aguarde e tente novamente. Este erro não significa, por si só, falta de créditos.",
    ),
    "permission_denied": (
        "Acesso não autorizado",
        "Confira as permissões da chave, o projeto, a região e o acesso da conta ao modelo.",
    ),
    "model_unavailable": (
        "Modelo indisponível para esta conta",
        "Selecione outro modelo ou solicite acesso a ele no painel do provedor.",
    ),
    "invalid_request": (
        "Configuração recusada pela API",
        "Confira o nome do modelo e os parâmetros aceitos. Veja o detalhe técnico abaixo.",
    ),
    "timeout": (
        "A API demorou para responder",
        "Confira a conexão e o status do provedor. Tente novamente quando estiver disponível.",
    ),
    "network_error": (
        "Não foi possível conectar à API",
        "Confira a internet, o proxy e as restrições de rede; depois tente novamente.",
    ),
    "service_unavailable": (
        "Provedor temporariamente indisponível",
        "Aguarde a recuperação do serviço e tente novamente.",
    ),
    "invalid_response": (
        "A API retornou uma resposta inesperada",
        "O formato da resposta não permitiu confirmar a conexão. Tente novamente ou confira o modelo.",
    ),
    "truncated_output": (
        "Resposta interrompida pelo limite de saída",
        "Aumente max_output_tokens na configuração ou escolha outro modelo e verifique novamente.",
    ),
    "refusal": (
        "O modelo recusou a solicitação",
        "Confira o modelo e a política da conta antes de tentar novamente.",
    ),
    "parsing_failure": (
        "A resposta não é um JSON válido",
        "A execução não foi publicada. Confira a resposta estruturada e os parâmetros do modelo.",
    ),
    "invalid_structured_output": (
        "Resposta fora do formato exigido",
        "A execução não foi publicada. Confira o modelo e seu suporte ao formato estruturado.",
    ),
    "scenario_coverage_error": (
        "A resposta não cobriu todos os cenários",
        "A execução não foi publicada. Revise o limite de saída antes de tentar novamente.",
    ),
    "internal_error": (
        "Falha interna na execução",
        "Nenhum resultado foi publicado. Consulte o registro local da tentativa.",
    ),
    "server_restarted": (
        "O servidor foi reiniciado",
        "Inicie uma nova avaliação quando estiver pronto. A anterior não foi retomada.",
    ),
}


def describe(category, provider=None, **details):
    title, action = MESSAGES.get(
        category,
        ("Falha na chamada à API", "Confira o painel do provedor e tente novamente."),
    )
    return {
        "category": category,
        "title": title,
        "action": action,
        "help_url": HELP_URLS.get(provider),
        **details,
    }


def api_error(provider, status, raw):
    # Inspect codes AND messages; HTTP 429 alone is not enough to diagnose credit.
    from .security import redact

    error = raw.get("error", {}) if isinstance(raw, dict) else {}
    if not isinstance(error, dict):
        error = {"message": str(error)}
    code = str(error.get("code") or error.get("type") or error.get("status") or "")
    message = str(error.get("message") or "")
    detail = json.dumps(error, ensure_ascii=False).lower()
    if status == 401 or any(
        x in detail
        for x in (
            "api_key_invalid",
            "invalid_api_key",
            "api key not valid",
            "invalid x-api-key",
            "authentication_error",
        )
    ):
        category = "invalid_key"
    elif (
        any(
            x in detail
            for x in (
                "credit_balance_exhausted",
                "credit balance is too low",
                "insufficient credit",
                "billing_not_active",
                "billing account is disabled",
                "billing account has been disabled",
                "payment required",
                "billing_hard_limit_reached",
            )
        )
        or status == 402
    ):
        category = "billing_error"
    elif any(
        x in detail
        for x in (
            "spend_limit",
            "usage_limit_reached",
            "budget exceeded",
            "monthly spend",
        )
    ):
        category = "spend_limit"
    elif any(
        x in detail
        for x in (
            "insufficient_quota",
            "quota_exceeded",
            "quota exceeded",
            "exceeded your current quota",
            "quota_value",
            "quotavalue",
        )
    ):
        category = "quota_exceeded"
    elif status == 429:
        category = "rate_limit"
    elif status == 403:
        category = "permission_denied"
    elif status == 404:
        category = "model_unavailable"
    elif status in (408, 504):
        category = "timeout"
    elif status >= 500:
        category = "service_unavailable"
    elif status == 400:
        category = "invalid_request"
    else:
        category = "invalid_response"
    return describe(
        category,
        provider,
        http_status=status,
        provider_code=redact(code)[:120],
        detail=redact(message)[:700],
    )
