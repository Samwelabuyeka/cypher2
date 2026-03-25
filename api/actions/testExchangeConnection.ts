import { ActionOptions } from "gadget-server";
// @ts-ignore
import ccxt from "ccxt";

export const params = {
  exchangeCode: { type: "string", required: true },
  apiKey: { type: "string", required: true },
  apiSecret: { type: "string", required: true },
  apiPassphrase: { type: "string", required: false },
};

export const run: ActionRun = async ({ params, logger, api }) => {
  const { exchangeCode, apiKey, apiSecret, apiPassphrase } = params;

  try {
    if (!exchangeCode || !apiKey || !apiSecret) {
      return {
        success: false,
        message: "Missing required parameters: exchangeCode, apiKey, and apiSecret are required",
        balance: null,
      };
    }

    const exchangeClass = ccxt[exchangeCode as keyof typeof ccxt];
    if (!exchangeClass || typeof exchangeClass !== "function") {
      return {
        success: false,
        message: `Exchange '${exchangeCode}' is not supported. Please check the exchange code.`,
        balance: null,
      };
    }

    const exchangeConfig: any = {
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      timeout: 10000,
    };

    if (apiPassphrase) {
      exchangeConfig.password = apiPassphrase;
    }

    const exchange = new exchangeClass(exchangeConfig);

    logger.info({ exchangeCode }, "Testing exchange connection");

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Connection timeout after 10 seconds")), 10000);
    });

    const balance = await Promise.race([
      exchange.fetchBalance(),
      timeoutPromise,
    ]) as any;

    logger.info({ exchangeCode }, "Successfully connected to exchange");

    return {
      success: true,
      message: `Successfully connected to ${exchangeCode}`,
      balance: balance.total || balance,
    };
  } catch (error: any) {
    logger.error({ error, exchangeCode }, "Failed to connect to exchange");

    let errorMessage = "Failed to connect to exchange";
    
    if (error.message?.includes("timeout")) {
      errorMessage = "Connection timeout - please check your network connection";
    } else if (error.message?.includes("Invalid API")) {
      errorMessage = "Invalid API credentials - please check your API key and secret";
    } else if (error.message?.includes("Authentication")) {
      errorMessage = "Authentication failed - please verify your API credentials";
    } else if (error.message?.includes("IP")) {
      errorMessage = "IP address not whitelisted - please add your IP to the exchange whitelist";
    } else if (error.message?.includes("permission")) {
      errorMessage = "API key does not have sufficient permissions";
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      message: errorMessage,
      balance: null,
    };
  }
};

export const options: ActionOptions = {
  timeoutMS: 15000,
};
