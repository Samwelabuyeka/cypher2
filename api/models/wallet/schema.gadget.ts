import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "wallet" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "xYl4ruWaRUTA",
  comment:
    "Stores cryptocurrency wallet balances for users across different currencies and blockchain networks. Tracks total balance, available balance for trading, and locked balance in pending orders. Supports multi-chain wallets and transaction activity monitoring.",
  fields: {
    address: { type: "string", storageKey: "TDR0eQmjILvH" },
    availableBalance: {
      type: "number",
      default: 0,
      decimals: 8,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "Mav-BQEGQLbG",
      searchIndex: false,
    },
    balance: {
      type: "number",
      decimals: 8,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
        run: ["validateBalanceConsistency"],
      },
      storageKey: "vFVbwsjkJ9t5",
    },
    currency: {
      type: "string",
      validations: {
        required: true,
        unique: { scopeByField: "user" },
      },
      storageKey: "lNXAJjRX7zV9",
    },
    isActive: {
      type: "boolean",
      default: true,
      validations: { required: true },
      storageKey: "0UolJQR1BGHn",
      searchIndex: false,
    },
    lastTransactionAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "OApfPtwLScvE",
      searchIndex: false,
    },
    lockedBalance: {
      type: "number",
      default: 0,
      decimals: 8,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "zwp587t4OXYF",
      searchIndex: false,
    },
    metadata: {
      type: "json",
      default: "null",
      storageKey: "C6vcvwe-W1NO",
      filterIndex: false,
      searchIndex: false,
    },
    network: { type: "string", storageKey: "5AzSzC15t6Uu" },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "LU4590OkWGJS",
    },
  },
};
