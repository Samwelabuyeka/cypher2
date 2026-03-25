import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "trade" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "_tpDKXg2e25r",
  comment:
    "Stores executed trades with complete audit trail including execution details, fees, and P&L. Trades are immutable after creation and linked to trading accounts, strategies, and orders. Each trade captures the full execution context for reconciliation and performance analysis.",
  fields: {
    exchangeTradeId: { type: "string", storageKey: "Qtfa3HufFCh9" },
    executedAt: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "ygqSsPojbgaT",
    },
    fee: {
      type: "number",
      validations: { required: true },
      storageKey: "VhijDnOC7CHW",
    },
    feeCurrency: { type: "string", storageKey: "fyASQN4LHvKJ" },
    isMaker: {
      type: "boolean",
      storageKey: "l5YCA7i72KA5",
      searchIndex: false,
    },
    metadata: {
      type: "json",
      storageKey: "X8L0V2HpjMEB",
      filterIndex: false,
      searchIndex: false,
    },
    order: {
      type: "belongsTo",
      parent: { model: "order" },
      storageKey: "kmV_nl194Fpp",
    },
    price: {
      type: "number",
      decimals: 8,
      validations: { required: true },
      storageKey: "eKfF2f8NH_nN",
    },
    quantity: {
      type: "number",
      validations: { required: true },
      storageKey: "AJ8f1_oH6_wQ",
    },
    realizedPnL: { type: "number", storageKey: "Vg1nQM6WK3Aw" },
    side: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["buy", "sell"],
      validations: { required: true },
      storageKey: "qTCGCTyf0d4R",
    },
    strategy: {
      type: "belongsTo",
      parent: { model: "strategy" },
      storageKey: "NevqFAjH_Ooi",
    },
    symbol: {
      type: "string",
      validations: { required: true },
      storageKey: "C3rvG6LXcItY",
    },
    tradingAccount: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "tradingAccount" },
      storageKey: "Vx-G1oTzMvoA",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "JR-Q9ZFbi_il",
    },
    value: {
      type: "number",
      validations: { required: true },
      storageKey: "4OnVp2MPC_6Y",
    },
  },
};
