# Provider implementation references

Checked 2026-09-27 against official API documentation:

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs): Responses API `text.format`, strict JSON Schema. The adapter uses `/v1/responses`, server-side bearer authentication and `store: false`.
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs): Messages API `output_config.format`. The adapter uses `/v1/messages` and the `2023-06-01` API version header.
- [Gemini GenerateContent reference](https://ai.google.dev/api/generate-content): `generationConfig.responseMimeType` and `responseJsonSchema` (currently retained, with newer `responseFormat` also documented). The adapter uses `/v1beta/models/{model}:generateContent`, with the key in the `x-goog-api-key` header, not in a URL.

Provider wrappers carry the exact same prompt string and portable schema. Bounds unsupported by some schema subsets are removed from the shared outbound schema and enforced locally by Pydantic. No provider receives hidden chain-of-thought requests, a different task, a repaired answer, ground-truth files, or first-pass feedback.

## Model catalog and settings

The catalog was checked on 2026-09-27. Featured means a manufacturer-positioned reasoning candidate, not a measured winner. Availability depends on the API account. Keep model IDs and settings configurable.

| Provider | Featured | Alternative | Source |
| --- | --- | --- | --- |
| OpenAI | `gpt-6-astra` | `gpt-6-sol` | [Model catalog](https://developers.openai.com/api/docs/models), [Astra guide](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra) |
| Anthropic | `claude-fable-5-1` | `claude-opus-5-5` | [Models overview](https://platform.claude.com/docs/en/models/overview), [Fable changes](https://platform.claude.com/docs/en/models/fable-5-1/whats-new-fable-5-1) |
| Gemini | `gemini-3.1-pro-preview` | `gemini-3.8-flash` | [Model catalog](https://ai.google.dev/gemini-api/docs/models), [Pro model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview), [Gemini 3 settings](https://ai.google.dev/gemini-api/docs/gemini-3) |

The OpenAI models use `reasoning.effort: high`; temperature is omitted because it is incompatible with reasoning on these models. Anthropic uses `output_config.effort: high` and omits temperature; adaptive thinking is left at the provider default. Gemini uses `thinkingLevel: high` and the manufacturer-recommended temperature of 1, since lowering temperature can degrade Gemini 3 reasoning. These are not equivalent randomness controls or compute budgets. Settings are saved in each run; three repetitions measure variability.

Manual connection checks use the same model and structured schema support with a tiny `{ "ok": true }` response, low reasoning effort, at most 2048 output tokens, a 45-second timeout and no retry. This check can cost money, but never creates a benchmark result. Its success confirms small structured generation, not acceptance of every benchmark schema. Confirmations persist per key fingerprint/model/settings; benchmark startup reads them locally with zero probe calls. A credit or access failure later invalidates the confirmation.

## Actionable diagnostics

- [OpenAI API errors](https://developers.openai.com/api/docs/guides/error-codes): inspect nested code/type/message as well as HTTP status; a credit-balance or spend-limit error can be HTTP 429.
- [Anthropic API errors](https://platform.claude.com/docs/en/api/errors): distinguish authentication, permission, invalid requests, rate limits and overloaded service. Low-credit messages receive a billing diagnosis.
- [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting): distinguish invalid keys, permission, unavailable models, quota and temporary service issues.

A generic HTTP 429 is **not proof of an empty balance**. The UI reports quotas/rate limits separately and links to the provider panel. The application does not claim to query a reliable credit balance. Error messages are redacted before storage and browser display.

Pricing is intentionally unfilled until someone verifies the chosen model's current tier. No paid model request was used to author the dataset or the reference labels.
