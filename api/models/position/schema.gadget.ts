import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "position" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "hfmT5RFqje6M",
  comment:
    "Represents a user's current position in a trading account, including the asset, quantity, and current market value.",
  fields: {
    asset: {
      type: "string",
      validations: { required: true },
      storageKey: "30vmUAD1vv3D",
    },
    averageEntryPrice: {
      type: "number",
      decimals: 8,
      storageKey: "pXzEIlV2mGji",
      searchIndex: false,
    },
    currentPrice: {
      type: "number",
      decimals: 8,
      storageKey: "IqQGdd4Yk0sg",
      searchIndex: false,
    },
    lastUpdatedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "I4CavrZ461pe",
      searchIndex: false,
    },
    leverage: {
      type: "number",
      decimals: 2,
      storageKey: "JGKWDhfjwBL6",
    },
    liquidationPrice: {
      type: "number",
      decimals: 8,
      storageKey: "_INWGf8OVLTs",
      searchIndex: false,
    },
    marginUsed: {
      type: "number",
      decimals: 8,
      storageKey: "z6iuNFVbZ-Ew",
      searchIndex: false,
    },
    marketValue: {
      type: "number",
      decimals: 8,
      storageKey: "CQLIADdwPidP",
      searchIndex: false,
    },
    quantity: {
      type: "number",
      decimals: 8,
      validations: { required: true },
      storageKey: "ms2DAbtlhxFP",
    },
    side: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["long", "short"],
      validations: { required: true },
      storageKey: "YYkS9yIzZ1Fo",
    },
    strategy: {
      type: "belongsTo",
      parent: { model: "strategy" },
      storageKey: "dbYET3-txVnO",
    },
    symbol: {
      type: "string",
      validations: { required: true },
      storageKey: "4DZUdOElA0s8",
    },
    tradingAccount: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "tradingAccount" },
      storageKey: "cn58BNZSnyrq",
    },
    unrealizedPnL: {
      type: "number",
      decimals: 8,
      storageKey: "-AknUrtaDGVm",
      searchIndex: false,
    },
    unrealizedPnLPercent: {
      type: "number",
      decimals: 2,
      storageKey: "jYZRcXalBq73",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "vfEueVUuRI1x",
    },
  },
};
