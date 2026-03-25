import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "exchange" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "wx-vgIr0do_W",
  comment:
    "Configuration for a cryptocurrency exchange, including its name, code, and operational status.",
  fields: {
    apiEndpoint: { type: "url", storageKey: "SKvvtjRk7vOJ" },
    code: {
      type: "string",
      validations: { required: true, unique: true },
      storageKey: "huFL-6whOUj8",
    },
    feeStructure: {
      type: "json",
      storageKey: "n5XnH4GwjcZP",
      searchIndex: false,
    },
    isActive: {
      type: "boolean",
      default: true,
      storageKey: "aWtwlblkbmQi",
    },
    name: {
      type: "string",
      validations: { required: true },
      storageKey: "DVStpRnQvZog",
    },
    rateLimits: {
      type: "json",
      storageKey: "6WMdTBGm0PRq",
      searchIndex: false,
    },
    supportedFeatures: {
      type: "json",
      storageKey: "hQM9ABVVmOaL",
      searchIndex: false,
    },
    websocketEndpoint: { type: "url", storageKey: "hJhW_xxOoqjw" },
  },
};
