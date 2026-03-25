import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "order" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "oxoiVpWVqWa1",
  comment:
    "Represents a trading order, including its status, details, and associated entities like user, trading account, and strategy.",
  fields: {
    averageFillPrice: { type: "number", storageKey: "4GpIAq5-cG_p" },
    cancelledAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "ZHe2D5-zYs7A",
    },
    exchangeOrderId: { type: "string", storageKey: "CrCHmTxd7bmO" },
    feeCurrency: { type: "string", storageKey: "DP6549YwnLGq" },
    fees: {
      type: "number",
      storageKey: "5uuL8wwB5-_w",
      searchIndex: false,
    },
    filledAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "4EFyKkriwp3L",
    },
    filledQuantity: {
      type: "number",
      default: 0,
      decimals: 8,
      storageKey: "bj3iaVGh66o7",
    },
    metadata: {
      type: "json",
      storageKey: "USry9ZVQD-uM",
      searchIndex: false,
    },
    placedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "-Y3O0qOwTKxT",
    },
    price: {
      type: "number",
      decimals: 8,
      storageKey: "2iehuVan5WWz",
    },
    quantity: {
      type: "number",
      validations: { required: true },
      storageKey: "bG1e8GgG40CZ",
    },
    side: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["buy", "sell"],
      validations: { required: true },
      storageKey: "HFrcudno_CDI",
    },
    status: {
      type: "enum",
      default: "pending",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "pending",
        "open",
        "partially-filled",
        "filled",
        "cancelled",
        "rejected",
        "expired",
      ],
      validations: { required: true },
      storageKey: "UsR4q2Di9Unv",
    },
    stopPrice: { type: "number", storageKey: "ppOdyMGXgKWL" },
    strategy: {
      type: "belongsTo",
      parent: { model: "strategy" },
      storageKey: "z5UedxbFEX01",
    },
    symbol: {
      type: "string",
      validations: { required: true },
      storageKey: "ctL6NCoj1ERZ",
    },
    timeInForce: {
      type: "enum",
      default: "gtc",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["gtc", "ioc", "fok", "day"],
      validations: { required: true },
      storageKey: "BHdvpA7Get-Q",
    },
    tradingAccount: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "tradingAccount" },
      storageKey: "tKn6gnu6bXNV",
    },
    type: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "market",
        "limit",
        "stop-loss",
        "stop-limit",
        "take-profit",
        "trailing-stop",
        "iceberg",
        "twap",
        "vwap",
      ],
      validations: { required: true },
      storageKey: "nx0m6TwFkAKW",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "AlI-RRtIE0ve",
    },
  },
};
