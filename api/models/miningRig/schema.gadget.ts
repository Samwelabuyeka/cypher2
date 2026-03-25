import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "miningRig" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "qlEZz6PoUVWV",
  comment:
    "Represents a mining hardware rig (GPU, ASIC, CPU, or FPGA) owned by a user. Tracks real-time mining performance metrics like hashrate, temperature, and operational status. Used to monitor mining operations, configure pool connections, and aggregate profitability data.",
  fields: {
    algorithm: { type: "string", storageKey: "HpKnLci7BaV-" },
    coin: { type: "string", storageKey: "UsMp28vJak8m" },
    configuration: {
      type: "json",
      storageKey: "GNu9KDyi2qsN",
      filterIndex: false,
      searchIndex: false,
    },
    hardware: {
      type: "json",
      storageKey: "5UozncJNU1Mw",
      filterIndex: false,
      searchIndex: false,
    },
    hashrate: {
      type: "number",
      decimals: 2,
      storageKey: "j4ASwFxjxfvF",
      searchIndex: false,
    },
    hashrateUnit: { type: "string", storageKey: "MlOOq6wFBbIo" },
    ipAddress: { type: "string", storageKey: "19SptlBIpRx9" },
    isActive: {
      type: "boolean",
      default: false,
      storageKey: "n2qeUHHNmsjc",
      searchIndex: false,
    },
    lastSeenAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "D6jPLpbWQ_JR",
      searchIndex: false,
    },
    location: { type: "string", storageKey: "I04-ls-8lRyq" },
    name: {
      type: "string",
      validations: { required: true },
      storageKey: "Sbh4yQ1WUJP4",
    },
    poolUrl: {
      type: "string",
      storageKey: "IZjqxn7GVcxq",
      filterIndex: false,
      searchIndex: false,
    },
    poolUsername: { type: "string", storageKey: "i9ihSSRRyjJm" },
    powerConsumption: {
      type: "number",
      decimals: 2,
      storageKey: "xvQSlyIkJAxw",
      searchIndex: false,
    },
    status: {
      type: "enum",
      default: "offline",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["offline", "idle", "mining", "error", "maintenance"],
      storageKey: "byMf0yOB2n17",
      searchIndex: false,
    },
    temperature: {
      type: "number",
      decimals: 2,
      storageKey: "I5HReqllBvYq",
      searchIndex: false,
    },
    type: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["gpu", "asic", "cpu", "fpga"],
      validations: { required: true },
      storageKey: "Y-KmbM-LQdLs",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "Gx7NZn6iajKJ",
    },
  },
};
