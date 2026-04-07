export interface LocalAIMarketInput {
  symbol: string;
  price: number;
  rsi: number;
  sma20: number;
  sma50: number;
  volumeRatio: number;
  freqtradeAction: "buy" | "sell" | "hold";
  algorithmSnapshot?: Record<string, unknown>;
}

export interface LocalAIMarketBias {
  action: "buy" | "sell" | "hold";
  confidence: number; // 0-100
  reason: string;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function parseBiasResponse(raw: string): LocalAIMarketBias {
  try {
    const parsed = JSON.parse(raw);
    const action = parsed?.action;
    if (action !== "buy" && action !== "sell" && action !== "hold") {
      throw new Error("invalid action");
    }

    return {
      action,
      confidence: clampConfidence(Number(parsed?.confidence ?? 0)),
      reason: String(parsed?.reason ?? "local_ai_no_reason"),
    };
  } catch {
    return {
      action: "hold",
      confidence: 0,
      reason: "local_ai_parse_failed",
    };
  }
}

export async function getLocalAIMarketBias(
  input: LocalAIMarketInput
): Promise<LocalAIMarketBias> {
  if (process.env.CYPHER_ENABLE_LOCAL_AI !== "1") {
    return {
      action: "hold",
      confidence: 0,
      reason: "local_ai_disabled",
    };
  }

  const model = process.env.OLLAMA_MODEL || "llama3.2:3b";
  const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  const endpoint = `${host.replace(/\/$/, "")}/api/generate`;

  const prompt = [
    "You are a trading risk assistant.",
    "Return strict JSON only with keys: action, confidence, reason.",
    "action must be one of buy/sell/hold. confidence must be 0-100.",
    `symbol=${input.symbol}`,
    `price=${input.price}`,
    `rsi=${input.rsi}`,
    `sma20=${input.sma20}`,
    `sma50=${input.sma50}`,
    `volumeRatio=${input.volumeRatio}`,
    `freqtradeAction=${input.freqtradeAction}`,
    `algorithmSnapshot=${JSON.stringify(input.algorithmSnapshot ?? {})}`,
  ].join("\n");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.1 },
      }),
    });

    if (!response.ok) {
      return { action: "hold", confidence: 0, reason: `local_ai_http_${response.status}` };
    }

    const payload = (await response.json()) as { response?: string };
    return parseBiasResponse(payload?.response ?? "");
  } catch {
    return {
      action: "hold",
      confidence: 0,
      reason: "local_ai_unreachable",
    };
  }
}
