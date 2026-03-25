import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "walletTransaction" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "xJQAsWfriPAE",
  comment:
    "This model represents a transaction occurring within a user's wallet, capturing details such as transaction type, amount, currency, and status. It serves as an audit trail for all wallet balance changes.",
  fields: {
    amount: {
      type: "number",
      decimals: 8,
      validations: { required: true },
      storageKey: "BFMTYImXoUSJ",
    },
    blockchainTxHash: { type: "string", storageKey: "p-6YfEPufSYb" },
    completedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "eQ6PXj38CdfM",
    },
    currency: {
      type: "string",
      validations: { required: true },
      storageKey: "Ns9E7Ad_3H2L",
    },
    description: {
      type: "string",
      storageKey: "AuppEPrzekb9",
      filterIndex: false,
    },
    errorMessage: {
      type: "string",
      storageKey: "zn17WuCoYqW9",
      filterIndex: false,
      searchIndex: false,
    },
    failedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "bdrpWaf-JOWq",
    },
    fee: { type: "number", decimals: 8, storageKey: "mosulsAoX8e9" },
    fromAddress: { type: "string", storageKey: "HW86Z3ZFAhG4" },
    gatewayTransactionId: {
      type: "string",
      storageKey: "BJPqwyjFEcT5",
    },
    initiatedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "ORtcFYS9OByI",
      searchIndex: false,
    },
    metadata: {
      type: "json",
      storageKey: "g-GrhLDLFP4n",
      filterIndex: false,
      searchIndex: false,
    },
    note: {
      type: "string",
      storageKey: "X50b72KZbuGS",
      filterIndex: false,
    },
    paymentMethod: { type: "string", storageKey: "oDItsIQBMJWJ" },
    relatedTrade: {
      type: "belongsTo",
      parent: { model: "trade" },
      storageKey: "x1r3vIplR0ip",
    },
    status: {
      type: "enum",
      default: "pending",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
        "refunded",
      ],
      validations: { required: true },
      storageKey: "e7XsBy2c4z05",
      searchIndex: false,
    },
    toAddress: { type: "string", storageKey: "asc3VsF1uYva" },
    transactionId: { type: "string", storageKey: "GHRYXN4Xf4av" },
    type: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "deposit",
        "withdrawal",
        "transfer",
        "trade",
        "fee",
        "reward",
        "refund",
      ],
      validations: { required: true },
      storageKey: "ERfkkDw_jgIV",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "Mo9s1U59-dct",
    },
    wallet: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "wallet" },
      storageKey: "uBwm50mVA2cR",
    },
  },
};
