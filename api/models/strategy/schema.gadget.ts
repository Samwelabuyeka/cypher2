import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "strategy" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "KsrD2zkH2bZ7",
  comment:
    "Data model storing user-defined trading strategy configurations. Each strategy defines a specific trading approach (market-making, arbitrage, etc.) with configurable parameters, target assets, and risk settings. Users manage their own strategies across different lifecycle stages from draft through live trading. Includes status tracking and risk level classification for portfolio oversight.",
  fields: {
    assets: { type: "json", storageKey: "fCLW1_YpI8Q2" },
    description: {
      type: "richText",
      storageKey: "9C4jYSyJj5r0",
      filterIndex: false,
    },
    isActive: {
      type: "boolean",
      default: false,
      storageKey: "O15XZjb1snnj",
    },
    maxPositionSize: {
      type: "number",
      decimals: 2,
      storageKey: "U4v4a2419LBL",
      searchIndex: false,
    },
    name: {
      type: "string",
      validations: { required: true, unique: true },
      storageKey: "HMFk_WlRCg-y",
    },
    parameters: {
      type: "json",
      validations: { required: true },
      storageKey: "YEEixzIG3EfS",
      filterIndex: false,
      searchIndex: false,
    },
    riskLevel: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["conservative", "moderate", "aggressive"],
      storageKey: "yoD7AXrCAzyI",
    },
    status: {
      type: "enum",
      default: "draft",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "draft",
        "backtesting",
        "paper-trading",
        "live",
        "paused",
        "archived",
      ],
      storageKey: "lHArN7hxixDQ",
    },
    type: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "market-making",
        "arbitrage",
        "statistical-arbitrage",
        "trend-following",
        "mean-reversion",
        "momentum",
        "scalping",
        "delta-hedging",
        "liquidity-provision",
        "custom",
      ],
      validations: { required: true },
      storageKey: "OD8ukQI6zuju",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "hhMkaOJrKQdl",
    },
  },
};
