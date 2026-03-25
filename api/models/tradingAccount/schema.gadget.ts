import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "tradingAccount" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "dJczVw7xyQEg",
  comment:
    "This model represents a user's trading account on different exchanges, storing sensitive information like API keys and account balances.",
  fields: {
    accountName: {
      type: "string",
      validations: { required: true },
      storageKey: "eivgCH_hjqtb",
    },
    apiKey: { type: "encryptedString", storageKey: "zOkGb7YlydBT" },
    apiPassphrase: {
      type: "encryptedString",
      storageKey: "PU3AYyCeVuoO",
    },
    apiSecret: {
      type: "encryptedString",
      storageKey: "UW8_M81nttac",
    },
    balance: {
      type: "json",
      storageKey: "JoB_Pzj6tKWt",
      searchIndex: false,
    },
    exchange: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "exchange" },
      storageKey: "Fy6X8W8TY_vM",
    },
    isActive: {
      type: "boolean",
      default: true,
      storageKey: "DMAvwL0HM2_-",
    },
    isPaperTrading: {
      type: "boolean",
      default: false,
      storageKey: "Ogpz9tPOP5ti",
    },
    lastSyncedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "dNRfdLD-HoZY",
      searchIndex: false,
    },
    riskLimits: {
      type: "json",
      storageKey: "pJaGpITseujG",
      filterIndex: false,
      searchIndex: false,
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "pINUN3TOo51C",
    },
  },
};
