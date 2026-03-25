import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "cypherTransaction" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "cQsIrli58SSl",
  comment:
    "Model for tracking CypherCoin transactions, including details about the transaction, its status, and the user who initiated it.",
  fields: {
    amount: {
      type: "number",
      decimals: 8,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "Ja_4pUZF62S-",
    },
    blockHash: { type: "string", storageKey: "ryiFXLoEGUPU" },
    blockNumber: {
      type: "number",
      decimals: 0,
      storageKey: "0KRLMnMA1U0b",
    },
    confirmations: {
      type: "number",
      default: 0,
      decimals: 0,
      validations: { numberRange: { min: 0, max: null } },
      storageKey: "JgMm6rm28nBb",
    },
    fee: {
      type: "number",
      decimals: 8,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "c6W_nmWfjF0S",
    },
    fromAddress: {
      type: "string",
      validations: { required: true, run: ["validateFromToAddress"] },
      storageKey: "loPztyXie0NV",
    },
    gasUsed: {
      type: "number",
      decimals: 0,
      storageKey: "j20UQBabuCyp",
      searchIndex: false,
    },
    hash: {
      type: "string",
      validations: { required: true, unique: true },
      storageKey: "IqcUI1ZRZzzQ",
    },
    metadata: { type: "json", storageKey: "-prknBych9NV" },
    nonce: {
      type: "number",
      decimals: 0,
      storageKey: "VE1pUdptjN6_",
      searchIndex: false,
    },
    signature: { type: "string", storageKey: "-VmpPtqu-Igv" },
    status: {
      type: "enum",
      default: "pending",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["pending", "confirmed", "failed"],
      validations: { required: true },
      storageKey: "XNKIMoZ1ZGQR",
    },
    toAddress: {
      type: "string",
      validations: { required: true, run: ["validateFromToAddress"] },
      storageKey: "CYPN0SRUZAZ7",
    },
    transactionType: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "transfer",
        "mining_reward",
        "staking_reward",
        "burn",
        "fee_collection",
      ],
      validations: { required: true },
      storageKey: "5TilA3-gTd1A",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "Hv4jP8u38J8u",
    },
  },
};
