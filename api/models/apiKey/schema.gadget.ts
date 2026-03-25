import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "apiKey" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "Kr3ffZj26H-m",
  comment:
    "Model for user-generated API keys, used for programmatic access to the application.",
  fields: {
    allowedIps: {
      type: "json",
      storageKey: "8k5Uzdfour3W",
      filterIndex: false,
      searchIndex: false,
    },
    expiresAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "yswfaM6Lozsc",
      searchIndex: false,
    },
    isActive: {
      type: "boolean",
      default: true,
      validations: { required: true },
      storageKey: "k6llbkgAxSJL",
      searchIndex: false,
    },
    keyHash: {
      type: "encryptedString",
      validations: { required: true },
      storageKey: "Dz5EBOBmIksk",
    },
    keyPreview: {
      type: "string",
      validations: { required: true },
      storageKey: "DJ5f4pt4gfJj",
      filterIndex: false,
    },
    lastUsedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "0y8Y2QagbrMG",
      searchIndex: false,
    },
    lastUsedIp: { type: "string", storageKey: "8Nd2Nx8HoFfw" },
    metadata: {
      type: "json",
      storageKey: "lsw6oUVZBbNv",
      filterIndex: false,
      searchIndex: false,
    },
    name: {
      type: "string",
      validations: { required: true },
      storageKey: "ieXbqYEBUfTc",
    },
    permissions: {
      type: "json",
      default: "[]",
      validations: { required: true },
      storageKey: "pzttl1sXYtru",
      searchIndex: false,
    },
    rateLimit: {
      type: "number",
      decimals: 0,
      storageKey: "9fZP89NhWiVN",
      searchIndex: false,
    },
    usageCount: {
      type: "number",
      default: 0,
      decimals: 0,
      validations: {
        required: true,
        numberRange: { min: 0, max: null },
      },
      storageKey: "YatF6iHrlbAW",
      searchIndex: false,
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "HD5lxwNKJLj2",
    },
  },
};
