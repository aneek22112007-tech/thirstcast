# agent/ (PD tasks): ThirstCast agent package

Entry point: `thirstcast_agent.handler_core.handle_ask(question, district=None, repo=None, mode="llm") -> dict`
(POST /ask shape). Deployed by `sam build` as the `AgentLayer` (`/opt/python/thirstcast_agent`, `/opt/python/prompts`);
the thin Lambda handler is `backend/functions/agent/app.py`.

| File | What |
|---|---|
| `thirstcast_agent/tools.py` | data functions + 4 Strands `@tool`s: `get_status`, `get_forecast`, `water_gap`, `compare_with_heat` (numbers only from the Repo + `thirstcast_core`) |
| `thirstcast_agent/agent.py` | `get_model()` (MODEL_PROVIDER `bedrock`/`none`), `build_agent()` |
| `thirstcast_agent/handler_core.py` | `handle_ask`: LLM with a time budget; any error/timeout → template |
| `thirstcast_agent/fallback.py` | English + Hindi template advisories (ACTIVE / WATCH / NONE / unknown district / no data / water gap / heat / lakes) |
| `thirstcast_agent/lang.py` | Devanagari detection, district/crop aliases (EN + HI), acres parser |
| `prompts/system_prompt.md` | the rules: tool output only, ranges, user's language, no certainty, caveat |
| `tests/questions.yaml`, `tests/run_eval.py` | 12 English + 11 Hindi eval questions |

Env vars: `MODEL_PROVIDER` (`bedrock` | `none`), `MODEL_ID`, `ASK_MODE` (`llm` | `template` kill switch),
`MAX_TOKENS` (400), `TEMPERATURE` (0.2), `AGENT_TIME_BUDGET_S` (20), `BEDROCK_READ_TIMEOUT` (18), `BEDROCK_REGION`
(optional; defaults to the Lambda region).

```bash
pip install -r agent/requirements.txt pyyaml pytest
python -m pytest agent/tests -q                        # no AWS, no model calls
MODEL_PROVIDER=none python agent/tests/run_eval.py      # template mode, fixtures -> must be 100%
python agent/tests/run_eval.py --url "$ApiUrl/ask"      # live (batch only)
```
Fixtures in `tests/fixtures/status/` are the historical mock statuses (5 Oct 2023), not live data.
**Hindi templates need a proofread by a fluent speaker before the demo.**
