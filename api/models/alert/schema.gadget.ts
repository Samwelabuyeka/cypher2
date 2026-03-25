import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "alert" model, go to https://cypher.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "RSElLzV7_vId",
  comment:
    "Represents a risk alert or notification sent to a user, containing details about the alert type, severity, and related model or record.",
  fields: {
    acknowledgedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "W5o9BNyWQSaq",
      searchIndex: false,
    },
    isRead: {
      type: "boolean",
      default: false,
      storageKey: "OdY3rOLau0ah",
      searchIndex: false,
    },
    isResolved: {
      type: "boolean",
      default: false,
      storageKey: "BIejMyIj2mOD",
    },
    message: {
      type: "richText",
      validations: { required: true },
      storageKey: "h7JrubEDFmD4",
    },
    metadata: {
      type: "json",
      storageKey: "J92vSWxPq3hL",
      filterIndex: false,
      searchIndex: false,
    },
    notificationSent: {
      type: "boolean",
      default: false,
      storageKey: "02tOEV03RjGp",
    },
    relatedId: { type: "string", storageKey: "dOjp0SkVuXp9" },
    relatedModel: { type: "string", storageKey: "K6cEr8IF7yT8" },
    resolvedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "v3lvZaeRDyZ_",
    },
    severity: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["info", "warning", "critical"],
      validations: { required: true },
      storageKey: "oS3psCmmNY0Y",
    },
    title: {
      type: "string",
      validations: { required: true },
      storageKey: "ol8VxmbK74Jy",
    },
    triggeredAt: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "HsQE9dsx3x6a",
    },
    type: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "risk-limit-breach",
        "position-liquidation-warning",
        "strategy-stopped",
        "large-drawdown",
        "rig-offline",
        "temperature-warning",
        "profit-target",
        "loss-limit",
        "price-alert",
        "system-error",
      ],
      validations: { required: true },
      storageKey: "PdqnRcHSm9Ug",
    },
    user: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "user" },
      storageKey: "-C4_XBuDMKSD",
    },
  },
};
